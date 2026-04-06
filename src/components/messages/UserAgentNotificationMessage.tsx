import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import {
  OUTPUT_FILE_TAG,
  SESSION_ID_TAG,
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_TYPE_TAG,
  TRANSCRIPT_PATH_TAG,
  WORKTREE_BRANCH_TAG,
  WORKTREE_PATH_TAG,
} from '../../constants/xml.js'
import { BLACK_CIRCLE } from '../../constants/figures.js'
import { Box, Text, type TextProps } from '../../ink.js'
import { asAgentId } from '../../types/ids.js'
import { getAgentTranscriptPath } from '../../utils/sessionStorage.js'
import { extractTag } from '../../utils/messages.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
  isTranscriptMode?: boolean
}

function getStatusColor(status: string | null): TextProps['color'] {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'killed':
      return 'warning'
    default:
      return 'text'
  }
}

export function UserAgentNotificationMessage({
  addMargin,
  param: { text },
  isTranscriptMode,
}: Props): React.ReactNode {
  const summary = extractTag(text, SUMMARY_TAG)
  if (!summary) return null

  const status = extractTag(text, STATUS_TAG)
  const result = extractTag(text, 'result')?.trim()
  const taskId = extractTag(text, TASK_ID_TAG)
  const taskType = extractTag(text, TASK_TYPE_TAG)
  const outputFile = extractTag(text, OUTPUT_FILE_TAG)
  const sessionId = extractTag(text, SESSION_ID_TAG)
  const transcriptPath =
    extractTag(text, TRANSCRIPT_PATH_TAG) ??
    (taskType === 'local_agent' && taskId
      ? getAgentTranscriptPath(asAgentId(taskId))
      : null)
  const worktreePath = extractTag(text, WORKTREE_PATH_TAG)
  const worktreeBranch = extractTag(text, WORKTREE_BRANCH_TAG)
  const color = getStatusColor(status)
  const hasMetadata =
    Boolean(taskId) ||
    Boolean(taskType) ||
    Boolean(outputFile) ||
    Boolean(transcriptPath) ||
    Boolean(sessionId) ||
    Boolean(worktreePath)

  return (
    <Box marginTop={addMargin ? 1 : 0} flexDirection="column">
      <Text>
        <Text color={color}>{BLACK_CIRCLE}</Text> {summary}
      </Text>
      {isTranscriptMode && hasMetadata ? (
        <Box paddingLeft={2} marginTop={1} flexDirection="column">
          {taskId || taskType ? (
            <Text dimColor wrap="wrap">
              Task: {taskId ?? 'unknown'}
              {taskType ? ` · ${taskType}` : ''}
            </Text>
          ) : null}
          {sessionId ? (
            <Text dimColor wrap="wrap">
              Session: {sessionId}
            </Text>
          ) : null}
          {outputFile ? (
            <Text dimColor wrap="wrap">
              Output file: {outputFile}
            </Text>
          ) : null}
          {transcriptPath ? (
            <Text dimColor wrap="wrap">
              Transcript: {transcriptPath}
            </Text>
          ) : null}
          {worktreePath ? (
            <Text dimColor wrap="wrap">
              Worktree: {worktreePath}
              {worktreeBranch ? ` · ${worktreeBranch}` : ''}
            </Text>
          ) : null}
        </Box>
      ) : null}
      {result ? (
        <Box paddingLeft={2} marginTop={1} flexDirection="column">
          <Text color="success" bold>
            Response:
          </Text>
          <Box paddingLeft={2} marginTop={1}>
            <Text wrap="wrap">{result}</Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}
