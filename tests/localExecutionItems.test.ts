import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildToolCallItemsForLocalExecution,
  buildPermissionItemsForLocalExecution,
  buildToolResultItemsForLocalExecution,
} from '../src/services/api/localExecutionItems.js'

test('bash tool call does not invent a permission request', () => {
  const items = buildToolCallItemsForLocalExecution(
    'tool-1',
    'Bash',
    { command: 'pwd' },
    'structured',
  )

  assert.equal(items.some(item => item.kind === 'permission_request'), false)
  assert.equal(items.some(item => item.kind === 'tool_call'), true)

  const shellCall = items.find(item => item.kind === 'local_shell_call')
  assert.deepEqual(shellCall, {
    kind: 'local_shell_call',
    provider: 'custom',
    toolUseId: 'tool-1',
    toolName: 'Bash',
    command: 'pwd',
    phase: 'requested',
    source: 'provider',
  })
})

test('tool execution error stays an execution error', () => {
  const items = buildToolResultItemsForLocalExecution(
    'tool-2',
    'Bash',
    {
      type: 'tool_result',
      tool_use_id: 'tool-2',
      is_error: true,
      content: 'command failed',
    },
    'tool_execution',
  )

  assert.equal(items.some(item => item.kind === 'permission_decision'), false)

  const result = items.find(item => item.kind === 'execution_result')
  assert.equal(result?.status, 'error')
  assert.equal(result?.source, 'tool_execution')
})

test('denied shell result is marked denied instead of allow', () => {
  const items = buildToolResultItemsForLocalExecution(
    'tool-3',
    'Bash',
    {
      type: 'tool_result',
      tool_use_id: 'tool-3',
      is_error: true,
      content: 'Permission denied by user',
    },
  )

  const result = items.find(item => item.kind === 'execution_result')
  assert.equal(result?.status, 'denied')
})

test('permission decision keeps structured details', () => {
  const items = buildPermissionItemsForLocalExecution(
    'tool-4',
    'Bash',
    'allow',
    'tool_execution',
    true,
    {
      reason_type: 'permissionPromptTool',
      permission_prompt_tool_name: 'stdio',
      decision_source: 'permission_prompt_tool',
    },
  )

  const decision = items.find(item => item.kind === 'permission_decision')
  assert.deepEqual(decision?.details, {
    reason_type: 'permissionPromptTool',
    permission_prompt_tool_name: 'stdio',
    decision_source: 'permission_prompt_tool',
  })
})
