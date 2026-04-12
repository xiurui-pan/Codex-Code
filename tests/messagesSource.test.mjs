import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = new URL('..', import.meta.url);

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot.pathname, relativePath), 'utf8');
}

test('computeSliceStart guards missing uuids and null anchors', () => {
  const source = readSource('src/components/Messages.tsx');

  assert.match(source, /collapsed\.findIndex\(m => m\?\.uuid === anchor\.uuid\)/);
  assert.match(source, /const msgAtStartUuid = msgAtStart\?\.uuid/);
  assert.match(source, /anchor\?\.idx !== start/);
});

test('Message.tsx drops assistant and user wrapper boxes when every child renders null', () => {
  const source = readSource('src/components/Message.tsx');

  assert.match(source, /function hasRenderableNode\(children: React\.ReactNode\)/);
  assert.match(source, /if \(!hasRenderableNode\(t3\)\) \{\s*return null;/);
});

test('prompt mode keeps streaming thinking visible through the short post-thinking grace window', () => {
  const source = readSource('src/components/Messages.tsx');

  assert.match(source, /shouldShowStreamingThinking\(streamingThinking\)/);
});

test('prompt mode filters to post-compact context while transcript mode keeps full history', () => {
  const source = readSource('src/components/Messages.tsx');

  assert.match(
    source,
    /const compactAwareMessages = verbose \|\| isTranscriptMode \? normalizedMessages : getMessagesAfterCompactBoundary\(normalizedMessages, \{/,
  );
});

test('prompt footer keeps the status bar visible while retained thinking is still shown', () => {
  const source = readSource('src/screens/REPL.tsx');

  assert.match(source, /const isStreamingThinkingVisible = shouldShowStreamingThinking\(streamingThinking\);/);
  assert.match(source, /!visibleStreamingText \|\| isBriefOnly \|\| isStreamingThinkingVisible/);
});

test('new submits clear retained thinking, while intra-turn request starts do not need to', () => {
  const replSource = readSource('src/screens/REPL.tsx');
  const messagesSource = readSource('src/utils/messages.ts');

  assert.match(replSource, /setSubmitCount\(_ => _ \+ 1\);[\s\S]*setStreamingThinking\(null\);/);
  assert.match(messagesSource, /onStreamingThinking\?\.\(current => \(current\?\.isStreaming \? null : current\)\)/);
});

test('fullscreen compact boundary handling repins the prompt viewport after preserving transcript history', () => {
  const source = readSource('src/screens/REPL.tsx');

  assert.match(
    source,
    /setMessages\(old => \[\.\.\.getMessagesAfterCompactBoundary\(old, \{\s*includeSnipped: true\s*\}\), newMessage\]\);[\s\S]*queueMicrotask\(repinScroll\);/,
  );
});
