// Tests for the links in the box at the bottom (web/js/links.js): every http(s) address in what Claude asked to show
// becomes a real link, the rest stays text, nothing is read as HTML, and a new text replaces the old one.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLinks, fillAttachment } from '../../web/js/links.js';
import { createPage } from './fake-dom.mjs';

test('text without an address is one plain part', () => {
  assert.deepEqual(splitLinks('pytest -q'), [{ text: 'pytest -q' }]);
  assert.deepEqual(splitLinks(''), []);
});

test('every http(s) address becomes a link and the punctuation after it stays text', () => {
  const parts = splitLinks('See https://example.test/a/b?x=1, then http://docs.test/c. Not ftp://old.test');
  assert.deepEqual(parts, [
    { text: 'See ' },
    { text: 'https://example.test/a/b?x=1', href: 'https://example.test/a/b?x=1' },
    { text: ', then ' },
    { text: 'http://docs.test/c', href: 'http://docs.test/c' },
    { text: '. Not ftp://old.test' },
  ]);
  assert.equal(parts.map((p) => p.text).join(''), 'See https://example.test/a/b?x=1, then http://docs.test/c. Not ftp://old.test',
    'nothing is lost');
});

test('an address in parentheses keeps its own closing bracket but not the sentence\'s', () => {
  assert.equal(splitLinks('(https://a.test/x)')[1].href, 'https://a.test/x');
  assert.equal(splitLinks('https://en.test/Foo_(bar)')[0].href, 'https://en.test/Foo_(bar)');
});

test('the box gets real links that open in a new tab, and text that is never HTML', () => {
  const { document } = createPage();
  const box = document.createElement('p');
  fillAttachment(box, '<b>bold</b> https://example.test/x. and https://two.test', document);
  const links = [...box.querySelectorAll('a')];
  assert.equal(links.length, 2);
  assert.equal(links[0].getAttribute('href'), 'https://example.test/x');
  assert.equal(links[0].textContent, 'https://example.test/x');
  assert.equal(links[0].getAttribute('target'), '_blank');
  assert.match(links[0].getAttribute('rel'), /noopener/);
  assert.equal(box.children.length, 2, 'only the two links are elements: <b> stayed text');
  // the fake DOM keeps its text apart from its children, so the order is not checked here, only that nothing is lost
  assert.equal(box.text, '<b>bold</b> . and ');
  assert.equal(box.textContent.length, '<b>bold</b> https://example.test/x. and https://two.test'.length);
});

test('a new text replaces the old links', () => {
  const { document } = createPage();
  const box = document.createElement('p');
  fillAttachment(box, 'https://one.test', document);
  fillAttachment(box, 'pytest -q', document);
  assert.equal(box.querySelectorAll('a').length, 0);
  assert.equal(box.textContent, 'pytest -q');
});
