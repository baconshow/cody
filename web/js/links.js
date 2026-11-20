// links.js — the link, command or path Claude asked to show, in the box at the bottom of the page: every http(s)
// address in it becomes a real link (a tap opens it in a new tab), the rest stays text. The text is never read as
// HTML: the box is filled with text nodes and <a> elements only.
//
//   splitLinks(text)                → [{ text, href? }]  the addresses, with the punctuation after them left out
//   fillAttachment(el, text, doc)   fills el with the parts (text, and <a> for each address)

const ADDRESS = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?)\]]+$/;

export function splitLinks(text) {
  const parts = [];
  let at = 0;
  for (const m of String(text).matchAll(ADDRESS)) {
    let href = m[0];
    // "https://x.test/a." ends a sentence, not the address; a ")" is part of it only when the address opened one
    const tail = TRAILING.exec(href)?.[0] ?? '';
    const keep = tail.startsWith(')') && href.includes('(') ? 1 : 0;
    href = href.slice(0, href.length - tail.length + keep);
    if (m.index > at) parts.push({ text: text.slice(at, m.index) });
    parts.push({ text: href, href });
    at = m.index + href.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

export function fillAttachment(el, text, doc = document) {
  el.replaceChildren(...splitLinks(text).map((part) => {
    if (!part.href) return part.text;
    const a = doc.createElement('a');
    a.setAttribute('href', part.href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.textContent = part.text;
    return a;
  }));
}
