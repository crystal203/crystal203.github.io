/* Localize presentation while keeping resource IDs and select values canonical. */
(function (global) {
  'use strict';
  const base = new URL('./', document.currentScript.src);
  const storageKey = 'gtlibrary.language';
  const eventName = 'gt-language-change';
  const han = /[\u3400-\u9fff]/;
  const attrs = ['title', 'aria-label', 'placeholder', 'alt', 'label', 'data-label'];
  const excluded = 'script, style, pre, code, [contenteditable], [data-i18n-ignore]';
  const downloads = new Map();
  const translations = new WeakMap();
  const resources = new WeakMap();
  const attributeResources = new WeakMap();
  const preserved = new WeakSet();
  let parentI18n;
  try { if (global.parent !== global) parentI18n = global.parent.GTI18n; } catch {}
  let locale = normalize(parentI18n?.locale ?? readPreference());
  let names, messages, wiki;
  let patterns = [];
  let revision = 0;
  let observer;

  function normalize(value) { return value === 'en' ? 'en' : 'zh-CN'; }
  function readPreference() {
    try { return localStorage.getItem(storageKey); } catch { return null; }
  }
  function load(file) {
    if (parentI18n) return parentI18n.load(file);
    if (!downloads.has(file)) {
      downloads.set(file, fetch(new URL('locales/' + file + '.json', base))
        .then(response => {
          if (!response.ok) throw Error('Locale catalog: HTTP ' + response.status);
          return response.json();
        })
        .catch(error => { downloads.delete(file); throw error; }));
    }
    return downloads.get(file);
  }
  function namesFor(code, fallback = '') {
    const pair = assetNames(code);
    const english = names && Object.hasOwn(names.terms, fallback) ? names.terms[fallback] : null;
    return [fallback, pair?.[0], pair?.[1], english].filter(Boolean);
  }
  function assetNames(code) { return names && Object.hasOwn(names.assets, code) ? names.assets[code] : null; }
  function name(code, fallback = code) {
    const pair = assetNames(code);
    if (locale === 'en') return pair?.[1] || translate(fallback);
    return fallback === code ? pair?.[0] || fallback : fallback;
  }
  function compilePatterns(rows) {
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Object.entries(rows).sort(([a], [b]) => b.replaceAll('{}', '').length - a.replaceAll('{}', '').length).map(([source, target]) => {
      const parts = source.split('{}');
      return {prefix: parts[0], suffix: parts.at(-1), re: new RegExp('^' + parts.map(escape).join('([\\s\\S]+?)') + '$'), target};
    });
  }
  function english(value, depth = 0) {
    if (Object.hasOwn(messages?.text || {}, value)) return messages.text[value];
    if (Object.hasOwn(names?.terms || {}, value)) return names.terms[value];
    if (Object.hasOwn(wiki?.text || {}, value)) return wiki.text[value];
    if (!han.test(value) || depth >= 5) return value;
    for (const {prefix, suffix, re, target} of patterns) {
      if (!value.startsWith(prefix) || !value.endsWith(suffix)) continue;
      const match = re.exec(value);
      if (match) return target.replace(/\{(\d+)\}/g, (_, i) => english(match[Number(i) + 1] || '', depth + 1));
    }
    const parts = value.split(/(\n|\s*·\s+| \/ | › | — | \| |、)/);
    return parts.length > 1 ? parts.map(part => english(part, depth + 1)).join('') : value;
  }
  function translate(value) {
    if (typeof value !== 'string' || locale !== 'en' || !han.test(value)) return value;
    const trimmed = value.trim();
    return value.replace(trimmed, () => english(trimmed));
  }
  function render(node, key, read, write, map) {
    const state = translations.get(node);
    const previous = state?.get(key);
    const current = read();
    const original = previous?.display === current ? previous.source : current;
    const display = map(original);
    if (display !== original || previous) {
      const fields = state || new Map();
      fields.set(key, {source: original, display});
      if (!state) translations.set(node, fields);
    }
    if (display !== current) write(display);
  }
  function paintText(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest(excluded) || parent.closest('option, textarea')) return;
    render(node, 'text', () => node.data, value => { node.data = value; }, value => {
      if (preserved.has(node)) return value;
      const code = resources.get(node);
      if (!code) return translate(value);
      const label = value.trim();
      return label ? value.replace(label, () => name(code, label)) : value;
    });
  }
  function paintOption(option) {
    if (option.closest(excluded)) return;
    render(option, 'label', () => option.getAttribute('label'), value => {
      if (value == null) option.removeAttribute('label'); else option.label = value;
    }, value => {
      if (preserved.has(option)) return value;
      const source = value ?? option.text;
      const code = resources.get(option) || option.dataset.i18nResource;
      const prefix = source.match(/^\s*(?:★ )?/)[0];
      const label = source.slice(prefix.length);
      const localized = prefix + (code ? name(code, label) : translate(label));
      // A label attribute leaves option.text and implicit option.value intact.
      return value === null && localized === option.text ? null : localized;
    });
  }
  function paintAttribute(element, attr) {
    if (attr === 'label' && element.tagName === 'OPTION') { paintOption(element); return; }
    if (element.closest(excluded)) return;
    const binding = attributeResources.get(element)?.get(attr);
    render(element, attr, () => element.getAttribute(attr), value => element.setAttribute(attr, value), value => {
      if (locale === 'en' && binding && value) {
        value = value.replace(binding.label, () => name(binding.code, binding.label));
      }
      return translate(value);
    });
  }
  function paintTree(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      const option = root.parentElement?.closest('option');
      if (option) paintOption(option); else paintText(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(excluded)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.nodeType === Node.ELEMENT_NODE && node.matches(excluded)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    do {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) paintText(node);
      else {
        if (node.tagName === 'OPTION') paintOption(node);
        for (const attr of attrs) if (attr !== 'label' || node.tagName !== 'OPTION') {
          if (node.hasAttribute(attr)) paintAttribute(node, attr);
        }
      }
    } while (walker.nextNode());
  }
  function observe() {
    if (observer) return;
    observer = new MutationObserver(records => {
      const added = new Set();
      for (const record of records) {
        if (!record.target.isConnected) continue;
        if (record.type === 'characterData') paintTree(record.target);
        else if (record.type === 'attributes') paintAttribute(record.target, record.attributeName);
        else {
          for (const node of record.addedNodes) if (node.isConnected) added.add(node);
          if (record.target.tagName === 'OPTION') paintOption(record.target);
        }
      }
      for (const node of added) paintTree(node);
    });
    observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attrs});
  }
  function refresh() {
    document.documentElement.lang = locale;
    paintTree(document.documentElement);
    const picker = document.getElementById('library-language');
    if (picker) picker.value = locale;
  }
  function sync(value) {
    locale = normalize(value);
    document.documentElement.lang = locale;
    const version = ++revision;
    const catalog = load('game-names').then(data => { names = data; });
    const englishUi = locale === 'en' ? load('ui-en').then(data => {
      messages = data;
      patterns = compilePatterns(data.patterns);
    }) : null;
    const englishWiki = locale === 'en' && /\/apps\/wiki\//.test(location.pathname)
      ? load('wiki-en').then(data => { wiki = data; }) : null;
    if (locale !== 'en' || messages) refresh();
    return Promise.allSettled([catalog, englishUi, englishWiki]).then(() => {
      if (version !== revision) return;
      refresh();
      global.dispatchEvent(new CustomEvent(eventName, {detail: locale}));
    });
  }
  function setLocale(value) {
    if (parentI18n) return parentI18n.setLocale(value);
    const next = normalize(value);
    try { localStorage.setItem(storageKey, next); } catch {}
    return sync(next);
  }
  function bindText(node, code, keepOriginal = false) {
    if (!node) return;
    if (keepOriginal !== preserved.has(node)) translations.delete(node);
    if (code) resources.set(node, code); else resources.delete(node);
    if (keepOriginal) preserved.add(node); else preserved.delete(node);
  }
  function bindAttribute(element, attr, code, label) {
    const bindings = attributeResources.get(element);
    if (!code || !label) { bindings?.delete(attr); return; }
    const fields = bindings || new Map();
    fields.set(attr, {code, label});
    if (!bindings) attributeResources.set(element, fields);
  }
  function resourceCode(scope, id) {
    return /^(?:atlas\/region\/|spine\/(?:character|illust|monster|npc|weapon)$|wiki\/hero$|map\/(?:map|category)$|fx\/character$|online\/stage$)/.test(scope) ? id : null;
  }
  function entityCode(entity) {
    return entity.kind === 'atlasRegion' ? entity.atlas.query
      : entity.kind === 'spine' ? entity.spine.name
      : entity.kind === 'fx' ? entity.fx.effect
      : entity.wiki?.hero || entity.map?.map || entity.atlas?.query || entity.spine?.name || entity.id;
  }
  function story(hero) {
    return locale === 'en' && wiki && Object.hasOwn(wiki.stories, hero.id) ? wiki.stories[hero.id] : hero.story;
  }
  function dialogue(code, source) {
    const row = locale === 'en' && names?.dialogue && Object.hasOwn(names.dialogue, code) ? names.dialogue[code] : null;
    return row && row[0] === source ? row[1] : source;
  }

  global.GTI18n = {get locale() { return locale; }, load, setLocale, translate, bindText, bindAttribute, name, namesFor, entityCode, resourceCode, story, dialogue};
  const onParentChange = event => { void sync(event.detail); };
  if (parentI18n) {
    global.parent.addEventListener(eventName, onParentChange);
    global.addEventListener('pagehide', () => global.parent.removeEventListener(eventName, onParentChange));
    global.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      global.parent.addEventListener(eventName, onParentChange);
      void sync(parentI18n.locale);
    });
  } else global.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) void sync(readPreference());
  });
  function start() {
    document.getElementById('library-language')?.addEventListener('change', event => { void setLocale(event.currentTarget.value); });
    observe();
    void sync(locale);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})(globalThis);
