import React, { useMemo } from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import { useElapsedTime } from '../../hooks/useElapsedTime.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { Box, Text, useTheme } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { getTools } from '../../tools.js'
import { formatNumber } from '../../utils/format.js'
import { extractTag } from '../../utils/messages.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import { UserPlanMessage } from '../messages/UserPlanMessage.js'
import { renderToolActivity } from './renderToolActivity.js'
import { getTaskStatusColor, getTaskStatusIcon } from './taskStatusUtils.js'

type Props = {
  agent: DeepImmutable<LocalAgentTaskState>
  onDone: () => void
  onKillAgent?: () => void
  onBack?: () => void
}

export function AsyncAgentDetailDialog({
  agent,
  onDone,
  onKillAgent,
  onBack,
}: Props): React.ReactNode {
  const [theme] = useTheme()
  const tools = useMemo(
    () => getTools(getEmptyToolPermissionContext()),
    [],
  )

  const elapsedTime = useElapsedTime(
    agent.startTime,
    agent.status === 'running',
    1000,
    agent.totalPausedMs ?? 0,
  )

  useKeybindings(
    {
      'confirm:yes': onDone,
    },
    { context: 'Confirmation' },
  )

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault()
      onDone()
    } else if (e.key === 'left' && onBack) {
      e.preventDefault()
      onBack()
    } else if (
      e.key === 'x' &&
      agent.status === 'running' &&
      onKillAgent
    ) {
      e.preventDefault()
      onKillAgent()
    }
  }

  const planContent = extractTag(agent.prompt, 'plan')
  const displayPrompt =
    agent.prompt.length > 300
      ? `${agent.prompt.substring(0, 297)}...`
      : agent.prompt

  const tokenCount = agent.result?.totalTokens ?? agent.progress?.tokenCount
  const toolUseCount =
    agent.result?.totalToolUseCount ?? agent.progress?.toolUseCount

  const title = (
    <Text>
      {agent.selectedAgent?.agentType ?? 'agent'} {'>'} 
      {agent.description || 'Async agent'}
    </Text>
  )

  const subtitle = (
    <Text>
      {agent.status !== 'running' && (
        <Text color={getTaskStatusColor(agent.status)}>
          {getTaskStatusIcon(agent.status)}{' '}
          {agent.status === 'completed'
            ? 'Completed'
            : agent.status === 'failed'
              ? 'Failed'
              : 'Stopped'}{' '}
          {'· '}
        </Text>
      )}
      <Text dimColor>
        {elapsedTime}
        {tokenCount !== undefined && tokenCount > 0 && (
          <> · {formatNumber(tokenCount)} tokens</>
        )}
        {toolUseCount !== undefined && toolUseCount > 0 && (
          <>
            {' '}
            · {toolUseCount} {toolUseCount === 1 ? 'tool' : 'tools'}
          </>
        )}
      </Text>
    </Text>
  )

  return (
    <Box
      flexDirection="column"
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      <Dialog
        title={title}
        subtitle={subtitle}
        onCancel={onDone}
        color="background"
        inputGuide={exitState =>
          exitState.pending ? (
            <Text>Press {exitState.keyName} again to exit</Text>
          ) : (
            <Byline>
              {onBack && (
                <KeyboardShortcutHint shortcut="←" action="go back" />
              )}
              <KeyboardShortcutHint
                shortcut="Esc/Enter/Space"
                action="close"
              />
              {agent.status === 'running' && onKillAgent && (
                <KeyboardShortcutHint shortcut="x" action="stop" />
              )}
            </Byline>
          )
        }
      >
        <Box flexDirection="column">
          {agent.status === 'running' &&
            agent.progress?.recentActivities &&
            agent.progress.recentActivities.length > 0 && (
              <Box flexDirection="column">
                <Text bold dimColor>
                  Progress
                </Text>
                {agent.progress.recentActivities.map((activity, i) => (
                  <Text
                    key={i}
                    dimColor={
                      i < agent.progress!.recentActivities!.length - 1
                    }
                    wrap="truncate-end"
                  >
                    {i === agent.progress!.recentActivities!.length - 1
                      ? '› '
                      : '  '}
                    {renderToolActivity(activity, tools, theme)}
                  </Text>
                ))}
              </Box>
            )}

          {planContent ? (
            <Box marginTop={1}>
              <UserPlanMessage addMargin={false} planContent={planContent} />
            </Box>
          ) : (
            <Box flexDirection="column" marginTop={1}>
              <Text bold dimColor>
                Prompt
              </Text>
              <Text wrap="wrap">{displayPrompt}</Text>
            </Box>
          )}

          {agent.status === 'completed' &&
            agent.result?.content &&
            agent.result.content.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                <Text color="success" bold>
                  Response
                </Text>
                {agent.result.content.map((block, index) => (
                  <Box key={index} paddingLeft={2} marginTop={index === 0 ? 1 : 0}>
                    <Text wrap="wrap">{block.text}</Text>
                  </Box>
                ))}
              </Box>
            )}

          {agent.status === 'failed' && agent.error && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="error">
                Error
              </Text>
              <Text color="error" wrap="wrap">
                {agent.error}
              </Text>
            </Box>
          )}
        </Box>
      </Dialog>
    </Box>
  )
}
