import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { UserAgentNotificationMessage } from '../src/components/messages/UserAgentNotificationMessage.js'
import { renderToString } from '../src/utils/staticRender.js'

function renderNotification(isTranscriptMode) {
  return renderToString(
    React.createElement(UserAgentNotificationMessage, {
      addMargin: false,
      isTranscriptMode,
      param: {
        type: 'text',
        text: '<task-notification><status>completed</status><summary>Agent "probe" completed</summary><result>AGENT_NOTIFICATION_FINAL_OK</result></task-notification>',
      },
    }),
    120,
  )
}

test('task notification shows final agent response in transcript mode', async () => {
  const output = await renderNotification(true)

  assert.match(output, /Agent "probe" completed/)
  assert.match(output, /Response:/)
  assert.match(output, /AGENT_NOTIFICATION_FINAL_OK/)
})

test('task notification keeps normal view compact outside transcript mode', async () => {
  const output = await renderNotification(false)

  assert.match(output, /Agent "probe" completed/)
  assert.doesNotMatch(output, /AGENT_NOTIFICATION_FINAL_OK/)
})
