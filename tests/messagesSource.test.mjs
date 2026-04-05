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
