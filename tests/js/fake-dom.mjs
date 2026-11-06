// fake-dom.mjs — just enough of a page for Cody's drawers (sheet.js, settings.js, status.js, network.js) to run in
// Node: elements with children, classes, attributes and listeners; events that bubble up to the window; focus; a
// location whose #hash tells its listeners. No layout and no styles: "visible" only means no ancestor is hidden.
//
//   createPage() → { document, win, history, key(name, more), settle() }
//     key      a keydown on the focused element (it bubbles to the window, where the drawers listen)
//     settle   lets pending promises run (the drawers draw themselves after asking the server)
//   Selectors understood by querySelector(All): tag, .class, tag.class, [name=value] and tag[name=value], in a
//   comma-separated list. A descendant combinator is not.

const TABBABLE = new Set(['BUTTON', 'INPUT', 'SELECT']);

function parse(selector) {
  return selector.split(',').map((part) => {
    const m = /^([a-z0-9]*)((?:\.[\w-]+)*)(?:\[([\w-]+)=([^\]]+)\])?$/i.exec(part.trim());
    if (!m) throw new Error(`fake-dom: selector not understood: ${part}`);
    return { tag: m[1].toUpperCase(), classes: m[2].split('.').filter(Boolean), name: m[3], value: m[4] };
  });
}

class FakeElement {
  constructor(tag, page) {
    this.tagName = tag.toUpperCase();
    this.page = page;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.tabIndex = TABBABLE.has(this.tagName) ? 0 : -1;
    this.text = '';
  }

  get classList() {
    const names = () => this.className.split(/\s+/).filter(Boolean);
    return {
      contains: (name) => names().includes(name),
      add: (name) => { if (!names().includes(name)) this.className = [...names(), name].join(' '); },
      remove: (name) => { this.className = names().filter((n) => n !== name).join(' '); },
    };
  }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this.text = String(value); }

  append(...kids) {
    for (const kid of kids) {
      if (typeof kid === 'string') { this.text += kid; continue; }
      kid.remove();
      kid.parentNode = this;
      this.children.push(kid);
    }
  }

  replaceChildren(...kids) {
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    this.text = '';
    this.append(...kids);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }

  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }

  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }

  // runs the listeners here and, for a bubbling event, on every ancestor and then on the window
  dispatchEvent(event) {
    event.target ??= this;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    for (let n = this; n; n = n.parentNode) {
      for (const fn of n.listeners.get(event.type) || []) fn(event);
      if (!event.bubbles) return event;
    }
    this.page.win.dispatch(event);
    return event;
  }

  // a press and a release in the same place, as a real click is
  click() {
    this.dispatchEvent({ type: 'pointerdown', bubbles: true });
    this.dispatchEvent({ type: 'click', bubbles: true });
  }

  // what a person does to a field: the value changes, then the field says so
  enter(value, type = 'input') {
    this.value = value;
    this.dispatchEvent({ type, bubbles: true });
  }

  focus() { this.page.document.activeElement = this; }

  // null when this element or an ancestor is hidden, as in a browser (where it also needs layout)
  get offsetParent() {
    for (let n = this; n; n = n.parentNode) if (n.hidden) return null;
    return this.parentNode;
  }

  matches(selector) {
    return parse(selector).some((want) => (!want.tag || want.tag === this.tagName)
      && want.classes.every((name) => this.classList.contains(name))
      && (!want.name || String(this[want.name] ?? this.getAttribute(want.name)) === want.value));
  }

  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const c of node.children) {
        if (c.matches(selector)) found.push(c);
        walk(c);
      }
    };
    walk(this);
    return found;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (n.matches(selector)) return n;
    return null;
  }
}

export function createPage() {
  const page = {};
  const listeners = new Map();
  let hash = '';
  page.win = {
    addEventListener: (type, fn) => { listeners.set(type, [...(listeners.get(type) || []), fn]); },
    dispatch: (event) => { for (const fn of listeners.get(event.type) || []) fn(event); },
    location: {
      get hash() { return hash; },
      set hash(value) {
        const next = value && !String(value).startsWith('#') ? `#${value}` : String(value || '');
        if (next === hash) return;
        hash = next;
        page.win.dispatch({ type: 'hashchange' });
      },
    },
    navigator: {},
    opened: [],
    open: (url) => { page.win.opened.push(url); },
    isSecureContext: true,
    SpeechRecognition: function Recognition() {},
  };
  page.document = { createElement: (tag) => new FakeElement(tag, page), hidden: false, activeElement: null };
  page.document.body = page.document.createElement('body');
  page.document.activeElement = page.document.body;
  // the drawers clear their #hash with history.replaceState, which tells no listener
  page.history = { replaceState: () => { hash = ''; } };
  page.key = (name, more = {}) => page.document.activeElement.dispatchEvent({ type: 'keydown', key: name, bubbles: true, ...more });
  page.settle = async () => { for (let i = 0; i < 5; i++) await new Promise((done) => setImmediate(done)); };
  return page;
}
