import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRemotePermissionAssistantMessage,
  buildRemotePermissionPayload,
} from '../src/remote/remotePermissionShape.js'

test('remote permission bridge keeps payload and wrapped assistant message in sync', () => {
  const request = {
    tool_use_id: 'tool-1',
    tool_name: 'Bash',
    input: { command: 'pwd' },
    description: 'run pwd',
  } as const

  const payload = buildRemotePermissionPayload(request)
  assert.deepEqual(payload, {
    content: [
      {
        type: 'tool_use',
        id: 'tool-1',
        name: 'Bash',
        input: { command: 'pwd' },
      },
    ],
    modelTurnItems: [],
  })

  const assistantMessage = buildRemotePermissionAssistantMessage(
    request,
    'req-1',
  )
  assert.equal(assistantMessage.message.id, 'remote-req-1')
  assert.equal(assistantMessage.message.model, '')
  assert.deepEqual(assistantMessage.message.content, payload.content)
  assert.deepEqual(assistantMessage.modelTurnItems, undefined)
})
