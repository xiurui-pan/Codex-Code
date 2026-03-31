import { randomUUID } from 'node:crypto';

export const MessagePhase = Object.freeze({
  COMMENTARY: 'commentary',
  FINAL: 'final',
});

export function createUserMessageItem(text) {
  return {
    type: 'user_message',
    id: randomUUID(),
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

export function createAssistantMessageItem(text, phase = MessagePhase.FINAL) {
  return {
    type: 'assistant_message',
    id: randomUUID(),
    phase,
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

export function createReasoningItem(summaryText, rawContent = []) {
  return {
    type: 'reasoning',
    id: randomUUID(),
    summaryText,
    rawContent,
  };
}

export function createToolCallItem(toolName, callId, argumentsText, argumentsObject = null) {
  return {
    type: 'tool_call',
    id: randomUUID(),
    toolName,
    callId,
    argumentsText,
    arguments: argumentsObject,
  };
}

export function createToolResultItem(
  toolName,
  callId,
  output,
  status = 'success',
  extra = {},
) {
  return {
    type: 'tool_result',
    id: randomUUID(),
    toolName,
    callId,
    status,
    output,
    ...extra,
  };
}
