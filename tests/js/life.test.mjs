// Tests for the mascot's life (web/js/life.js): tool events → terminal, external calls, busy, finished agents and
// code edits; plus what counts as a code edit.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLife, toolKind, stateByAge, WINDOWS, isCodeFile, isCodeEdit } from '../../web/js/life.js';

test('tool kind: terminal, leaving the machine, and the rest', () => {
  assert.equal(toolKind('Bash'), 'terminal');
  assert.equal(toolKind('PowerShell'), 'terminal');
  assert.equal(toolKind('mcp__terminal__run'), 'terminal');
  assert.equal(toolKind('WebFetch'), 'external');
  assert.equal(toolKind('mcp__Claude_Browser__navigate'), 'external');
  assert.equal(toolKind('mcp__postgres__query'), 'external');
  assert.equal(toolKind('Read'), 'other');
  assert.equal(toolKind(null), 'other');
});

test('state by the age of the last event', () => {
  assert.equal(stateByAge(0), 'energized');
  assert.equal(stateByAge(WINDOWS.energized), 'energized');
  assert.equal(stateByAge(WINDOWS.energized + 1), 'ember');
  assert.equal(stateByAge(WINDOWS.ember), 'ember');
  assert.equal(stateByAge(WINDOWS.ember + 1), 'off');
  assert.equal(stateByAge(NaN), 'off');
});

test('terminal, external calls, busy and finished agents', () => {
  const life = createLife();
  const s = {};
  life.read(0, s);
  assert.deepEqual([s.thinking, s.terminal, s.external, s.finished, s.online], [false, false, 0, 0, true]);
  life.register('Bash', false, 100);
  life.register('WebFetch', false, 200);
  life.register('Edit', false, 300);
  life.agentFinished();
  life.read(400, s);
  assert.equal(s.terminal, true);
  assert.equal(s.external, 1);
  assert.equal(s.finished, 1);
  assert.equal(s.thinking, true);
  life.read(100 + WINDOWS.terminal + 1, s);
  assert.equal(s.terminal, false);
  life.read(300 + WINDOWS.thinking + 1, s);
  assert.equal(s.thinking, false);
  life.setOnline(false);
  assert.equal(life.read(0, s).online, false);
});

test('read does not create a new object: it fills the one it got', () => {
  const life = createLife();
  const s = {};
  assert.equal(life.read(0, s), s);
});

test('code view: an event the server flags as a code edit, for 5 s', () => {
  const life = createLife();
  const s = {};
  life.register('Edit', true, 100);
  assert.equal(life.read(200, s).code, true);
  assert.equal(life.read(100 + WINDOWS.code + 1, s).code, false);
  const text = createLife();
  text.register('Write', false, 100);
  text.register('Read', false, 100);
  assert.equal(text.read(200, s).code, false, 'edits on text and reads do not count');
});

test('code and text extensions', () => {
  for (const c of ['a.js', 'b.mjs', 'c.ts', 'd.tsx', 'e.py', 'f.css', 'g.html', 'h.json', 'i.sql', 'j.ps1', 'k.sh', 'l.bat', 'C:\\x\\Y.PY'])
    assert.equal(isCodeFile(c), true, c);
  for (const c of ['a.md', 'b.txt', 'c.xlsx', 'd.csv', 'no-extension', '.bashrc', '', null])
    assert.equal(isCodeFile(c), false, String(c));
});

test('only an editing tool counts as a code edit', () => {
  assert.equal(isCodeEdit('Edit', 'web/app.js'), true);
  assert.equal(isCodeEdit('NotebookEdit', 'analysis.ipynb'), true);
  assert.equal(isCodeEdit('Read', 'web/app.js'), false);
  assert.equal(isCodeEdit('Write', 'NOTES.md'), false);
});
