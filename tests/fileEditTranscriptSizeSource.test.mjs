import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('accepted file edit results no longer keep originalFile in the returned payload', () => {
  const source = readSource('src/tools/FileEditTool/FileEditTool.ts');
  assert.ok(source.includes("firstLine: originalFileContents.split('\\n')[0] ?? null"));
  assert.ok(!source.includes('originalFile: originalFileContents'));
});

test('accepted file write update results no longer keep originalFile in the returned payload', () => {
  const source = readSource('src/tools/FileWriteTool/FileWriteTool.ts');
  assert.ok(source.includes("firstLine: content.split('\\n')[0] ?? null"));
  assert.ok(!source.includes('originalFile: oldContent'));
});

test('file edit and write UIs accept firstLine without requiring originalFile', () => {
  const fileEditUi = readSource('src/tools/FileEditTool/UI.tsx');
  const fileWriteUi = readSource('src/tools/FileWriteTool/UI.tsx');
  assert.ok(
    fileEditUi.includes(
      "firstLine={firstLine ?? originalFile?.split('\\n')[0] ?? null}",
    ),
  );
  assert.ok(
    fileWriteUi.includes(
      "firstLine={firstLine ?? content.split('\\n')[0] ?? null}",
    ),
  );
});
