import * as React from 'react'
import { Box, Text } from '../ink.js'
import { formatNumber } from '../utils/format.js'
import type { Theme } from '../utils/theme.js'

type Props = {
  agentType: string
  description?: string
  name?: string
  descriptionColor?: keyof Theme
  taskDescription?: string
  toolUseCount: number
  tokens: number | null
  color?: keyof Theme
  isLast: boolean
  isResolved: boolean
  isError: boolean
  isAsync?: boolean
  shouldAnimate: boolean
  lastToolInfo?: string | null
  hideType?: boolean
}

export function AgentProgressLine({
  agentType,
  description,
  name,
  descriptionColor,
  taskDescription,
  toolUseCount,
  tokens,
  color,
  isLast,
  isResolved,
  isError: _isError,
  isAsync = false,
  shouldAnimate: _shouldAnimate,
  lastToolInfo,
  hideType = false,
}: Props): React.ReactNode {
  const treeChar = isLast ? '└─' : '├─'
  const isBackgrounded = isAsync && isResolved
  const statusText = !isResolved
    ? lastToolInfo || 'Initializing…'
    : isBackgrounded
      ? taskDescription ?? 'Running in the background'
      : 'Done'

  return (
    <Box flexDirection="column">
      <Box paddingLeft={3} flexDirection="row">
        <Box flexShrink={0}>
          <Text dimColor>{treeChar} </Text>
        </Box>
        <Box flexShrink={1}>
          <Text dimColor={!isResolved} wrap="truncate-end">
            {hideType ? (
              <>
                <Text bold>{name ?? description ?? agentType}</Text>
                {name && description && <Text dimColor>: {description}</Text>}
              </>
            ) : (
              <>
                <Text
                  bold
                  backgroundColor={color}
                  color={color ? 'inverseText' : undefined}
                >
                  {agentType}
                </Text>
                {description && (
                  <>
                    {' ('}
                    <Text
                      backgroundColor={descriptionColor}
                      color={descriptionColor ? 'inverseText' : undefined}
                    >
                      {description}
                    </Text>
                    {')'}
                  </>
                )}
              </>
            )}
            {!isBackgrounded && (
              <>
                {' · '}
                {toolUseCount} tool {toolUseCount === 1 ? 'use' : 'uses'}
                {tokens !== null && <> · {formatNumber(tokens)} tokens</>}
              </>
            )}
          </Text>
        </Box>
      </Box>
      {!isBackgrounded && (
        <Box paddingLeft={3} flexDirection="row">
          <Box flexShrink={0}>
            <Text dimColor>{isLast ? '   ⎿  ' : '│  ⎿  '}</Text>
          </Box>
          <Box flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              {statusText}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}
