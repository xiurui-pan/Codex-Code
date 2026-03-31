import {
  MessagePhase,
  createAssistantMessageItem,
  createReasoningItem,
} from './ir.js';

function collectOutputText(content = []) {
  return content
    .filter(part => part?.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('');
}

function collectReasoningSummary(summary = []) {
  return summary
    .map(item => item?.text)
    .filter(text => typeof text === 'string' && text.length > 0);
}

function collectReasoningRaw(content = []) {
  return content
    .map(item => item?.text)
    .filter(text => typeof text === 'string' && text.length > 0);
}

function normalizePhase(phase, index, lastAssistantIndex) {
  if (phase === 'commentary') {
    return MessagePhase.COMMENTARY;
  }

  if (phase === 'final' || phase === 'final_answer') {
    return MessagePhase.FINAL;
  }

  return index === lastAssistantIndex ? MessagePhase.FINAL : MessagePhase.COMMENTARY;
}

export function normalizeResponseOutput(response) {
  const rawItems = Array.isArray(response?.output) ? response.output : [];
  const assistantIndexes = rawItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item?.type === 'message' && item.role === 'assistant');
  const lastAssistantIndex = assistantIndexes.at(-1)?.index;

  return rawItems.flatMap((item, index) => {
    if (item?.type === 'reasoning') {
      const summaryText = collectReasoningSummary(item.summary);
      const rawContent = collectReasoningRaw(item.content);

      if (summaryText.length === 0 && rawContent.length === 0) {
        return [];
      }

      return [createReasoningItem(summaryText, rawContent)];
    }

    if (item?.type === 'message' && item.role === 'assistant') {
      const text = collectOutputText(item.content);
      const phase = normalizePhase(item.phase, index, lastAssistantIndex);

      return [createAssistantMessageItem(text, phase)];
    }

    return [];
  });
}
