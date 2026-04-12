/**
 * REPL integration hook for `claude ssh` sessions.
 *
 * Sibling to useDirectConnect — same shape (isRemoteMode/sendMessage/
 * cancelRequest/disconnect), same REPL wiring, but drives an SSH child
 * process instead of a WebSocket. Kept separate rather than generalizing
 * useDirectConnect because the lifecycle differs: the ssh process and auth
 * proxy are created BEFORE this hook runs (during startup, in main.tsx) and
 * handed in; useDirectConnect creates its WebSocket inside the effect.
 */

import { randomUUID } from 'crypto'
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import {
  applyRemotePermissionAssistantFields,
  createRemotePermissionPayload,
  createToolStub,
} from '../remote/remotePermissionBridge.js'
import { createAssistantMessageFromSyntheticPayload } from '../services/api/assistantEnvelope.js'
import {
  convertSDKMessage,
  isSessionEndMessage,
} from '../remote/sdkMessageAdapter.js'
import type { SDKControlPermissionRequest } from '../entrypoints/sdk/controlTypes.js'
import type { RemotePermissionResponse } from '../remote/RemoteSessionManager.js'
import type { Tool } from '../Tool.js'
import { findToolByName } from '../Tool.js'
import type { Message as MessageType } from '../types/message.js'
import type { PermissionAskDecision } from '../types/permissions.js'
import type { PermissionUpdate } from '../utils/permissions/PermissionUpdateSchema.js'
import { logForDebugging } from '../utils/debug.js'
import { gracefulShutdown } from '../utils/gracefulShutdown.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'

type SSHSessionManagerLike = {
  connect(): void
  disconnect(): void
  sendMessage(content: RemoteMessageContent): Promise<boolean>
  sendInterrupt(): void
  respondToPermissionRequest(
    requestId: string,
    result: RemotePermissionResponse,
  ): void
}

type SSHSessionLike = {
  remoteCwd?: string
  proc: { exitCode: number | null; signalCode: string | null }
  proxy: { stop(): void }
  getStderrTail(): string
  createManager(callbacks: {
    onMessage: (sdkMessage: import('../entrypoints/agentSdkTypes.js').SDKMessage) => void
    onPermissionRequest: (
      request: SDKControlPermissionRequest,
      requestId: string,
    ) => void
    onPermissionCancelled?: (
      requestId: string,
      toolUseId: string | undefined,
    ) => void
    onConnected?: () => void
    onReconnecting?: (attempt: number, max: number) => void
    onDisconnected?: () => void
    onError?: (error: Error) => void
  }): SSHSessionManagerLike
}

type UseSSHSessionResult = {
  isRemoteMode: boolean
  sendMessage: (content: RemoteMessageContent) => Promise<boolean>
  cancelRequest: () => void
  disconnect: () => void
}

type UseSSHSessionProps = {
  session: SSHSessionLike | undefined
  setMessages: Dispatch<SetStateAction<MessageType[]>>
  setIsLoading: (loading: boolean) => void
  setToolUseConfirmQueue: Dispatch<SetStateAction<ToolUseConfirm[]>>
  tools: Tool[]
}

export function useSSHSession({
  session,
  setMessages,
  setIsLoading,
  setToolUseConfirmQueue,
  tools,
}: UseSSHSessionProps): UseSSHSessionResult {
  const isRemoteMode = !!session

  const managerRef = useRef<SSHSessionManagerLike | null>(null)
  const hasReceivedInitRef = useRef(false)
  const isConnectedRef = useRef(false)

  const toolsRef = useRef(tools)
  useEffect(() => {
    toolsRef.current = tools
  }, [tools])

  useEffect(() => {
    if (!session) return

    const removePermissionPrompt = (
      toolUseId: string | undefined,
      requestId: string,
    ) => {
      const idToRemove = toolUseId ?? requestId
      setToolUseConfirmQueue(queue =>
        queue.filter(item => item.toolUseID !== idToRemove),
      )
    }
    const clearPermissionPrompts = () => {
      setToolUseConfirmQueue(queue => (queue.length > 0 ? [] : queue))
    }

    hasReceivedInitRef.current = false
    logForDebugging('[useSSHSession] wiring SSH session manager')

    const manager = session.createManager({
      onMessage: sdkMessage => {
        if (isSessionEndMessage(sdkMessage)) {
          setIsLoading(false)
        }

        // Skip duplicate init messages (one per turn from stream-json mode).
        if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
          if (hasReceivedInitRef.current) return
          hasReceivedInitRef.current = true
        }

        const converted = convertSDKMessage(sdkMessage, {
          convertToolResults: true,
        })
        if (converted.type === 'message') {
          setMessages(prev => [...prev, converted.message])
        }
      },
      onPermissionRequest: (request, requestId) => {
        logForDebugging(
          `[useSSHSession] permission request: ${request.tool_name}`,
        )

        const tool =
          findToolByName(toolsRef.current, request.tool_name) ??
          createToolStub(request.tool_name)

        const syntheticMessage = applyRemotePermissionAssistantFields(
          createAssistantMessageFromSyntheticPayload(
            createRemotePermissionPayload(request),
          ),
          requestId,
        )

        const permissionResult: PermissionAskDecision = {
          behavior: 'ask',
          message:
            request.description ?? `${request.tool_name} requires permission`,
          suggestions: request.permission_suggestions as PermissionAskDecision['suggestions'],
          blockedPath: request.blocked_path,
        }

        const toolUseConfirm: ToolUseConfirm = {
          assistantMessage: syntheticMessage,
          tool,
          description:
            request.description ?? `${request.tool_name} requires permission`,
          input: request.input,
          toolUseContext: {} as ToolUseConfirm['toolUseContext'],
          toolUseID: request.tool_use_id,
          permissionResult,
          permissionPromptStartTimeMs: Date.now(),
          onUserInteraction() {},
          onAbort() {
            manager.respondToPermissionRequest(requestId, {
              behavior: 'deny',
              message: 'User aborted',
            })
            removePermissionPrompt(request.tool_use_id, requestId)
          },
          onReject(feedback) {
            manager.respondToPermissionRequest(requestId, {
              behavior: 'deny',
              message: feedback ?? 'User denied permission',
            })
            removePermissionPrompt(request.tool_use_id, requestId)
          },
          onAllow(updatedInput, _permissionUpdates: PermissionUpdate[]) {
            manager.respondToPermissionRequest(requestId, {
              behavior: 'allow',
              updatedInput,
            })
            removePermissionPrompt(request.tool_use_id, requestId)
            setIsLoading(true)
          },
          async recheckPermission() {},
        }

        setToolUseConfirmQueue(q => [...q, toolUseConfirm])
        setIsLoading(false)
      },
      onPermissionCancelled: (requestId, toolUseId) => {
        logForDebugging(
          `[useSSHSession] permission request cancelled: ${requestId}`,
        )
        removePermissionPrompt(toolUseId, requestId)
        setIsLoading(true)
      },
      onConnected: () => {
        logForDebugging('[useSSHSession] connected')
        isConnectedRef.current = true
      },
      onReconnecting: (attempt, max) => {
        logForDebugging(
          `[useSSHSession] ssh dropped, reconnecting (${attempt}/${max})`,
        )
        isConnectedRef.current = false
        // Surface a transient system message in the transcript so the user
        // knows what's happening — the next onConnected clears the state.
        // Any in-flight request is lost; the remote's --continue reloads
        // history but there's no turn in progress to resume.
        clearPermissionPrompts()
        setIsLoading(false)
        const msg: MessageType = {
          type: 'system',
          subtype: 'informational',
          content: `SSH connection dropped — reconnecting (attempt ${attempt}/${max})...`,
          timestamp: new Date().toISOString(),
          uuid: randomUUID(),
          level: 'warning',
        }
        setMessages(prev => [...prev, msg])
      },
      onDisconnected: () => {
        logForDebugging('[useSSHSession] ssh process exited (giving up)')
        const stderr = session.getStderrTail().trim()
        const connected = isConnectedRef.current
        const exitCode = session.proc.exitCode
        isConnectedRef.current = false
        clearPermissionPrompts()
        setIsLoading(false)

        let msg = connected
          ? 'Remote session ended.'
          : 'SSH session failed before connecting.'
        // Surface remote stderr if it looks like an error (pre-connect always,
        // post-connect only on nonzero exit — normal --verbose noise otherwise).
        if (stderr && (!connected || exitCode !== 0)) {
          msg += `\nRemote stderr (exit ${exitCode ?? 'signal ' + session.proc.signalCode}):\n${stderr}`
        }
        void gracefulShutdown(1, 'other', { finalMessage: msg })
      },
      onError: error => {
        logForDebugging(`[useSSHSession] error: ${error.message}`)
      },
    })

    managerRef.current = manager
    manager.connect()

    return () => {
      logForDebugging('[useSSHSession] cleanup')
      manager.disconnect()
      session.proxy.stop()
      clearPermissionPrompts()
      managerRef.current = null
    }
  }, [session, setMessages, setIsLoading, setToolUseConfirmQueue])

  const sendMessage = useCallback(
    async (content: RemoteMessageContent): Promise<boolean> => {
      const m = managerRef.current
      if (!m) return false
      setIsLoading(true)
      return m.sendMessage(content)
    },
    [setIsLoading],
  )

  const cancelRequest = useCallback(() => {
    managerRef.current?.sendInterrupt()
    setIsLoading(false)
  }, [setIsLoading])

  const disconnect = useCallback(() => {
    managerRef.current?.disconnect()
    managerRef.current = null
    isConnectedRef.current = false
  }, [])

  return useMemo(
    () => ({ isRemoteMode, sendMessage, cancelRequest, disconnect }),
    [isRemoteMode, sendMessage, cancelRequest, disconnect],
  )
}
