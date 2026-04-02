import { getSessionId } from '../../bootstrap/state.js'
import { shouldSendCodexRequestIdentity } from '../../utils/codexConfig.js'
import { getCwd } from '../../utils/cwd.js'
import { getClaudeCodeUserAgent } from '../../utils/userAgent.js'

export type CodexRequestIdentity = {
  headers: {
    'user-agent': string
    'x-claude-code-session-id'?: string
  }
  metadata?: {
    session_id: string
    workspace: string
    originator: 'claude-code'
    user_agent: string
  }
}

export function buildCodexRequestIdentity(): CodexRequestIdentity {
  const sessionId = getSessionId()
  const userAgent = getClaudeCodeUserAgent()
  const includeRequestIdentity = shouldSendCodexRequestIdentity()

  return {
    headers: {
      'user-agent': userAgent,
      ...(includeRequestIdentity
        ? { 'x-claude-code-session-id': sessionId }
        : {}),
    },
    ...(includeRequestIdentity
      ? {
          metadata: {
            session_id: sessionId,
            workspace: getCwd(),
            originator: 'claude-code',
            user_agent: userAgent,
          },
        }
      : {}),
  }
}
