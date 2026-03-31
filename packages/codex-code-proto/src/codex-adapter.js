import { normalizeResponseOutput } from './normalize-response.js';

function requireApiKey(provider) {
  const envKey = provider.env_key;
  if (!envKey) {
    return null;
  }

  const apiKey = process.env[envKey];
  if (!apiKey) {
    throw new Error(`missing API key in environment variable: ${envKey}`);
  }

  return apiKey;
}

export function buildResponsesRequest(prompt, session, config) {
  const body = {
    model: session.model,
    stream: true,
    reasoning: {
      effort: session.reasoningEffort,
      summary: 'auto',
    },
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt,
          },
        ],
      },
    ],
  };

  if (config.disableResponseStorage) {
    body.store = false;
  }

  return body;
}

function parseSsePayload(rawText) {
  const output = [];
  let responseId = null;
  const blocks = rawText.split('\n\n');

  for (const block of blocks) {
    if (!block.trim()) {
      continue;
    }

    const dataLines = block
      .split('\n')
      .filter(line => line.startsWith('data: '))
      .map(line => line.slice('data: '.length));

    if (dataLines.length === 0) {
      continue;
    }

    const payloadText = dataLines.join('\n').trim();
    if (!payloadText || payloadText === '[DONE]') {
      continue;
    }

    const payload = JSON.parse(payloadText);
    if (payload.type === 'response.output_item.done' && payload.item) {
      output.push(payload.item);
    }

    if (payload.type === 'response.completed' && payload.response?.id) {
      responseId = payload.response.id;
    }
  }

  return {
    output,
    id: responseId,
  };
}

export async function runCodexTurn(prompt, session, config) {
  if (config.provider.wire_api !== 'responses') {
    throw new Error(`unsupported wire_api: ${config.provider.wire_api}`);
  }

  const apiKey = requireApiKey(config.provider);
  const url = `${config.provider.base_url.replace(/\/$/, '')}/responses`;
  const body = buildResponsesRequest(prompt, session, config);
  const headers = {
    'content-type': 'application/json',
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`responses request failed: ${response.status} ${errorText}`);
  }

  const payload = parseSsePayload(await response.text());

  return {
    responseId: payload.id ?? null,
    raw: payload,
    items: normalizeResponseOutput(payload),
  };
}
