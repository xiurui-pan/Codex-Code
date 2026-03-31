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

