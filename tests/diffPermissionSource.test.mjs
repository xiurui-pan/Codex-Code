import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = new URL('..', import.meta.url);

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot.pathname, relativePath), 'utf8');
}

test('file edit diff reads terminal size without requiring Ink app context', () => {
  const source = readSource('src/components/FileEditToolDiff.tsx');
  assert.match(source, /TerminalSizeContext/);
  assert.match(source, /process\.stdout\.columns \?\? 80/);
  assert.doesNotMatch(source, /useTerminalSize\(\)/);
});

test('file write diff reads terminal size without requiring Ink app context', () => {
  const source = readSource('src/components/permissions/FileWritePermissionRequest/FileWriteToolDiff.tsx');
  assert.match(source, /TerminalSizeContext/);
  assert.match(source, /process\.stdout\.columns \?\? 80/);
  assert.doesNotMatch(source, /useTerminalSize\(\)/);
});

test('structured diff and highlighted code can read settings outside app state provider', () => {
  const hookSource = readSource('src/hooks/useSettings.ts');
  const structuredDiffSource = readSource('src/components/StructuredDiff.tsx');
  const highlightedCodeSource = readSource('src/components/HighlightedCode.tsx');

  assert.match(hookSource, /useSettingsMaybeOutsideOfProvider/);
  assert.match(structuredDiffSource, /useSettingsMaybeOutsideOfProvider/);
  assert.match(highlightedCodeSource, /useSettingsMaybeOutsideOfProvider/);
  assert.match(structuredDiffSource, /settings\?\.syntaxHighlightingDisabled/);
  assert.match(highlightedCodeSource, /settings\?\.syntaxHighlightingDisabled/);
  assert.doesNotMatch(structuredDiffSource, /useSettings\(\)/);
  assert.doesNotMatch(highlightedCodeSource, /useSettings\(\)/);
});
