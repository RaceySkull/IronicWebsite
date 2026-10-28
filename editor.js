/* Site Editor — main app
   Sections: 1 state & helpers · 2 opening a site · 3 saving in the browser
   4 rendering the page · 5 selection & canvas · 6 actions & undo
   7 styles & CSS · 8 panels (pages, layers, inspector, team kit)
   9 context menu · 10 timeline · 11 media · 12 download · 13 boot */
'use strict';

/* ============ 1. State & helpers ============ */
const S = {
  site: '',
  files: new Map(),      // path -> { kind: 'text'|'blob', text, blob, type, dirty, isNew }
  docs: new Map(),       // page path -> parsed Document (elements carry data-se-id)
  page: null,
  tabs: [],
  sel: null,             // data-se-id of selected element
  tool: 'select',
  tab: 'design',
  scope: 'one',
  changes: [],
  undo: [], redo: [],
  device: 'desktop',
  preview: false,
  tlOpen: false, tlTime: 0, tlStep: null, recording: true, tlPlaying: false,
  nextId: 1,
  cssCache: new Map(),   // css path -> { ver, url }
  assetCache: new Map(), // path -> url
  cssVer: new Map(),
  scroll: 0,
  editing: null
};
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TEXT_EXT = /\.(html?|css|js|mjs|json|md|txt|svg|xml|webmanifest)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|avif|ico)$/i;
const DOC_EXT = /\.(pdf|docx?|pptx?|xlsx?|txt|zip)$/i;
const MIME = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', pdf: 'application/pdf',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', txt: 'text/plain', md: 'text/markdown' };
const ext = p => (p.split('.').pop() || '').toLowerCase();
const mimeOf = p => MIME[ext(p)] || 'application/octet-stream';
const isPage = p => /\.html?$/i.test(p);
const isCss = p => /\.css$/i.test(p);
const icon = d => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const I = {
  up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', x: 'M6 6l12 12M18 6L6 18', play: 'M7 4l13 8-13 8z', stop: 'M6 6h12v12H6z',
  btn: 'M3 8h18v8H3z M8 12h8', count: 'M12 3a9 9 0 100 18 9 9 0 000-18z M12 7v5h4', shape: 'M4 5h16v14H4z', page: 'M6 2h9l5 5v15H6z M14 2v6h6',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18', doc: 'M6 2h9l5 5v15H6z M9 13h6 M9 17h6', mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  check: 'M20 6L9 17l-5-5', folder: 'M3 6h7l2 2h9v12H3z', plus: 'M12 5v14 M5 12h14', smooth: 'M3 17c4 0 5-10 9-10s5 10 9 10',
  fade: 'M12 3a9 9 0 100 18 M12 3v18', slide: 'M4 12h12 M12 6l6 6-6 6', grow: 'M4 14v6h6 M20 10V4h-6 M4 20l7-7 M20 4l-7 7', spin: 'M21 12a9 9 0 11-3-6.7 M21 4v5h-5',
  float: 'M4 15c3-3 5-3 8 0s5 3 8 0 M12 4v6', pulse: 'M4 12h4l3-8 4 16 3-8h2', none: 'M5 5l14 14 M12 3a9 9 0 100 18 9 9 0 000-18z', motion: 'M4 12h4l3-8 4 16 3-8h2'
};

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
}
function pretty(s) {
  s = String(s || '').replace(/^--/, '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}
function pageName(p) {
  const base = p.split('/').pop();
  if (/^index\.html?$/i.test(base)) {
    const dir = p.split('/').slice(0, -1).pop();
    return dir ? pretty(dir) : 'Home';
  }
  return pretty(base);
}

/* Paths are site-relative with no leading slash: "TeamPhotos/ChaseTeam.png" */
function dirOf(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
function resolve(fromFile, ref) {
  if (!ref) return null;
  ref = ref.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return null; // external, data:, blob:, anchors
  ref = ref.split('#')[0].split('?')[0];
  if (!ref) return null;
  try { ref = decodeURI(ref); } catch (e) { /* keep as-is */ }
  const parts = ref.startsWith('/') ? [] : dirOf(fromFile).split('/').filter(Boolean);
  for (const seg of ref.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return parts.join('/');
}
function relPath(fromFile, toPath) {
  const a = dirOf(fromFile).split('/').filter(Boolean), b = toPath.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const out = '../'.repeat(a.length - i) + b.slice(i).join('/');
  return encodeURI(out);
}
function fileText(p) { const f = S.files.get(p); return f ? (f.kind === 'text' ? f.text : null) : null; }
function setText(p, text, isNew) {
  const f = S.files.get(p);
  if (f) { f.text = text; f.kind = 'text'; f.dirty = true; }
  else S.files.set(p, { kind: 'text', text, type: mimeOf(p), dirty: true, isNew: !!isNew });
  if (isCss(p)) S.cssVer.set(p, (S.cssVer.get(p) || 0) + 1);
}

/* ============ 2. Opening a site ============ */
async function loadEntries(entries) {
  // entries: [{ path, read: async () => ({ text } | { blob }) }]
  entries = entries.filter(e => !/(^|\/)(\.git|node_modules|__MACOSX)(\/|$)|\.DS_Store$|Thumbs\.db$/.test(e.path));
  if (!entries.length) throw new Error('That folder looks empty. Pick the folder that holds your index.html.');
  const firsts = new Set(entries.map(e => e.path.split('/')[0]));
  const strip = firsts.size === 1 && entries.every(e => e.path.includes('/')) ? [...firsts][0] + '/' : '';
  resetProject();
  S.site = strip ? strip.slice(0, -1) : 'My site';
  for (const e of entries) {
    const path = strip ? e.path.slice(strip.length) : e.path;
    const data = await e.read(TEXT_EXT.test(path));
    if (data.text != null) S.files.set(path, { kind: 'text', text: data.text, type: mimeOf(path), dirty: false, isNew: false });
    else S.files.set(path, { kind: 'blob', blob: data.blob, type: mimeOf(path), dirty: false, isNew: false });
  }
  const pages = allPages();
  if (!pages.length) throw new Error('No web pages found. Pick the folder that holds your index.html.');
  openApp(pages.find(p => /^index\.html?$/i.test(p)) || pages[0]);
}
function resetProject() {
  for (const v of S.cssCache.values()) URL.revokeObjectURL(v.url);
  for (const v of S.assetCache.values()) URL.revokeObjectURL(v);
  Object.assign(S, { files: new Map(), docs: new Map(), page: null, tabs: [], sel: null, changes: [], undo: [], redo: [], cssCache: new Map(), assetCache: new Map(), cssVer: new Map(), tlOpen: false });
}
function allPages() {
  return [...S.files.keys()].filter(isPage).sort((a, b) => {
    const ai = /(^|\/)index\.html?$/i.test(a) ? 0 : 1, bi = /(^|\/)index\.html?$/i.test(b) ? 0 : 1;
    return a.split('/').length - b.split('/').length || ai - bi || a.localeCompare(b);
  });
}

$('#openFolder').addEventListener('change', async e => {
  const list = [...e.target.files];
  try {
    await loadEntries(list.map(f => ({ path: f.webkitRelativePath || f.name, read: async asText => asText ? { text: await f.text() } : { blob: f } })));
  } catch (err) { showWelcomeError(err.message); }
  e.target.value = '';
});
$('#openZip').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const zip = await JSZip.loadAsync(file);
    const entries = [];
    zip.forEach((path, z) => { if (!z.dir) entries.push({ path, read: async asText => asText ? { text: await z.async('string') } : { blob: new Blob([await z.async('arraybuffer')], { type: mimeOf(path) }) } }); });
    await loadEntries(entries);
  } catch (err) { showWelcomeError(err.message || 'That ZIP could not be opened. Try exporting it again.'); }
  e.target.value = '';
});
function showWelcomeError(msg) { const el = $('#welcomeError'); el.textContent = msg; el.hidden = false; }

function getDoc(path) {
  if (S.docs.has(path)) return S.docs.get(path);
  const doc = new DOMParser().parseFromString(fileText(path) || '<!doctype html><html><head></head><body></body></html>', 'text/html');
  assignIds(doc);
  S.docs.set(path, doc);
  return doc;
}
function assignIds(doc) {
  for (const el of doc.body.querySelectorAll('*')) {
    const id = el.getAttribute('data-se-id');
    if (!id) el.setAttribute('data-se-id', 'e' + (S.nextId++));
    else { const n = parseInt(id.slice(1), 10); if (n >= S.nextId) S.nextId = n + 1; }
  }
  if (!doc.body.getAttribute('data-se-id')) doc.body.setAttribute('data-se-id', 'body');
}
function serializeDoc(doc, keepIds) {
  const clone = doc.cloneNode(true);
  if (!keepIds) for (const el of clone.querySelectorAll('[data-se-id]')) el.removeAttribute('data-se-id');
  for (const el of clone.querySelectorAll('[contenteditable]')) el.removeAttribute('contenteditable');
  return '<!DOCTYPE html>\n' + clone.documentElement.outerHTML + '\n';
}

/* ============ 3. Saving in this browser (IndexedDB) ============ */
const DB = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open('site-editor', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
};
function scheduleSave() {
  $('#saveState').textContent = 'Saving…';
  clearTimeout(scheduleSave.t);
  scheduleSave.t = setTimeout(saveNow, 700);
}
async function saveNow() {
  try {
    const files = [];
    for (const [path, f] of S.files) files.push({ path, kind: f.kind, text: f.text, blob: f.blob, dirty: f.dirty, isNew: f.isNew });
    const docs = [];
    for (const [path, d] of S.docs) docs.push([path, serializeDoc(d, true)]);
    await DB.set('project', { site: S.site, files, docs, changes: S.changes, page: S.page, tabs: S.tabs, nextId: S.nextId });
    $('#saveState').textContent = 'Saved in this browser';
  } catch (e) { $('#saveState').textContent = 'Couldn’t save in this browser — download to keep your work'; }
}
async function resumeProject() {
  const p = await DB.get('project'); if (!p) return;
  resetProject();
  S.site = p.site; S.changes = p.changes || []; S.nextId = p.nextId || 1;
  for (const f of p.files) S.files.set(f.path, { kind: f.kind, text: f.text, blob: f.blob, type: mimeOf(f.path), dirty: f.dirty, isNew: f.isNew });
  for (const [path, html] of p.docs || []) { const d = new DOMParser().parseFromString(html, 'text/html'); assignIds(d); S.docs.set(path, d); }
  S.tabs = (p.tabs || []).filter(t => S.files.has(t));
  openApp(S.files.has(p.page) ? p.page : allPages()[0]);
}

/* ============ 4. Rendering the page ============ */
function assetUrl(path) {
  if (S.assetCache.has(path)) return S.assetCache.get(path);
  const f = S.files.get(path); if (!f) return null;
  const blob = f.kind === 'blob' ? f.blob : new Blob([f.text], { type: mimeOf(path) });
  const url = URL.createObjectURL(blob);
  S.assetCache.set(path, url);
  return url;
}
function rewriteCssUrls(css, fromPath) {
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
      const p = resolve(fromPath, ref);
      if (!p || !S.files.has(p)) return m;
      return `url("${isCss(p) ? cssUrl(p) : assetUrl(p)}")`;
    })
    .replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, ref) => {
      const p = resolve(fromPath, ref);
      return p && S.files.has(p) ? `@import "${cssUrl(p)}"` : m;
    });
}
function cssUrl(path) {
  const ver = S.cssVer.get(path) || 0, c = S.cssCache.get(path);
  if (c && c.ver === ver) return c.url;
  if (c) URL.revokeObjectURL(c.url);
  const url = URL.createObjectURL(new Blob([rewriteCssUrls(fileText(path) || '', path)], { type: 'text/css' }));
  S.cssCache.set(path, { ver, url });
  return url;
}
function rewriteSrcset(v, page) {
  return v.split(',').map(part => {
    const [u, ...rest] = part.trim().split(/\s+/);
    const p = resolve(page, u);
    return [p && S.files.has(p) ? assetUrl(p) : u, ...rest].join(' ');
  }).join(', ');
}
const EDITOR_CSS = `
[data-se-ui]{position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box}
.se-ui-hover{outline:1px dashed #F05A28}
.se-ui-sel{outline:1px solid #F05A28;outline-offset:2px}
.se-ui-tag{position:absolute;left:-3px;top:-26px;background:#F05A28;color:#1A1A1A;font:600 11px/1 'IBM Plex Sans',system-ui,sans-serif;padding:4px 6px;white-space:nowrap}
.se-ui-h{position:absolute;width:7px;height:7px;background:#fff;border:1px solid #F05A28}
.se-ui-pivot{width:20px;height:20px;margin:-10px 0 0 -10px;border:2px solid #fff;box-shadow:0 0 0 1px #1A1A1A}
.se-ui-pivot::before,.se-ui-pivot::after{content:"";position:absolute;background:#fff;left:50%;top:50%}
.se-ui-pivot::before{width:28px;height:1px;margin-left:-14px}
.se-ui-pivot::after{width:1px;height:28px;margin-top:-14px}
[contenteditable]{outline:2px solid #F05A28!important;outline-offset:2px;cursor:text}
body.se-tool-insert,body.se-tool-insert *{cursor:crosshair!important}
`;
function renderFrame(keepScroll = true) {
  const frame = $('#frame');
  if (keepScroll && frame.contentWindow) { try { S.scroll = frame.contentWindow.scrollY; } catch (e) { S.scroll = 0; } }
  const page = S.page, doc = getDoc(page), clone = doc.cloneNode(true);
  // Our own runtime is always injected fresh, so drop any copy the page already links.
  for (const el of clone.querySelectorAll('script[src*="se-widgets"], link[href*="se-widgets"]')) el.remove();
  if (!S.preview) {
    for (const s of clone.querySelectorAll('script')) s.remove();
    // Inline handlers (onclick, onerror…) depend on the site's scripts, which don't run while editing.
    for (const el of clone.querySelectorAll('*')) for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  }
  for (const el of clone.querySelectorAll('link[href]')) {
    const p = resolve(page, el.getAttribute('href'));
    if (p && S.files.has(p)) { el.setAttribute('href', isCss(p) ? cssUrl(p) : assetUrl(p)); if (isCss(p)) el.setAttribute('data-se-css', p); }
  }
  for (const el of clone.querySelectorAll('[src]')) { const p = resolve(page, el.getAttribute('src')); if (p && S.files.has(p)) el.setAttribute('src', assetUrl(p)); }
  for (const el of clone.querySelectorAll('[poster]')) { const p = resolve(page, el.getAttribute('poster')); if (p && S.files.has(p)) el.setAttribute('poster', assetUrl(p)); }
  for (const el of clone.querySelectorAll('[srcset]')) el.setAttribute('srcset', rewriteSrcset(el.getAttribute('srcset'), page));
  for (const el of clone.querySelectorAll('[style*="url("]')) el.setAttribute('style', rewriteCssUrls(el.getAttribute('style'), page));
  for (const el of clone.querySelectorAll('svg image[href], use[href]')) { const p = resolve(page, el.getAttribute('href')); if (p && S.files.has(p)) el.setAttribute('href', assetUrl(p)); }
  for (const el of clone.querySelectorAll('style')) el.textContent = rewriteCssUrls(el.textContent, page);
  const head = clone.head;
  const rt = clone.createElement('style'); rt.textContent = SE_RUNTIME_CSS; head.appendChild(rt);
  if (!S.preview) { const ui = clone.createElement('style'); ui.textContent = EDITOR_CSS; head.appendChild(ui); }
  const flag = clone.createElement('script'); flag.textContent = S.preview ? '' : 'window.__SE_EDITOR=true;';
  const run = clone.createElement('script'); run.textContent = '(' + seRuntime.toString() + ')();';
  clone.body.appendChild(flag); clone.body.appendChild(run);
  frame.onload = onFrameLoad;
  frame.srcdoc = '<!DOCTYPE html>\n' + clone.documentElement.outerHTML;
}
function fdoc() { try { return $('#frame').contentDocument; } catch (e) { return null; } }
function fwin() { return $('#frame').contentWindow; }
function rEl(id) { const d = fdoc(); return d && id ? d.querySelector(`[data-se-id="${id}"]`) : null; }
function sEl(id) { return id ? getDoc(S.page).querySelector(`[data-se-id="${id}"]`) : null; }

function onFrameLoad() {
  const d = fdoc(), w = fwin(); if (!d) return;
  try { w.scrollTo(0, S.scroll || 0); } catch (e) { /* ignore */ }
  if (S.preview) {
    d.addEventListener('click', e => {
      const a = e.target.closest('a[href]'); if (!a) return;
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#')) return;
      const p = resolve(S.page, href);
      e.preventDefault();
      if (p && isPage(p) && S.files.has(p)) switchPage(p);
      else if (p && S.files.has(p)) window.open(assetUrl(p), '_blank', 'noopener');
      else if (/^(https?:|mailto:)/.test(href)) window.open(href, '_blank', 'noopener');
    });
    return;
  }
  d.addEventListener('mousemove', onHover, true);
  d.addEventListener('mouseleave', () => drawBox('hover', null), true);
  d.addEventListener('click', onCanvasClick, true);
  d.addEventListener('dblclick', onCanvasDbl, true);
  d.addEventListener('contextmenu', onCanvasMenu, true);
  d.addEventListener('keydown', onKey, true);
  d.addEventListener('submit', e => e.preventDefault(), true);
  w.addEventListener('scroll', () => { drawSelection(); hideCtx(); }, { passive: true });
  w.addEventListener('resize', drawSelection);
  d.body.classList.toggle('se-tool-insert', S.tool !== 'select');
  drawSelection();
  if (S.tlOpen) tlScrub();
}

/* ============ 5. Selection & canvas ============ */
function targetOf(e) {
  let el = e.target;
  if (!el || !el.closest) return null;
  const cd = el.closest('.se-countdown'); if (cd) return cd;
  el = el.closest('[data-se-id]');
  return el && el.tagName !== 'HTML' ? el : null;
}
function ui(kind) {
  const d = fdoc(); if (!d || !d.body) return null;
  let el = d.querySelector(`[data-se-ui="${kind}"]`);
  if (!el) { el = d.createElement('div'); el.setAttribute('data-se-ui', kind); d.documentElement.appendChild(el); }
  return el;
}
function drawBox(kind, target, label) {
  const box = ui(kind); if (!box) return;
  if (!target || target === fdoc().body) { box.style.display = 'none'; return; }
  const r = target.getBoundingClientRect();
  Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  box.className = kind === 'sel' ? 'se-ui-sel' : 'se-ui-hover';
  if (kind === 'sel') {
    const hs = ['0,0', '50%,0', '100%,0', '100%,50%', '0,50%', '0,100%', '50%,100%', '100%,100%'];
    box.innerHTML = `<span class="se-ui-tag">${esc(label || '')}</span>` + hs.map(h => { const [x, y] = h.split(','); return `<span class="se-ui-h" style="left:calc(${x} - 6px);top:calc(${y} - 6px)"></span>`; }).join('');
    if (r.top < 30) box.firstChild.style.top = (r.height + 4) + 'px';
  }
}
function drawSelection() {
  const el = rEl(S.sel);
  drawBox('sel', el, el ? nameOf(sEl(S.sel)) : '');
  const piv = ui('pivot'); if (!piv) return;
  if (S.tlOpen && el) {
    const c = tlCfg(sEl(S.sel)), r = el.getBoundingClientRect();
    const [px, py] = (c.pivot || '50% 50%').split(' ').map(v => parseFloat(v) / 100);
    Object.assign(piv.style, { display: 'block', left: (r.left + r.width * px) + 'px', top: (r.top + r.height * py) + 'px', width: '20px', height: '20px' });
    piv.className = 'se-ui-pivot';
  } else piv.style.display = 'none';
}
function onHover(e) {
  if (S.editing) return;
  const t = targetOf(e);
  drawBox('hover', t && t.getAttribute('data-se-id') !== S.sel ? t : null);
}
function onCanvasClick(e) {
  if (S.editing && e.target.closest('[contenteditable]')) return;
  e.preventDefault(); e.stopPropagation();
  hideCtx(); closeMenus();
  const t = targetOf(e);
  if (S.tool === 'pivot') { setPivotFromClick(e); return; }
  if (S.tool === 'rect' || S.tool === 'text') { insertAt(t, S.tool); setTool('select'); return; }
  if (S.tool === 'image') { pickMedia('image', p => insertImage(t, p)); setTool('select'); return; }
  select(t ? t.getAttribute('data-se-id') : null);
}
function select(id, opts = {}) {
  if (S.editing) finishTextEdit();
  if (id === 'body') id = null;
  const changed = id !== S.sel;
  S.sel = id;
  if (changed) { S.scope = 'one'; S.tlStep = null; if (!opts.keepTab) S.tab = 'design'; }
  drawSelection(); drawBox('hover', null);
  renderLayers(); renderInspector(); renderOptbar();
  if (S.tlOpen) renderTimeline();
  const el = sEl(id);
  $('#statusSel').textContent = el ? nameOf(el) : 'Nothing selected';
}
function nameOf(el) {
  if (!el || !el.tagName) return '';
  const tag = el.tagName.toLowerCase(), cls = mainClass(el);
  let kind;
  if (el.classList.contains('se-countdown')) kind = 'Countdown';
  else if (el.classList.contains('se-shape')) kind = 'Rectangle';
  else if (tag === 'a') kind = /btn|button/.test(el.className) ? 'Button' : 'Link';
  else kind = ({ h1: 'Headline', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading', p: 'Paragraph', img: 'Image', nav: 'Menu bar', header: 'Header', footer: 'Footer',
    section: 'Section', main: 'Main area', article: 'Article', aside: 'Side area', ul: 'List', ol: 'List', li: 'List item', span: 'Text', strong: 'Bold text', em: 'Italic text',
    div: 'Box', button: 'Button', svg: 'Graphic', g: 'Graphic part', path: 'Graphic part', circle: 'Graphic part', rect: 'Graphic part', line: 'Graphic part', polygon: 'Graphic part',
    form: 'Form', input: 'Field', textarea: 'Field', select: 'Dropdown', label: 'Label', iframe: 'Embedded page', video: 'Video', table: 'Table', figure: 'Figure', figcaption: 'Caption', canvas: 'Animation area' })[tag] || 'Box';
  let detail = cls && !/^se-/.test(cls) ? pretty(cls) : '';
  if (!detail && el.id) detail = pretty(el.id);
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
  if (!detail && text && text.length < 40 && !['section', 'nav', 'main', 'header', 'footer', 'ul', 'ol'].includes(tag)) detail = '“' + text + '”';
  if (tag === 'img' && el.getAttribute('alt')) detail = '“' + el.getAttribute('alt').slice(0, 30) + '”';
  const out = detail && detail.toLowerCase() !== kind.toLowerCase() ? `${kind}: ${detail}` : kind;
  return out.length > 48 ? out.slice(0, 46) + '…' : out;
}
function mainClass(el) { return [...(el.classList || [])].find(c => !/^se-/.test(c)) || ''; }

function onCanvasDbl(e) {
  e.preventDefault();
  const t = targetOf(e); if (!t) return;
  startTextEdit(t.getAttribute('data-se-id'));
}
function canEditText(el) {
  if (!el || el.closest('.se-countdown')) return false;
  if (['IMG', 'SVG', 'svg', 'VIDEO', 'IFRAME', 'INPUT', 'SELECT', 'TEXTAREA', 'BODY', 'CANVAS'].includes(el.tagName)) return false;
  if (el.querySelector('img,svg,video,iframe,picture,canvas,input,select,textarea,div,section,ul,ol,table')) return false;
  return (el.textContent || '').trim().length > 0 || el.classList.contains('se-text');
}
function startTextEdit(id) {
  const el = rEl(id);
  if (!canEditText(el)) { toast('Only plain text can be typed into directly. Select a smaller piece.'); return; }
  select(id);
  S.editing = id;
  el.setAttribute('contenteditable', 'true');
  el.focus();
  const d = fdoc(), r = d.createRange(); r.selectNodeContents(el);
  const s = fwin().getSelection(); s.removeAllRanges(); s.addRange(r);
  el.addEventListener('blur', finishTextEdit, { once: true });
  ui('sel').style.display = 'none';
  $('#statusTip').textContent = 'Typing — click outside or press Esc when you’re done';
}
function finishTextEdit() {
  const id = S.editing; if (!id) return;
  S.editing = null;
  const r = rEl(id), s = sEl(id);
  $('#statusTip').textContent = 'Tip: right-click anything to turn it into a button or countdown';
  if (!r || !s) return;
  r.removeAttribute('contenteditable');
  const html = r.innerHTML;
  if (html !== s.innerHTML) {
    act(`Changed the words in ${nameOf(s)}`, () => { s.innerHTML = html; assignIds(getDoc(S.page)); }, { render: false });
    r.innerHTML = s.innerHTML; // carry new ids into the canvas
  }
  drawSelection();
}

/* ============ 6. Actions & undo ============ */
function snapshot() {
  const css = [];
  for (const [p, f] of S.files) if (isCss(p)) css.push([p, f.text, f.dirty]);
  return { page: S.page, sel: S.sel, doc: serializeDoc(getDoc(S.page), true), pageDirty: !!(S.files.get(S.page) || {}).dirty,
    css, keys: [...S.files.keys()], changes: S.changes.length };
}
function restore(snap) {
  const d = new DOMParser().parseFromString(snap.doc, 'text/html'); assignIds(d);
  S.docs.set(snap.page, d);
  const f = S.files.get(snap.page); if (f) f.dirty = snap.pageDirty;
  for (const [p, text, dirty] of snap.css) { const cf = S.files.get(p); if (cf && cf.text !== text) { cf.text = text; S.cssVer.set(p, (S.cssVer.get(p) || 0) + 1); } if (cf) cf.dirty = dirty; }
  for (const k of [...S.files.keys()]) if (!snap.keys.includes(k)) S.files.delete(k);
  S.changes.length = Math.min(S.changes.length, snap.changes);
  if (S.page !== snap.page) { S.page = snap.page; if (!S.tabs.includes(snap.page)) S.tabs.push(snap.page); }
  S.sel = snap.sel && d.querySelector(`[data-se-id="${snap.sel}"]`) ? snap.sel : null;
  renderAll(); renderFrame();
}
function act(label, fn, opts = {}) {
  S.undo.push(snapshot()); if (S.undo.length > 60) S.undo.shift();
  S.redo = [];
  fn();
  const f = S.files.get(S.page); if (f && opts.pageDirty !== false) f.dirty = true;
  logChange(label, opts.where || pageName(S.page));
  if (opts.render !== false) renderFrame();
  renderPages(); renderLayers(); renderInspector(); renderOptbar(); renderTeamKit(); updateCount();
  if (S.tlOpen && opts.timeline !== false) renderTimeline();
  scheduleSave();
}
function logChange(text, where) {
  const last = S.changes[S.changes.length - 1];
  if (last && last.text === text && last.where === where) return;
  S.changes.push({ text, where, at: Date.now() });
}
function undo() { if (!S.undo.length) return toast('Nothing to undo'); S.redo.push(snapshot()); restore(S.undo.pop()); scheduleSave(); }
function redo() { if (!S.redo.length) return toast('Nothing to redo'); S.undo.push(snapshot()); restore(S.redo.pop()); scheduleSave(); }
function updateCount() {
  const n = S.changes.length, c = $('#changeCount');
  c.hidden = !n; c.textContent = n;
}

/* Structure edits */
const BLOCKS = new Set(['BODY', 'MAIN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'DIV', 'FORM', 'NAV']);
function placeNew(target, el) {
  const doc = getDoc(S.page);
  const s = target ? sEl(target.getAttribute('data-se-id')) : null;
  if (s && BLOCKS.has(s.tagName) && !s.classList.contains('se-shape') && !s.classList.contains('se-countdown')) s.appendChild(el);
  else if (s && s !== doc.body) s.after(el);
  else (doc.querySelector('main') || doc.body).appendChild(el);
  assignIds(doc);
  return el.getAttribute('data-se-id');
}
function insertAt(target, kind) {
  const doc = getDoc(S.page); let id;
  act(kind === 'rect' ? 'Added a rectangle' : 'Added text', () => {
    let el;
    if (kind === 'rect') {
      el = doc.createElement('div'); el.className = 'se-shape';
      el.setAttribute('style', 'width: 200px; height: 48px; background: #808080; display: flex; align-items: center; justify-content: center; padding: 0 24px; box-sizing: border-box;');
      el.textContent = '';
    } else {
      el = doc.createElement('p'); el.className = 'se-text'; el.textContent = 'Type something here';
    }
    id = placeNew(target, el);
  });
  setTimeout(() => { select(id); if (kind === 'text') setTimeout(() => startTextEdit(id), 60); }, 80);
}
function insertImage(target, path) {
  const doc = getDoc(S.page); let id;
  act(`Added the image ${path.split('/').pop()}`, () => {
    const img = doc.createElement('img');
    img.setAttribute('src', relPath(S.page, path)); img.setAttribute('alt', '');
    img.setAttribute('style', 'max-width: 100%; height: auto; display: block;');
    id = placeNew(target, img);
  });
  setTimeout(() => select(id), 80);
}
function insertCountdown(target) {
  const doc = getDoc(S.page); let id;
  act('Added a countdown', () => {
    const el = doc.createElement('div'); el.className = 'se-countdown';
    el.setAttribute('data-se-countdown', JSON.stringify(defaultCountdown()));
    id = placeNew(target, el);
  });
  setTimeout(() => { S.tab = 'countdown'; select(id, { keepTab: true }); }, 80);
}
function defaultCountdown() {
  const d = new Date(Date.now() + 30 * 86400000); d.setHours(9, 0, 0, 0);
  return { show: 'd', label: 'Counting down to', queue: [{ name: 'Next event', date: localISO(d) }], auto: true, upnext: true, zero: 'day', zeroText: 'Happening now!', after: 'hide', afterText: 'See you next season' };
}
function localISO(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function duplicateSel() {
  const s = sEl(S.sel); if (!s || s === getDoc(S.page).body) return;
  let id;
  act(`Duplicated ${nameOf(s)}`, () => {
    const c = s.cloneNode(true);
    c.removeAttribute('data-se-id'); for (const k of c.querySelectorAll('[data-se-id]')) k.removeAttribute('data-se-id');
    if (c.id) c.removeAttribute('id');
    s.after(c); assignIds(getDoc(S.page)); id = c.getAttribute('data-se-id');
  });
  setTimeout(() => select(id), 80);
}
function deleteSel() {
  const s = sEl(S.sel); if (!s || s === getDoc(S.page).body) return;
  act(`Deleted ${nameOf(s)}`, () => s.remove());
  S.sel = null; select(null);
}
function moveSel(dir) {
  const s = sEl(S.sel); if (!s) return;
  const sib = dir < 0 ? s.previousElementSibling : s.nextElementSibling;
  if (!sib) return toast(dir < 0 ? 'It’s already first in its group' : 'It’s already last in its group');
  act(`Moved ${nameOf(s)} ${dir < 0 ? 'up' : 'down'}`, () => { if (dir < 0) sib.before(s); else sib.after(s); });
  setTimeout(drawSelection, 80);
}
function replaceTag(s, tag, extra) {
  const doc = getDoc(S.page), n = doc.createElement(tag);
  for (const a of s.attributes) n.setAttribute(a.name, a.value);
  while (s.firstChild) n.appendChild(s.firstChild);
  if (extra) extra(n);
  s.replaceWith(n);
  return n;
}
function turnIntoButton() {
  const s = sEl(S.sel); if (!s) return;
  if (s.tagName === 'A') { S.tab = 'link'; renderInspector(); return; }
  const r = rEl(S.sel), disp = r ? fwin().getComputedStyle(r).display : 'inline-block';
  act(`Turned ${nameOf(s)} into a button`, () => {
    replaceTag(s, 'a', n => {
      n.setAttribute('href', '#'); n.classList.add('se-button');
      if (disp !== 'inline') n.style.display = disp === 'block' ? 'block' : disp;
    });
  });
  S.tab = 'link'; renderInspector();
  setTimeout(drawSelection, 80);
}
function turnIntoShape() {
  const s = sEl(S.sel); if (!s || s.tagName !== 'A') return;
  act(`Turned ${nameOf(s)} back into a plain shape`, () => {
    replaceTag(s, 'div', n => { n.removeAttribute('href'); n.removeAttribute('target'); n.removeAttribute('rel'); n.classList.remove('se-button'); if (!n.className) n.removeAttribute('class'); });
  });
  S.tab = 'design'; renderInspector();
}
function turnIntoCountdown() {
  const s = sEl(S.sel); if (!s) return;
  if (s.classList.contains('se-countdown')) { S.tab = 'countdown'; renderInspector(); return; }
  act(`Turned ${nameOf(s)} into a countdown`, () => {
    const n = replaceTag(s, 'div', n => {
      n.classList.add('se-countdown'); n.removeAttribute('href');
      for (const k of ['width', 'height', 'display', 'align-items', 'justify-content']) n.style.removeProperty(k);
      if (!n.getAttribute('style')) n.removeAttribute('style');
      n.setAttribute('data-se-countdown', JSON.stringify(defaultCountdown()));
    });
    n.innerHTML = '';
  });
  S.tab = 'countdown'; renderInspector();
  setTimeout(drawSelection, 120);
}

/* ============ 7. Styles & CSS ============ */
function topRules(css) {
  const out = []; let i = 0, depth = 0, start = 0; const n = css.length;
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") { i++; while (i < n && css[i] !== c) { if (css[i] === '\\') i++; i++; } i++; continue; }
    if (c === '{') { if (depth === 0) out.push({ sel: css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '').trim(), open: i }); depth++; }
    else if (c === '}') { depth--; if (depth === 0 && out.length) { out[out.length - 1].close = i; start = i + 1; } if (depth < 0) depth = 0; }
    else if (c === ';' && depth === 0) start = i + 1;
    i++;
  }
  return out.filter(r => r.close != null && !r.sel.startsWith('@'));
}
const normSel = s => s.trim().replace(/\s+/g, ' ');
function findRule(css, selector) { return topRules(css).find(r => r.sel.split(',').map(normSel).includes(selector)); }
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function setDecl(path, selector, prop, value) {
  let css = fileText(path) || '';
  const r = findRule(css, selector);
  const re = new RegExp('(^|[;{\\s])' + escRe(prop) + '\\s*:[^;}]*;?', 'i');
  if (r) {
    let body = css.slice(r.open + 1, r.close);
    if (re.test(body)) body = body.replace(re, (m, pre) => value === '' ? pre : `${pre}${prop}: ${value};`);
    else if (value !== '') { const t = body.replace(/\s*$/, ''); body = t + (t && !/[;{]$/.test(t) ? ';' : '') + `\n  ${prop}: ${value};\n`; }
    css = css.slice(0, r.open + 1) + body + css.slice(r.close);
  } else if (value !== '') {
    css = css.replace(/\s*$/, '') + `\n\n${selector} {\n  ${prop}: ${value};\n}\n`;
  }
  setText(path, css);
}
function pageSheets(page) {
  const doc = getDoc(page), out = [];
  for (const l of doc.querySelectorAll('link[rel~="stylesheet"][href]')) { const p = resolve(page, l.getAttribute('href')); if (p && S.files.has(p)) out.push(p); }
  return out;
}
function mainSheet(create) {
  const own = pageSheets(S.page); if (own.length) return own[0];
  const any = [...S.files.keys()].find(isCss); if (any) return any;
  if (!create) return null;
  const p = 'site-editor.css';
  setText(p, '/* Styles added by Site Editor */\n', true);
  const doc = getDoc(S.page), l = doc.createElement('link');
  l.rel = 'stylesheet'; l.href = relPath(S.page, p); doc.head.appendChild(l);
  return p;
}
function sheetWithRule(selector) {
  const order = [...pageSheets(S.page), ...[...S.files.keys()].filter(isCss)];
  return order.find(p => findRule(fileText(p) || '', selector)) || null;
}
function refreshCss(path) {
  const d = fdoc(); if (!d) return;
  for (const l of d.querySelectorAll(`link[data-se-css="${CSS.escape(path)}"]`)) l.href = cssUrl(path);
  setTimeout(drawSelection, 60);
}
const PX_PROPS = new Set(['font-size', 'letter-spacing', 'width', 'height', 'padding', 'border-radius', 'border-width', 'margin', 'gap', 'max-width']);
function normVal(prop, v) {
  v = String(v).trim();
  if (PX_PROPS.has(prop)) v = v.split(/\s+/).map(x => /^-?\d*\.?\d+$/.test(x) ? x + 'px' : x).join(' ');
  return v;
}
function setStyle(prop, value, label) {
  const s = sEl(S.sel); if (!s) return;
  value = normVal(prop, value);
  const cls = mainClass(s);
  if (S.scope === 'all' && cls) {
    const sel = '.' + cls, path = sheetWithRule(sel) || mainSheet(true), hadInline = !!s.style.getPropertyValue(prop);
    act(`Changed the ${label} of every ${pretty(cls).toLowerCase()}`, () => {
      setDecl(path, sel, prop, value);
      if (s.style.getPropertyValue(prop)) { s.style.removeProperty(prop); if (!s.getAttribute('style')) s.removeAttribute('style'); }
    }, { render: false, where: 'Every page', pageDirty: hadInline });
    const r = rEl(S.sel); if (r) r.style.removeProperty(prop);
    refreshCss(path);
  } else {
    act(`Changed the ${label} of ${nameOf(s)}`, () => {
      if (value === '') s.style.removeProperty(prop); else s.style.setProperty(prop, value);
      if (!s.getAttribute('style')) s.removeAttribute('style');
    }, { render: false });
    const r = rEl(S.sel); if (r) { if (value === '') r.style.removeProperty(prop); else r.style.setProperty(prop, value); }
    setTimeout(drawSelection, 30);
  }
}
function teamColors() {
  const out = [], seen = new Set();
  for (const [p] of S.files) {
    if (!isCss(p)) continue;
    const css = fileText(p) || '';
    for (const r of topRules(css)) {
      if (!r.sel.split(',').map(normSel).includes(':root')) continue;
      const body = css.slice(r.open + 1, r.close).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) {
        const v = m[2].trim();
        if (!/^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(|hsl\()/i.test(v) && !/^(rgba|hsla)\([^)]*[,\/]\s*1(\.0+)?\s*\)$/i.test(v) || seen.has(m[1])) continue;
        seen.add(m[1]); out.push({ prop: m[1], name: pretty(m[1]), value: v, path: p });
      }
    }
  }
  return out;
}
const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'system-ui', 'cursive', 'fantasy', 'inherit', 'initial', 'unset', 'ui-sans-serif', 'ui-monospace', 'ui-serif', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica', 'helvetica neue', 'arial', 'emoji']);
function teamFonts() {
  const fams = [];
  const add = f => { f = f.replace(/['"]/g, '').trim(); if (f && !GENERIC.has(f.toLowerCase()) && !f.startsWith('var(') && !fams.includes(f)) fams.push(f); };
  const fromGoogle = url => { for (const m of url.matchAll(/family=([^&:;'")]+)/g)) add(decodeURIComponent(m[1].replace(/\+/g, ' '))); };
  for (const [p] of S.files) {
    if (isCss(p)) {
      const css = fileText(p) || '';
      for (const m of css.matchAll(/@import\s+url\(\s*['"]?([^'")]+)/g)) if (m[1].includes('fonts.googleapis')) fromGoogle(m[1]);
      for (const m of css.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*([^;]+)/g)) add(m[1]);
      for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/g)) add(m[1].split(',')[0]);
    } else if (isPage(p)) {
      const html = fileText(p) || '';
      for (const m of html.matchAll(/href=["']([^"']*fonts\.googleapis[^"']*)/g)) fromGoogle(m[1].replace(/&amp;/g, '&'));
    }
  }
  return fams;
}
function fontStack(f) { return `"${f}", ${/mono|code/i.test(f) ? 'monospace' : /serif|garamond|playfair|merriweather|lora/i.test(f) && !/sans/i.test(f) ? 'serif' : 'sans-serif'}`; }
function rgbToHex(c) {
  const m = String(c).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!m) return /^#/.test(c) ? c : '#000000';
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return 'transparent';
  return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function resolvedHex(value) {
  const d = fdoc(); if (!d || !d.body) return value;
  const probe = d.createElement('i'); probe.style.color = value; probe.setAttribute('data-se-ui', 'probe'); d.body.appendChild(probe);
  const out = rgbToHex(fwin().getComputedStyle(probe).color); probe.remove(); return out;
}

/* ============ 8. Panels ============ */
function renderAll() { renderPages(); renderTabs(); renderLayers(); renderInspector(); renderTeamKit(); renderOptbar(); renderTimeline(); updateCount(); }
function renderPages() {
  const box = $('#pageList');
  box.innerHTML = allPages().map(p => {
    const f = S.files.get(p);
    return `<button class="item ${p === S.page ? 'on' : ''}" data-page="${esc(p)}" title="${esc(p)}">${f.dirty || f.isNew ? '<span class="dot" title="Changed"></span>' : ''}${esc(pageName(p))}${p.includes('/') ? `<span class="muted">${esc(dirOf(p))}</span>` : ''}</button>`;
  }).join('') + `<button class="item" id="newPageBtn">${icon(I.plus)}New page</button>`;
  $$('[data-page]', box).forEach(b => b.onclick = () => switchPage(b.dataset.page));
  $('#newPageBtn').onclick = newPage;
}
function renderTabs() {
  if (!S.tabs.includes(S.page)) S.tabs.push(S.page);
  $('#docTabs').innerHTML = S.tabs.map(p => `<button class="${p === S.page ? 'on' : ''}" data-tab="${esc(p)}">${esc(pageName(p))}${S.tabs.length > 1 ? `<span data-close="${esc(p)}" aria-label="Close tab" style="margin-left:12px;color:var(--dim)">×</span>` : ''}</button>`).join('');
  $$('[data-tab]', $('#docTabs')).forEach(b => b.onclick = e => {
    const c = e.target.closest('[data-close]');
    if (c) { S.tabs = S.tabs.filter(t => t !== c.dataset.close); if (S.page === c.dataset.close) switchPage(S.tabs[0]); else renderTabs(); return; }
    switchPage(b.dataset.tab);
  });
}
function switchPage(p) {
  if (S.editing) finishTextEdit();
  S.page = p; S.sel = null; S.scroll = 0; S.tlStep = null;
  if (!S.tabs.includes(p)) S.tabs.push(p);
  renderAll(); renderFrame(false); scheduleSave();
}
function newPage() {
  modal('New page', `<label class="field">Page name<input id="npName" class="inp" placeholder="e.g. Outreach" autofocus></label><p class="hint">It starts as a copy of the ${esc(pageName(S.page))} page so the menu and footer come along. Change anything after.</p>`,
    [['Cancel'], ['Make page', true, () => {
      const name = $('#npName').value.trim(); if (!name) { toast('Give the page a name first'); return false; }
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
      let p = (dirOf(S.page) ? dirOf(S.page) + '/' : '') + slug + '.html', n = 2;
      while (S.files.has(p)) p = p.replace(/(-\d+)?\.html$/, `-${n++}.html`);
      const html = serializeDoc(getDoc(S.page)).replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(name)}</title>`);
      S.undo.push(snapshot());
      S.files.set(p, { kind: 'text', text: html, type: 'text/html', dirty: true, isNew: true });
      logChange(`Made a new page called ${name}`, name);
      switchPage(p); updateCount();
    }]]);
}
function renderLayers() {
  const box = $('#layerList'); if (!S.page) return;
  const doc = getDoc(S.page), selEl = sEl(S.sel), path = new Set();
  for (let e = selEl; e && e !== doc.body; e = e.parentElement) path.add(e);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'BR', 'TEMPLATE']);
  const rows = []; let count = 0;
  (function walk(el, depth) {
    for (const c of el.children) {
      if (SKIP.has(c.tagName) || count > 500) continue;
      count++;
      rows.push(`<button class="item ${c === selEl ? 'on' : ''}" data-layer="${c.getAttribute('data-se-id')}" style="padding-left:${10 + depth * 14}px">${esc(nameOf(c))}</button>`);
      if ((depth < 1 || path.has(c)) && !c.classList.contains('se-countdown')) walk(c, depth + 1);
    }
  })(doc.body, 0);
  box.innerHTML = rows.join('') || '<p class="empty">This page is empty.</p>';
  $$('[data-layer]', box).forEach(b => b.onclick = () => { select(b.dataset.layer); const r = rEl(b.dataset.layer); if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  const on = $('.item.on', box); if (on) on.scrollIntoView({ block: 'nearest' });
}

/* Small builders */
const seg = (name, opts, val) => `<div class="seg full" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(val) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const tog = (name, on, label) => `<label class="toggle">${label}<input type="checkbox" data-tog="${name}" ${on ? 'checked' : ''}><span class="sw"></span></label>`;
function bindSeg(root, name, fn) { const s = $(`[data-seg="${name}"]`, root); if (s) $$('button', s).forEach(b => b.onclick = () => fn(b.dataset.v)); }
function bindTog(root, name, fn) { const t = $(`[data-tog="${name}"]`, root); if (t) t.onchange = () => fn(t.checked); }
function swatchRow(prop, label, current, allowNone) {
  const cur = rgbToHex(current);
  const sw = teamColors().map(c => `<button class="swatch ${resolvedHex(c.value) === cur ? 'on' : ''}" title="${esc(c.name)}" aria-label="${esc(c.name)}" style="background:${esc(c.value)}" data-color="var(${c.prop})" data-prop="${prop}" data-label="${label}"></button>`).join('');
  const none = allowNone ? `<button class="swatch ${cur === 'transparent' ? 'on' : ''}" title="None" aria-label="None" data-color="transparent" data-prop="${prop}" data-label="${label}" style="background:linear-gradient(135deg,transparent 45%,#E5484D 45%,#E5484D 55%,transparent 55%),var(--input)"></button>` : '';
  return `<div class="swatches">${none}${sw}<label class="swatch add" title="Pick any color" style="display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative">+<input type="color" value="${cur === 'transparent' ? '#ffffff' : cur}" data-prop="${prop}" data-label="${label}" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>`;
}

function renderInspector() {
  const tabsBox = $('#inspectorTabs'), body = $('#inspector');
  if (!S.page) return;
  const s = sEl(S.sel);
  if (!s) {
    $('#statusSel').textContent = 'Nothing selected';
    tabsBox.innerHTML = '<span class="on">Page</span>';
    const doc = getDoc(S.page), desc = doc.querySelector('meta[name="description"]');
    body.innerHTML = `<p class="hint">Click something on the page to change it. Double-click text to type. Right-click for more.</p>
      <label class="field">Name in the browser tab<input class="inp" id="pgTitle" value="${esc(doc.title)}"></label>
      <label class="field">Search engine summary<textarea class="inp" id="pgDesc" rows="3">${esc(desc ? desc.getAttribute('content') : '')}</textarea></label>`;
    $('#pgTitle').onchange = e => act('Changed the page name', () => { doc.title = e.target.value; }, { render: false });
    $('#pgDesc').onchange = e => act('Changed the search engine summary', () => {
      let m = doc.querySelector('meta[name="description"]');
      if (!m) { m = doc.createElement('meta'); m.name = 'description'; doc.head.appendChild(m); }
      m.setAttribute('content', e.target.value);
    }, { render: false });
    return;
  }
  const tabs = [['design', 'Design']];
  if (s.tagName === 'A') tabs.push(['link', 'Link']);
  if (s.classList.contains('se-countdown')) tabs.push(['countdown', 'Countdown']);
  tabs.push(['motion', 'Motion']);
  if (!tabs.some(t => t[0] === S.tab)) S.tab = 'design';
  tabsBox.innerHTML = tabs.map(([k, l]) => `<button class="${k === S.tab ? 'on' : ''}" data-itab="${k}">${l}</button>`).join('');
  $$('[data-itab]', tabsBox).forEach(b => b.onclick = () => { S.tab = b.dataset.itab; renderInspector(); });
  $('#statusSel').textContent = nameOf(s);
  ({ design: inspDesign, link: inspLink, countdown: inspCountdown, motion: inspMotion })[S.tab](s, body);
}

function inspDesign(s, body) {
  const r = rEl(S.sel), cs = r ? fwin().getComputedStyle(r) : null, g = k => cs ? cs.getPropertyValue(k) : '';
  const cls = mainClass(s), fonts = teamFonts();
  const curFont = (g('font-family').split(',')[0] || '').replace(/['"]/g, '').trim();
  const leaf = !s.children.length && !['IMG', 'svg', 'SVG', 'INPUT', 'IFRAME', 'VIDEO'].includes(s.tagName) && !s.classList.contains('se-countdown');
  const W = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold']];
  const px = v => { const n = parseFloat(v); return isNaN(n) ? '' : Math.round(n * 10) / 10; };
  const ls = g('letter-spacing') === 'normal' ? 0 : px(g('letter-spacing'));
  const lh = g('line-height') === 'normal' ? 'normal' : (px(g('line-height')) / (parseFloat(g('font-size')) || 16)).toFixed(2).replace(/\.?0+$/, '');
  const align = ['left', 'center', 'right'].includes(g('text-align')) ? g('text-align') : (g('text-align') === 'start' ? 'left' : '');
  body.innerHTML = `
    <span class="hint">${esc(nameOf(s))}</span>
    ${cls ? `<div class="field">Apply changes to${seg('scope', [['one', 'Just this one'], ['all', 'Every one like this']], S.scope)}</div>
      <span class="hint" style="margin-top:-6px">${S.scope === 'all' ? `Changes every ${esc(pretty(cls).toLowerCase())} on every page.` : 'Only this one changes.'}</span>` : ''}
    ${leaf ? `<label class="field">Words<textarea class="inp" id="dWords" rows="2">${esc(s.textContent)}</textarea></label>` : ''}
    ${s.tagName === 'IMG' ? `<div class="field">Image<button class="btn" id="dSwap">Swap image…</button></div>
      <label class="field">Describe it for people who can’t see it<input class="inp" id="dAlt" value="${esc(s.getAttribute('alt') || '')}"></label>` : ''}
    <span class="h">Text</span>
    <label class="field">Font<select class="inp" data-prop="font-family" data-label="font">
      ${fonts.map(f => `<option value='${esc(fontStack(f))}' ${f === curFont ? 'selected' : ''}>${esc(f)}</option>`).join('')}
      ${curFont && !fonts.includes(curFont) ? `<option selected value="">${esc(curFont)} (current)</option>` : ''}
      <option value="__add">+ Add a team font…</option></select></label>
    <div class="grid2">
      <label class="field">Size<input class="inp num" data-prop="font-size" data-label="text size" value="${px(g('font-size'))}"></label>
      <label class="field">Weight<select class="inp" data-prop="font-weight" data-label="text weight">${W.map(([v, l]) => `<option value="${v}" ${String(v) === g('font-weight') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">Letter spacing<input class="inp num" data-prop="letter-spacing" data-label="letter spacing" value="${ls}"></label>
      <label class="field">Line height<input class="inp num" data-prop="line-height" data-label="line height" value="${lh}"></label>
    </div>
    <div class="field">Align${seg('align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], align)}</div>
    <div class="field">Text color${swatchRow('color', 'text color', g('color'))}</div>
    <span class="h">Look</span>
    <div class="field">Fill${swatchRow('background-color', 'fill', g('background-color'), true)}</div>
    <div class="grid2">
      <label class="field">Width<input class="inp num" data-prop="width" data-label="width" value="${s.style.width || px(g('width'))}"></label>
      <label class="field">Height<input class="inp num" data-prop="height" data-label="height" value="${s.style.height || px(g('height'))}"></label>
      <label class="field">Space inside<input class="inp num" data-prop="padding" data-label="space inside" value="${esc(g('padding').replace(/px/g, ''))}"></label>
      <label class="field">Corners<input class="inp num" data-prop="border-radius" data-label="corners" value="${px(g('border-top-left-radius'))}"></label>
    </div>
    <div class="grid2">
      <label class="field">Outline<input class="inp num" id="dOutline" value="${px(g('border-top-width'))}"></label>
      <label class="field">See-through<input class="inp num" id="dOpacity" value="${Math.round((1 - parseFloat(g('opacity') || 1)) * 100)}%"></label>
    </div>
    <div class="field">Outline color${swatchRow('border-color', 'outline color', g('border-top-color'))}</div>
    <span class="h">Arrange</span>
    <div class="grid2"><button class="btn" data-cmd="moveUp">Move up</button><button class="btn" data-cmd="moveDown">Move down</button>
      <button class="btn" data-cmd="duplicate">Duplicate</button><button class="btn btn-danger" data-cmd="delete">Delete</button></div>
    <p class="hint">Right-click it on the page to turn it into a button or countdown.</p>`;
  bindSeg(body, 'scope', v => { S.scope = v; renderInspector(); });
  bindSeg(body, 'align', v => setStyle('text-align', v, 'alignment'));
  $$('[data-prop]', body).forEach(el => {
    if (el.classList.contains('swatch') && el.tagName === 'BUTTON') el.onclick = () => setStyle(el.dataset.prop, el.dataset.color, el.dataset.label);
    else el.onchange = () => {
      if (el.value === '__add') { addFontModal(); return; }
      setStyle(el.dataset.prop, el.value, el.dataset.label);
    };
  });
  const w = $('#dWords', body); if (w) w.onchange = () => act(`Changed the words in ${nameOf(s)}`, () => { s.textContent = w.value; });
  const alt = $('#dAlt', body); if (alt) alt.onchange = () => act('Described an image', () => s.setAttribute('alt', alt.value), { render: false });
  const sw = $('#dSwap', body); if (sw) sw.onclick = () => pickMedia('image', p => act(`Swapped an image for ${p.split('/').pop()}`, () => s.setAttribute('src', relPath(S.page, p))));
  $('#dOutline', body).onchange = e => {
    const v = parseFloat(e.target.value) || 0;
    setStyle('border', v ? `${v}px solid ${s.style.borderColor || 'currentColor'}` : 'none', 'outline');
  };
  $('#dOpacity', body).onchange = e => { const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)); setStyle('opacity', String(Math.round((100 - v)) / 100), 'see-through amount'); };
  bindCmds(body);
}

function linkKind(href) {
  if (!href || href === '#') return 'page';
  if (/^mailto:/i.test(href)) return 'email';
  if (/^https?:|^\/\//i.test(href)) return 'website';
  const p = resolve(S.page, href);
  return p && !isPage(p) ? 'document' : 'page';
}
function inspLink(s, body) {
  const href = s.getAttribute('href') || '';
  S.linkKind = S.linkKind && S.linkFor === S.sel ? S.linkKind : linkKind(href);
  S.linkFor = S.sel;
  const target = resolve(S.page, href);
  let list = '';
  if (S.linkKind === 'page') {
    list = `<input class="inp" id="lSearch" placeholder="Search pages"><div class="link-list" id="lList">${allPages().map(p => `<button data-href="${esc(relPath(S.page, p))}" data-name="${esc(pageName(p))}" class="${p === target ? 'on' : ''}">${icon(I.page)}<span style="flex:1">${esc(pageName(p))}</span>${p === target ? icon(I.check) : ''}</button>`).join('')}</div>
      <button class="btn btn-dashed" id="lNewPage">${icon(I.plus)}Make a new page</button>`;
  } else if (S.linkKind === 'website') {
    list = `<label class="field">Web address<input class="inp" id="lUrl" placeholder="https://" value="${/^https?:/.test(href) ? esc(href) : ''}"></label>`;
  } else if (S.linkKind === 'document') {
    const docs = [...S.files.keys()].filter(p => DOC_EXT.test(p) && !isPage(p));
    list = `<div class="link-list">${docs.length ? docs.map(p => `<button data-href="${esc(relPath(S.page, p))}" data-name="${esc(pretty(p.split('/').pop()))}" class="${p === target ? 'on' : ''}">${icon(I.doc)}<span style="flex:1">${esc(pretty(p.split('/').pop()))}</span>${p === target ? icon(I.check) : ''}</button>`).join('') : '<p class="empty">No documents yet.</p>'}</div>
      <button class="btn btn-dashed" id="lUpload">${icon(I.plus)}Add a document</button>`;
  } else {
    list = `<label class="field">Email address<input class="inp" id="lMail" type="email" placeholder="team@example.org" value="${esc(href.replace(/^mailto:/i, ''))}"></label>`;
  }
  body.innerHTML = `<span class="hint">${esc(nameOf(s))}</span>
    <span class="h">When someone clicks it, go to</span>
    <div class="box accent">${seg('lkind', [['page', 'Page'], ['website', 'Website'], ['document', 'Document'], ['email', 'Email']], S.linkKind)}${list}</div>
    ${tog('newtab', s.getAttribute('target') === '_blank', 'Open in a new tab')}
    <button class="btn btn-ghost" id="lPlain" style="justify-content:flex-start;padding:0">Turn back into a plain shape</button>`;
  bindSeg(body, 'lkind', v => { S.linkKind = v; renderInspector(); });
  const setHref = (h, label) => {
    act(`Pointed ${nameOf(s)} to ${label}`, () => s.setAttribute('href', h), { render: false });
    const r = rEl(S.sel); if (r) r.setAttribute('href', h);
  };
  $$('[data-href]', body).forEach(b => b.onclick = () => setHref(b.dataset.href, b.dataset.name));
  const se = $('#lSearch', body); if (se) se.oninput = () => $$('#lList button', body).forEach(b => { b.hidden = !b.dataset.name.toLowerCase().includes(se.value.toLowerCase()); });
  const u = $('#lUrl', body); if (u) u.onchange = () => { let v = u.value.trim(); if (v && !/^[a-z]+:/i.test(v)) v = 'https://' + v; setHref(v, v.replace(/^https?:\/\//, '')); };
  const m = $('#lMail', body); if (m) m.onchange = () => setHref('mailto:' + m.value.trim(), m.value.trim());
  const np = $('#lNewPage', body); if (np) np.onclick = newPage;
  const up = $('#lUpload', body); if (up) up.onclick = () => pickMedia('doc', p => setHref(relPath(S.page, p), pretty(p.split('/').pop())));
  bindTog(body, 'newtab', on => {
    act(on ? `Made ${nameOf(s)} open in a new tab` : `Made ${nameOf(s)} open in the same tab`, () => {
      if (on) { s.setAttribute('target', '_blank'); s.setAttribute('rel', 'noopener'); } else { s.removeAttribute('target'); s.removeAttribute('rel'); }
    }, { render: false });
  });
  $('#lPlain', body).onclick = turnIntoShape;
}

function cdCfg(s) { try { return Object.assign(defaultCountdown(), JSON.parse(s.getAttribute('data-se-countdown') || '{}')); } catch (e) { return defaultCountdown(); } }
function inspCountdown(s, body) {
  const c = cdCfg(s), now = Date.now();
  let foundNow = false, foundNext = false;
  const statuses = c.queue.map((q, i) => {
    const t = new Date(q.date).getTime();
    if (!q.date || isNaN(t)) return ['Pick a date', ''];
    if (c.auto === false && i > 0) return ['Won’t run', ''];
    if (t <= now) return ['Done', ''];
    if (!foundNow) { foundNow = true; return ['Counting now', 'accent']; }
    if (!foundNext) { foundNext = true; return ['Up next', '']; }
    return ['Later', ''];
  });
  body.innerHTML = `
    <span class="h">Show</span>${seg('show', [['d', 'Days'], ['dh', 'Days + hours'], ['dhms', 'To the second']], c.show)}
    <label class="field">Words above the timer<input class="inp" id="cLabel" value="${esc(c.label)}"></label>
    <span class="h">Count down to</span>
    <span class="hint" style="margin-top:-6px">When one date passes, the next one starts.</span>
    <div style="display:flex;flex-direction:column;gap:4px">${c.queue.map((q, i) => `
      <div class="queue-item ${statuses[i][1] ? 'now' : ''}">
        <span class="q-n">${i + 1}</span>
        <div class="q-fields"><input class="inp" data-q="${i}" data-f="name" value="${esc(q.name)}" placeholder="Event name" aria-label="Event name"><input class="inp num" type="datetime-local" data-q="${i}" data-f="date" value="${esc(q.date)}" aria-label="Date and time"></div>
        <div class="q-side"><span class="tag ${statuses[i][1]}">${statuses[i][0]}</span><div class="mini">
          <button data-qa="up" data-q="${i}" aria-label="Move earlier">${icon(I.up)}</button><button data-qa="down" data-q="${i}" aria-label="Move later">${icon(I.down)}</button><button data-qa="del" data-q="${i}" aria-label="Remove">${icon(I.x)}</button></div></div>
      </div>`).join('')}</div>
    <button class="btn btn-dashed" id="cAdd">${icon(I.plus)}Add another date</button>
    ${tog('auto', c.auto !== false, 'Start the next date automatically')}
    ${tog('upnext', c.upnext !== false, 'Show “Up next” under the timer')}
    <label class="field">When it hits zero<select class="inp" id="cZero"><option value="day" ${c.zero !== 'none' ? 'selected' : ''}>Show a message for 1 day</option><option value="none" ${c.zero === 'none' ? 'selected' : ''}>Go straight to the next date</option></select></label>
    ${c.zero !== 'none' ? `<label class="field">Message<input class="inp" id="cZeroText" value="${esc(c.zeroText)}"></label>` : ''}
    <label class="field">After the last date<select class="inp" id="cAfter"><option value="hide" ${c.after === 'hide' ? 'selected' : ''}>Hide the countdown</option><option value="message" ${c.after === 'message' ? 'selected' : ''}>Show a message</option><option value="zeros" ${c.after === 'zeros' ? 'selected' : ''}>Keep showing zeros</option></select></label>
    ${c.after === 'message' ? `<label class="field">Message<input class="inp" id="cAfterText" value="${esc(c.afterText)}"></label>` : ''}
    <button class="btn" id="cPreview">${icon(I.play)}Preview the switch to the next date</button>`;
  const save = (label, mut) => {
    const n = cdCfg(s); mut(n);
    act(label, () => s.setAttribute('data-se-countdown', JSON.stringify(n)), { render: false });
    const r = rEl(S.sel); if (r) { r.setAttribute('data-se-countdown', JSON.stringify(n)); r.__seLast = null; try { fwin().SEWidgets.refresh(); } catch (e) { /* not ready */ } }
    setTimeout(drawSelection, 50);
  };
  bindSeg(body, 'show', v => save('Changed what the countdown shows', n => { n.show = v; }));
  $('#cLabel', body).onchange = e => save('Changed the countdown’s words', n => { n.label = e.target.value; });
  $$('[data-f]', body).forEach(inp => inp.onchange = () => save(inp.dataset.f === 'date' ? 'Changed a countdown date' : 'Renamed a countdown date', n => { n.queue[+inp.dataset.q][inp.dataset.f] = inp.value; }));
  $$('[data-qa]', body).forEach(b => b.onclick = () => {
    const i = +b.dataset.q, a = b.dataset.qa;
    save(a === 'del' ? 'Removed a countdown date' : 'Reordered the countdown dates', n => {
      if (a === 'del') n.queue.splice(i, 1);
      else { const j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= n.queue.length) return; [n.queue[i], n.queue[j]] = [n.queue[j], n.queue[i]]; }
    });
  });
  $('#cAdd', body).onclick = () => save('Added a countdown date', n => {
    const last = n.queue.length ? new Date(n.queue[n.queue.length - 1].date) : new Date();
    const d = isNaN(last) ? new Date() : last; d.setDate(d.getDate() + 7);
    n.queue.push({ name: 'Next event', date: localISO(d) });
  });
  bindTog(body, 'auto', on => save(on ? 'Countdown now moves to the next date' : 'Countdown now stops after one date', n => { n.auto = on; }));
  bindTog(body, 'upnext', on => save('Changed the “Up next” line', n => { n.upnext = on; }));
  $('#cZero', body).onchange = e => save('Changed what shows at zero', n => { n.zero = e.target.value; });
  const zt = $('#cZeroText', body); if (zt) zt.onchange = e => save('Changed the zero message', n => { n.zeroText = e.target.value; });
  $('#cAfter', body).onchange = e => save('Changed what shows after the last date', n => { n.after = e.target.value; });
  const at = $('#cAfterText', body); if (at) at.onchange = e => save('Changed the last message', n => { n.afterText = e.target.value; });
  $('#cPreview', body).onclick = () => {
    const q = cdCfg(s).queue.map(x => ({ name: x.name, t: new Date(x.date).getTime() })).find(x => x.t > Date.now());
    if (!q) { toast('Add a date in the future to preview the switch'); return; }
    try { fwin().SEWidgets.setNowOffset(q.t - Date.now() - 6000); } catch (e) { return; }
    toast(`Showing the last few seconds before ${q.name}…`, 5000);
    clearTimeout(inspCountdown.t);
    inspCountdown.t = setTimeout(() => { try { fwin().SEWidgets.setNowOffset(0); } catch (e) { /* page changed */ } }, 14000);
  };
}

function motionCfg(s) { try { return Object.assign({ effect: 'none', trigger: 'load', speed: 'normal', repeat: 'once', calm: true }, JSON.parse(s.getAttribute('data-se-motion') || '{}')); } catch (e) { return { effect: 'none' }; } }
function inspMotion(s, body) {
  const c = motionCfg(s), tl = tlCfg(s);
  const FX = [['none', 'None'], ['fade', 'Fade in'], ['slide', 'Slide in'], ['grow', 'Grow'], ['spin', 'Spin'], ['float', 'Float'], ['pulse', 'Pulse']];
  const T = [['load', 'When the page loads'], ['view', 'When scrolled into view'], ['hover', 'When hovered'], ['click', 'When clicked']];
  body.innerHTML = `<span class="hint">Pick a quick effect, or build your own in the timeline.</span>
    <span class="h">Quick effects</span>
    <div class="fx-grid">${FX.map(([k, l]) => `<button data-fx="${k}" class="${c.effect === k ? 'on' : ''}">${icon(I[k])}${l}</button>`).join('')}</div>
    ${c.effect !== 'none' ? `<span class="h">Play it</span><div class="radio-list">${T.map(([k, l]) => `<label><input type="radio" name="mtrig" value="${k}" ${c.trigger === k ? 'checked' : ''}>${l}</label>`).join('')}</div>
      <span class="h">Speed</span>${seg('mspeed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], c.speed)}
      <span class="h">Repeat</span>${seg('mrep', [['once', 'Once'], ['forever', 'Forever']], c.repeat)}
      <button class="btn" id="mPlay">${icon(I.play)}Play it</button>` : ''}
    ${tog('calm', c.calm !== false, 'Calm it down for people who turn off motion')}
    <div class="box"><span class="h">Your own animation</span>
      <span class="hint">${tl.steps.length ? `${tl.steps.length} steps · ${tl.duration} seconds${tl.smooth !== false ? ' · smoothed' : ''}` : 'Move, turn, grow or fade it over time, step by step.'}</span>
      <button class="btn" id="mTl">${S.tlOpen ? 'Timeline is open below' : 'Open the timeline'}</button></div>`;
  const save = (label, mut) => {
    const n = motionCfg(s); mut(n);
    act(label, () => { if (n.effect === 'none') s.removeAttribute('data-se-motion'); else s.setAttribute('data-se-motion', JSON.stringify(n)); }, { render: false });
    const r = rEl(S.sel); if (r) { if (n.effect === 'none') r.removeAttribute('data-se-motion'); else { r.setAttribute('data-se-motion', JSON.stringify(n)); playIt(); } }
  };
  const playIt = () => { const r = rEl(S.sel); try { if (r) fwin().SEWidgets.playMotion(r); } catch (e) { /* ignore */ } };
  $$('[data-fx]', body).forEach(b => b.onclick = () => save(b.dataset.fx === 'none' ? `Removed the effect from ${nameOf(s)}` : `Gave ${nameOf(s)} the ${b.textContent.trim().toLowerCase()} effect`, n => {
    n.effect = b.dataset.fx; if (['spin', 'float', 'pulse'].includes(n.effect)) n.repeat = 'forever'; else if (b.dataset.fx !== 'none') n.repeat = 'once';
  }));
  $$('input[name="mtrig"]', body).forEach(r => r.onchange = () => save('Changed when an effect plays', n => { n.trigger = r.value; }));
  bindSeg(body, 'mspeed', v => save('Changed an effect’s speed', n => { n.speed = v; }));
  bindSeg(body, 'mrep', v => save('Changed how often an effect repeats', n => { n.repeat = v; }));
  bindTog(body, 'calm', on => save('Changed the calm-motion setting', n => { n.calm = on; }));
  const p = $('#mPlay', body); if (p) p.onclick = playIt;
  $('#mTl', body).onclick = () => { S.tlOpen = true; renderTimeline(); renderInspector(); drawSelection(); };
}

function renderTeamKit() {
  const box = $('#teamKit'); if (!S.page) return;
  const colors = teamColors(), fonts = teamFonts();
  box.innerHTML = `<span class="h">Team colors</span>
    <div class="swatches">${colors.map((c, i) => `<button class="swatch" data-tc="${i}" title="${esc(c.name)} — click to change it everywhere" aria-label="${esc(c.name)}" style="background:${esc(c.value)}"></button>`).join('')}
      <button class="swatch add" id="tkAddColor" title="Add a team color" aria-label="Add a team color">+</button></div>
    ${colors.length ? '<span class="hint" style="margin-top:-6px">Click a color to change it everywhere.</span>' : ''}
    <span class="h">Team fonts</span>
    <div style="display:flex;flex-direction:column;gap:4px">${fonts.map(f => `<button class="font-btn" data-tf="${esc(f)}" title="Use ${esc(f)} on the selected text"><span style='font-family:${esc(fontStack(f))};font-size:14px'>${esc(f)}</span><small>Use</small></button>`).join('')}
      <button class="btn btn-dashed" id="tkAddFont">${icon(I.plus)}Add a team font</button></div>`;
  $$('[data-tc]', box).forEach(b => b.onclick = () => editColorModal(colors[+b.dataset.tc]));
  $('#tkAddColor').onclick = addColorModal;
  $('#tkAddFont').onclick = addFontModal;
  $$('[data-tf]', box).forEach(b => b.onclick = () => { if (!S.sel) { toast('Select some text first, then pick a font'); return; } setStyle('font-family', fontStack(b.dataset.tf), 'font'); });
}
function editColorModal(c) {
  const hex = resolvedHex(c.value);
  modal(`Change ${c.name}`, `<p class="hint">Everything on the site that uses ${esc(c.name)} will update.</p>
    <div style="display:flex;align-items:center;gap:12px"><input type="color" id="ecVal" value="${hex === 'transparent' ? '#000000' : hex}" style="width:64px;height:44px;padding:0;border:1px solid var(--line);background:none"><input class="inp num" id="ecHex" value="${hex}" style="width:120px"></div>`,
    [['Cancel'], ['Update everywhere', true, () => {
      const v = $('#ecHex').value.trim();
      act(`Changed the team color ${c.name}`, () => setDecl(c.path, ':root', c.prop, v), { render: true, where: 'Every page', pageDirty: false });
    }]]);
  $('#ecVal').oninput = e => { $('#ecHex').value = e.target.value.toUpperCase(); };
}
function addColorModal() {
  modal('Add a team color', `<label class="field">Name<input class="inp" id="acName" placeholder="e.g. Sunset orange"></label>
    <div style="display:flex;align-items:center;gap:12px"><input type="color" id="acVal" value="#F05A28" style="width:64px;height:44px;padding:0;border:1px solid var(--line);background:none"><span class="hint">Pick the color</span></div>`,
    [['Cancel'], ['Add color', true, () => {
      const name = $('#acName').value.trim(); if (!name) { toast('Give the color a name'); return false; }
      const prop = '--' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const path = (teamColors()[0] || {}).path || mainSheet(true);
      act(`Added the team color ${name}`, () => setDecl(path, ':root', prop, $('#acVal').value.toUpperCase()), { render: true, where: 'Every page', pageDirty: false });
    }]]);
}
const POPULAR_FONTS = ['Inter', 'Space Mono', 'Space Grotesk', 'IBM Plex Sans', 'IBM Plex Mono', 'Roboto Mono', 'JetBrains Mono', 'Rajdhani', 'Orbitron', 'Exo 2', 'Oswald', 'Barlow', 'Barlow Condensed', 'Archivo', 'Manrope', 'DM Sans', 'Sora', 'Work Sans', 'Rubik', 'Montserrat', 'Bebas Neue', 'Chakra Petch', 'Saira', 'Titillium Web', 'Merriweather', 'Playfair Display', 'Lora'];
function addFontModal() {
  modal('Add a team font', `<label class="field">Font name<input class="inp" id="afName" list="afList" placeholder="Start typing, e.g. Rajdhani"></label>
    <datalist id="afList">${POPULAR_FONTS.map(f => `<option value="${f}">`).join('')}</datalist>
    <p class="hint">Any font from Google Fonts works. Type its name exactly as it appears there.</p>`,
    [['Cancel'], ['Add font', true, () => {
      const name = $('#afName').value.trim(); if (!name) { toast('Type a font name first'); return false; }
      if (teamFonts().includes(name)) { toast(`${name} is already a team font`); return; }
      const path = mainSheet(true);
      const line = `@import url('https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap');\n`;
      act(`Added the team font ${name}`, () => {
        const css = fileText(path) || '', m = css.match(/^@charset[^;]*;\s*/i);
        setText(path, m ? m[0] + line + css.slice(m[0].length) : line + css);
      }, { render: true, where: 'Every page', pageDirty: false });
    }]]);
}

function renderOptbar() {
  const bar = $('#optbar'); if (!S.page) return;
  const s = sEl(S.sel);
  const hints = { select: 'Click something on the page to edit it. Double-click text to type.', rect: 'Click inside a section to add a rectangle there.', text: 'Click where the new text should go.', image: 'Click where the image should go, then pick it.', pivot: 'Click on the selected part right where it should bend or turn.' };
  if (S.preview) { bar.innerHTML = '<span class="chip">Preview</span><span>This is how visitors see the page. Links between your pages work here.</span><span class="spacer"></span><button class="btn btn-primary" data-cmd="preview">Back to editing</button>'; bindCmds(bar); return; }
  if (!s || S.tool !== 'select') { bar.innerHTML = `<span class="chip">${esc(pretty(S.tool === 'rect' ? 'Rectangle' : S.tool === 'pivot' ? 'Pivot point' : S.tool))}</span><span>${hints[S.tool]}</span>`; return; }
  const r = rEl(S.sel), cs = r ? fwin().getComputedStyle(r) : null;
  const fonts = teamFonts(), cur = cs ? cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim() : '';
  const bold = cs && parseInt(cs.fontWeight, 10) >= 600;
  bar.innerHTML = `<span class="chip">${esc(nameOf(s))}</span><span class="vsep"></span>
    <label>Font<select class="inp" style="width:140px" id="obFont">${fonts.map(f => `<option value='${esc(fontStack(f))}' ${f === cur ? 'selected' : ''}>${esc(f)}</option>`).join('')}${cur && !fonts.includes(cur) ? `<option selected value="">${esc(cur)}</option>` : ''}</select></label>
    <label>Size<input class="inp num" id="obSize" style="width:56px" value="${cs ? Math.round(parseFloat(cs.fontSize)) : ''}"></label>
    <button class="icon-btn" id="obBold" title="Bold" aria-pressed="${bold}" style="${bold ? 'background:var(--accent);color:var(--on-accent);border-color:var(--accent)' : ''};font-weight:700">B</button>
    ${s.tagName === 'A' ? `<span class="vsep"></span><button class="btn" id="obLink">Goes to: ${esc(linkLabel(s.getAttribute('href')))}</button>` : ''}
    <span class="spacer"></span><span>Right-click for more</span>`;
  $('#obFont').onchange = e => e.target.value && setStyle('font-family', e.target.value, 'font');
  $('#obSize').onchange = e => setStyle('font-size', e.target.value, 'text size');
  $('#obBold').onclick = () => setStyle('font-weight', bold ? '400' : '700', 'boldness');
  const l = $('#obLink'); if (l) l.onclick = () => { S.tab = 'link'; renderInspector(); };
}
function linkLabel(href) {
  if (!href || href === '#') return 'nowhere yet';
  if (/^mailto:/i.test(href)) return href.slice(7);
  if (/^https?:/i.test(href)) return href.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const p = resolve(S.page, href);
  return p ? (isPage(p) ? pageName(p) + ' page' : pretty(p.split('/').pop())) : href;
}

/* ============ 9. Context menu & app menus ============ */
function onCanvasMenu(e) {
  e.preventDefault();
  const t = targetOf(e); if (!t) return;
  select(t.getAttribute('data-se-id'));
  const fr = $('#frame').getBoundingClientRect();
  showCtx(fr.left + e.clientX, fr.top + e.clientY);
}
function showCtx(x, y) {
  const s = sEl(S.sel); if (!s) return;
  const m = $('#ctxMenu'), isA = s.tagName === 'A', isCd = s.classList.contains('se-countdown');
  const turn = (cmd, ic, t, d) => `<button class="turn" data-cmd="${cmd}"><span class="ti">${icon(ic)}</span><span>${t}<small>${d}</small></span></button>`;
  m.innerHTML = `<div class="sub-title">Turn into</div>
    ${isA ? turn('turnShape', I.shape, 'Plain shape', 'Stops being clickable') : turn('turnButton', I.btn, 'Button', 'Click it to go somewhere')}
    ${isCd ? '' : turn('turnCountdown', I.count, 'Countdown', 'Counts down to dates you pick')}
    <hr>
    ${canEditText(rEl(S.sel)) ? '<button data-cmd="editText">Edit the words<kbd>↵</kbd></button>' : ''}
    <button data-cmd="addMotion">Add motion…</button>
    <button data-cmd="duplicate">Duplicate<kbd>⌘D</kbd></button>
    <button data-cmd="moveUp">Move up</button>
    <button data-cmd="moveDown">Move down</button>
    <button data-cmd="selectParent">Select what it’s inside</button>
    <hr><button data-cmd="delete">Delete<kbd>⌫</kbd></button>`;
  m.hidden = false;
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.min(x, innerWidth - w - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - h - 8) + 'px';
  bindCmds(m, hideCtx);
}
function hideCtx() { $('#ctxMenu').hidden = true; }
function closeMenus() { $$('.menu.open').forEach(m => m.classList.remove('open')); }
function bindCmds(root, after) {
  $$('[data-cmd]', root).forEach(b => b.onclick = e => { e.stopPropagation(); if (after) after(); closeMenus(); runCmd(b.dataset.cmd); });
}
const CMD = {
  download: () => openDownload(), openAnother: () => openAnother(),
  undo, redo, duplicate: duplicateSel, delete: deleteSel, moveUp: () => moveSel(-1), moveDown: () => moveSel(1),
  insertRect: () => insertAt(rEl(S.sel), 'rect'), insertText: () => insertAt(rEl(S.sel), 'text'),
  insertImage: () => pickMedia('image', p => insertImage(rEl(S.sel), p)), insertCountdown: () => insertCountdown(rEl(S.sel)),
  viewDesktop: () => setDevice('desktop'), viewTablet: () => setDevice('tablet'), viewPhone: () => setDevice('phone'),
  preview: () => togglePreview(), toggleTheme: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
  toggleTimeline: () => { S.tlOpen = !S.tlOpen; renderTimeline(); drawSelection(); if (S.sel) renderInspector(); },
  openMedia: () => openMedia(),
  turnButton: turnIntoButton, turnShape: turnIntoShape, turnCountdown: turnIntoCountdown,
  editText: () => startTextEdit(S.sel),
  addMotion: () => { S.tab = 'motion'; renderInspector(); },
  selectParent: () => { const s = sEl(S.sel); if (s && s.parentElement && s.parentElement.tagName !== 'BODY') select(s.parentElement.getAttribute('data-se-id')); }
};
function runCmd(c) { if (CMD[c]) CMD[c](); }
$$('.menu').forEach(m => {
  $('.menu-btn', m).onclick = e => { e.stopPropagation(); const open = m.classList.contains('open'); closeMenus(); if (!open) m.classList.add('open'); };
  m.onmouseenter = () => { if ($('.menu.open') && !m.classList.contains('open')) { closeMenus(); m.classList.add('open'); } };
});
bindCmds($('.menubar'));
document.addEventListener('click', e => { if (!e.target.closest('.menu')) closeMenus(); if (!e.target.closest('#ctxMenu')) hideCtx(); });
$$('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
function setTool(t) {
  if (t === 'pivot' && !S.sel) { toast('Select the part you want to animate first'); return; }
  S.tool = t;
  $$('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  const d = fdoc(); if (d && d.body) d.body.classList.toggle('se-tool-insert', t !== 'select');
  if (t === 'pivot' && !S.tlOpen) { S.tlOpen = true; renderTimeline(); drawSelection(); }
  renderOptbar();
}
function setDevice(dev) {
  S.device = dev;
  $('#frameBox').style.width = { desktop: '100%', tablet: '820px', phone: '390px' }[dev];
  $$('.menubar .seg button').forEach(b => b.classList.toggle('on', b.dataset.cmd === 'view' + pretty(dev)));
  setTimeout(drawSelection, 250);
}
function togglePreview() {
  if (S.editing) finishTextEdit();
  S.preview = !S.preview;
  $('#previewBtn').textContent = S.preview ? 'Back to editing' : 'Preview';
  document.body.classList.toggle('previewing', S.preview);
  stopPlayback(); renderOptbar(); renderTimeline(); renderFrame(false);
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('se-theme', t); } catch (e) { /* private mode */ }
}

/* Modal helper: buttons are [label, isPrimary, onClick]; returning false keeps it open */
function modal(title, html, buttons, opts = {}) {
  const wrap = $('#modal'), card = $('.modal-card', wrap);
  card.style.maxWidth = opts.wide ? '960px' : '520px';
  card.innerHTML = `<div class="modal-head"><span id="modalTitle">${esc(title)}</span><button class="icon-btn" style="border:0" data-close aria-label="Close">${icon(I.x)}</button></div>
    <div class="modal-body">${html}</div>
    ${buttons && buttons.length ? `<div class="modal-foot">${opts.footLeft || ''}${opts.footLeft ? '<span class="spacer"></span>' : ''}${buttons.map(([l, p], i) => `<button class="btn ${p ? 'btn-primary' : ''}" data-mb="${i}">${l}</button>`).join('')}</div>` : ''}`;
  wrap.hidden = false;
  const close = () => { wrap.hidden = true; card.innerHTML = ''; if (opts.onClose) opts.onClose(); };
  $('[data-close]', card).onclick = close;
  wrap.onclick = e => { if (e.target === wrap) close(); };
  $$('[data-mb]', card).forEach(b => b.onclick = () => { const fn = buttons[+b.dataset.mb][2]; if (fn && fn() === false) return; close(); });
  const first = $('input,select,textarea', card); if (first) setTimeout(() => first.focus(), 30);
  return { card, close };
}
function closeModal() { const w = $('#modal'); if (!w.hidden) { w.hidden = true; $('.modal-card', w).innerHTML = ''; return true; } return false; }

/* ============ 10. Timeline ============ */
function tlCfg(s) {
  const base = { duration: 4, loop: true, smooth: true, speed: 'normal', pivot: '50% 50%', calm: true, steps: [] };
  if (!s) return base;
  try { return Object.assign(base, JSON.parse(s.getAttribute('data-se-timeline') || '{}')); } catch (e) { return base; }
}
const NEUTRAL = { rotate: 0, x: 0, y: 0, scale: 1, opacity: 1 };
function poseAt(c, t) {
  const st = c.steps.slice().sort((a, b) => a.t - b.t);
  if (!st.length) return Object.assign({}, NEUTRAL);
  if (t <= st[0].t) return Object.assign({}, NEUTRAL, st[0]);
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / ((b.t - a.t) || 1), out = {};
      for (const key of Object.keys(NEUTRAL)) { const va = a[key] == null ? NEUTRAL[key] : a[key], vb = b[key] == null ? NEUTRAL[key] : b[key]; out[key] = va + (vb - va) * k; }
      return out;
    }
  }
  return Object.assign({}, NEUTRAL, st[st.length - 1]);
}
const tf = p => `translate(${p.x}px,${p.y}px) rotate(${p.rotate}deg) scale(${p.scale})`;
function tlScrub() {
  const s = sEl(S.sel), r = rEl(S.sel), w = fwin(); if (!s || !r || !w || !w.SEWidgets) return;
  const c = tlCfg(s);
  if (c.steps.length >= 2) w.SEWidgets.timeline(r, { paused: true, time: S.tlTime });
  else {
    w.SEWidgets.stopTimeline(r);
    if (c.steps.length === 1) { const p = poseAt(c, 0); r.style.transformOrigin = c.pivot; if (r instanceof w.SVGElement) r.style.transformBox = 'fill-box'; r.style.transform = tf(p); r.style.opacity = p.opacity; }
    else { r.style.transform = s.style.transform || ''; r.style.opacity = s.style.opacity || ''; }
  }
  setTimeout(drawSelection, 0);
}
function commitTl(s, c, label) {
  c.steps.sort((a, b) => a.t - b.t);
  const json = JSON.stringify(c);
  act(label, () => { if (c.steps.length || c.pivot !== '50% 50%') s.setAttribute('data-se-timeline', json); else s.removeAttribute('data-se-timeline'); }, { render: false });
  const r = rEl(S.sel); if (r) { if (s.hasAttribute('data-se-timeline')) r.setAttribute('data-se-timeline', json); else r.removeAttribute('data-se-timeline'); }
  tlScrub();
}
function setPivotFromClick(e) {
  const s = sEl(S.sel), r = rEl(S.sel); if (!s || !r) { toast('Select the part first'); setTool('select'); return; }
  const rect = r.getBoundingClientRect();
  const px = Math.round(Math.min(100, Math.max(0, (e.clientX - rect.left) / rect.width * 100)));
  const py = Math.round(Math.min(100, Math.max(0, (e.clientY - rect.top) / rect.height * 100)));
  const c = tlCfg(s); c.pivot = `${px}% ${py}%`;
  commitTl(s, c, `Set where ${nameOf(s)} bends`);
  setTool('select');
  toast('Pivot point set. Turns now happen around that spot.');
}
let tlRAF = null;
function stopPlayback() {
  S.tlPlaying = false; cancelAnimationFrame(tlRAF);
  const w = fwin(); if (w && w.SEWidgets) for (const el of fdoc().querySelectorAll('[data-se-timeline]')) w.SEWidgets.stopTimeline(el);
}
function renderTimeline() {
  const box = $('#timeline');
  box.hidden = !S.tlOpen || S.preview;
  if (box.hidden) return;
  const s = sEl(S.sel);
  if (!s) {
    box.innerHTML = `<div class="tl-head"><span class="h">Timeline</span><span class="hint">Select something on the page to animate it.</span><span class="spacer"></span><button class="icon-btn" style="border:0" id="tlClose" aria-label="Close timeline">${icon(I.x)}</button></div>`;
    $('#tlClose').onclick = () => { S.tlOpen = false; renderTimeline(); drawSelection(); };
    return;
  }
  const c = tlCfg(s), dur = c.duration, doc = getDoc(S.page);
  const rowsEls = [...doc.querySelectorAll('[data-se-timeline]')]; if (!rowsEls.includes(s)) rowsEls.push(s);
  S.tlTime = Math.min(S.tlTime, dur);
  const pct = t => (t / dur * 100).toFixed(3);
  const stepAtNow = c.steps.find(x => Math.abs(x.t - S.tlTime) < 0.05);
  const pose = poseAt(c, S.tlTime);
  const ticks = Array.from({ length: Math.floor(dur) + 1 }, (_, i) => `<span style="left:${pct(i)}%">${i}s</span>`).join('');
  const rows = rowsEls.map(el => {
    const ec = tlCfg(el), id = el.getAttribute('data-se-id'), on = el === s;
    const st = ec.steps.slice().sort((a, b) => a.t - b.t);
    const bars = st.slice(0, -1).map((a, i) => `<span class="tl-bar" style="left:${a.t / ec.duration * 100}%;width:${(st[i + 1].t - a.t) / ec.duration * 100}%"></span>`).join('');
    const dots = st.map((x, i) => `<button class="tl-step ${on && stepAtNow === x ? 'on' : ''}" data-step="${id}|${x.t}" style="left:${Math.min(100, x.t / ec.duration * 100)}%" aria-label="Step ${i + 1} at ${x.t} seconds">${i + 1}</button>`).join('');
    return `<div class="tl-row ${on ? 'on' : ''}"><button class="tl-name" data-row="${id}">${esc(nameOf(el))}</button><div class="tl-track" data-track="${id}">${bars}${dots}</div></div>`;
  }).join('');
  const PIV = [['50% 50%', 'Middle'], ['0% 50%', 'Left edge'], ['100% 50%', 'Right edge'], ['50% 0%', 'Top edge'], ['50% 100%', 'Bottom edge'], ['0% 0%', 'Top left'], ['100% 0%', 'Top right'], ['0% 100%', 'Bottom left'], ['100% 100%', 'Bottom right']];
  const pivLabel = (PIV.find(p => p[0] === c.pivot) || [null, 'Custom spot'])[1];
  const slider = (k, label, min, max, val, unit, step = 1) => `<label>${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-sl="${k}"><output>${Math.round(val * 100) / 100}${unit}</output></label>`;
  box.innerHTML = `
    <div class="tl-head">
      <span class="h">Timeline</span>
      <button class="btn btn-primary" id="tlPlay" style="width:36px;padding:0" aria-label="${S.tlPlaying ? 'Stop' : 'Play'}">${icon(S.tlPlaying ? I.stop : I.play)}</button>
      <span class="mono">${S.tlTime.toFixed(1)}s <span class="hint">/ ${dur.toFixed(1)}s</span></span>
      <button class="btn rec ${S.recording ? 'on' : ''}" id="tlRec"><span class="rec-dot"></span>${S.recording ? 'Recording moves' : 'Record moves'}</button>
      <span class="hint">${S.recording ? 'Change a slider below and it becomes a step at the playhead' : 'Turn on recording to add steps'}</span>
      <span class="spacer"></span>
      <button class="btn ${c.smooth !== false ? 'rec on' : ''}" id="tlSmooth">${icon(I.smooth)}Smooth motion: ${c.smooth !== false ? 'Auto' : 'Off'}</button>
      <button class="btn ${c.loop ? 'rec on' : ''}" id="tlLoop">${c.loop ? 'Loops forever' : 'Plays once'}</button>
      <div class="seg" data-seg="tlspeed">${[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']].map(([v, l]) => `<button data-v="${v}" class="${c.speed === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="inline-field">Length<input class="inp num" id="tlDur" style="width:56px" value="${dur}">s</label>
      <button class="icon-btn" style="border:0" id="tlClose" aria-label="Close timeline">${icon(I.x)}</button>
    </div>
    <div class="tl-body" id="tlBody">
      <div class="tl-ruler"><span class="tl-name">Parts</span><div class="tl-ticks">${ticks}</div></div>
      ${rows}
      <span class="tl-playhead" style="left:calc(180px + (100% - 180px) * ${S.tlTime / dur})"></span>
    </div>
    <div class="tl-controls">
      <span class="h">${stepAtNow ? `Step ${c.steps.slice().sort((a, b) => a.t - b.t).indexOf(stepAtNow) + 1}` : `At ${S.tlTime.toFixed(1)}s`}</span>
      ${slider('rotate', 'Turn', -180, 180, Math.round(pose.rotate), '°')}
      ${slider('x', 'Left / right', -300, 300, Math.round(pose.x), 'px')}
      ${slider('y', 'Up / down', -300, 300, Math.round(pose.y), 'px')}
      ${slider('scale', 'Size', 0.2, 2, pose.scale, '×', 0.05)}
      ${slider('opacity', 'Visible', 0, 1, pose.opacity, '', 0.05)}
      <label>Bends at<select class="inp" id="tlPivot" style="width:130px">${PIV.map(([v, l]) => `<option value="${v}" ${v === c.pivot ? 'selected' : ''}>${l}</option>`).join('')}${pivLabel === 'Custom spot' ? `<option selected value="${c.pivot}">Custom spot</option>` : ''}</select></label>
      <button class="btn" id="tlPick">Pick the spot on the page</button>
      <span class="spacer"></span>
      ${stepAtNow ? '<button class="btn" id="tlDelStep">Delete this step</button>' : ''}
      ${c.steps.length ? '<button class="btn btn-danger" id="tlClear">Clear animation</button>' : ''}
    </div>`;
  $('#tlClose').onclick = () => { stopPlayback(); S.tlOpen = false; renderTimeline(); drawSelection(); renderInspector(); };
  $('#tlRec').onclick = () => { S.recording = !S.recording; renderTimeline(); };
  $('#tlSmooth').onclick = () => { const n = tlCfg(s); n.smooth = n.smooth === false; commitTl(s, n, n.smooth ? 'Turned on smooth motion' : 'Turned off smooth motion'); };
  $('#tlLoop').onclick = () => { const n = tlCfg(s); n.loop = !n.loop; commitTl(s, n, n.loop ? 'Made an animation loop' : 'Made an animation play once'); };
  bindSeg(box, 'tlspeed', v => { const n = tlCfg(s); n.speed = v; commitTl(s, n, 'Changed an animation’s speed'); });
  $('#tlDur').onchange = e => { const n = tlCfg(s); n.duration = Math.min(60, Math.max(0.5, parseFloat(e.target.value) || 4)); commitTl(s, n, 'Changed an animation’s length'); };
  $('#tlPivot').onchange = e => { const n = tlCfg(s); n.pivot = e.target.value; commitTl(s, n, `Changed where ${nameOf(s)} bends`); drawSelection(); };
  $('#tlPick').onclick = () => setTool('pivot');
  const del = $('#tlDelStep'); if (del) del.onclick = () => { const n = tlCfg(s); n.steps = n.steps.filter(x => Math.abs(x.t - S.tlTime) >= 0.05); commitTl(s, n, 'Deleted an animation step'); };
  const clr = $('#tlClear'); if (clr) clr.onclick = () => { const n = tlCfg(s); n.steps = []; commitTl(s, n, `Cleared the animation on ${nameOf(s)}`); };
  $$('[data-row]', box).forEach(b => b.onclick = () => select(b.dataset.row, { keepTab: true }));
  $$('[data-track]', box).forEach(tr => tr.onclick = e => {
    if (e.target.closest('.tl-step')) return;
    const rect = tr.getBoundingClientRect(), id = tr.dataset.track;
    const ec = tlCfg(getDoc(S.page).querySelector(`[data-se-id="${id}"]`));
    S.tlTime = Math.round(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * ec.duration * 10) / 10;
    stopPlayback();
    if (id !== S.sel) select(id, { keepTab: true }); else renderTimeline();
    tlScrub();
  });
  $$('[data-step]', box).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const [id, t] = b.dataset.step.split('|'); S.tlTime = parseFloat(t); stopPlayback();
    if (id !== S.sel) select(id, { keepTab: true }); else renderTimeline();
    tlScrub();
  });
  $$('[data-sl]', box).forEach(sl => {
    sl.oninput = () => {
      const r = rEl(S.sel); if (!r) return;
      const p = Object.assign({}, pose); $$('[data-sl]', box).forEach(x => { p[x.dataset.sl] = parseFloat(x.value); });
      sl.nextElementSibling.textContent = (Math.round(parseFloat(sl.value) * 100) / 100) + ({ rotate: '°', x: 'px', y: 'px', scale: '×' }[sl.dataset.sl] || '');
      const w = fwin(); if (w.SEWidgets) w.SEWidgets.stopTimeline(r);
      r.style.transformOrigin = c.pivot; if (r instanceof w.SVGElement) r.style.transformBox = 'fill-box';
      r.style.transform = tf(p); r.style.opacity = p.opacity;
    };
    sl.onchange = () => {
      if (!S.recording) { toast('Turn on “Record moves” to save that as a step'); tlScrub(); renderTimeline(); return; }
      const n = tlCfg(s), vals = {}; $$('[data-sl]', box).forEach(x => { vals[x.dataset.sl] = parseFloat(x.value); });
      const t = Math.round(S.tlTime * 10) / 10;
      const ex = n.steps.find(x => Math.abs(x.t - t) < 0.05);
      if (ex) Object.assign(ex, vals); else n.steps.push(Object.assign({ t }, vals));
      if (!n.steps.some(x => x.t === 0) && t > 0) n.steps.push(Object.assign({ t: 0 }, NEUTRAL));
      commitTl(s, n, `Animated ${nameOf(s)}`);
      if (n.steps.length === 2 && !ex) toast('Nice. Move the playhead to a new time and change something to add the next step.', 4000);
    };
  });
  $('#tlPlay').onclick = () => {
    if (S.tlPlaying) { stopPlayback(); renderTimeline(); tlScrub(); return; }
    const w = fwin(); if (!w.SEWidgets) return;
    const r = rEl(S.sel);
    for (const el of fdoc().querySelectorAll('[data-se-timeline]')) w.SEWidgets.timeline(el, { once: true });
    S.tlPlaying = true; renderTimeline();
    const anim = r && r.__seTl, total = dur * 1000 * ({ slow: 1.6, normal: 1, fast: 0.6 }[c.speed] || 1);
    const head = $('.tl-playhead', box);
    const tick = () => {
      if (!S.tlPlaying) return;
      const ct = anim ? anim.currentTime || 0 : 0;
      if (head) head.style.left = `calc(180px + (100% - 180px) * ${Math.min(1, ct / total)})`;
      if (anim && anim.playState === 'finished') { S.tlPlaying = false; renderTimeline(); tlScrub(); return; }
      tlRAF = requestAnimationFrame(tick);
    };
    if (!anim) { toast('Add at least two steps to play an animation'); S.tlPlaying = false; renderTimeline(); return; }
    tick();
  };
}

/* ============ 11. Media ============ */
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|avif|pdf|docx?|pptx?|xlsx?|mp4|webm|mp3|zip)$/i;
function mediaFiles(kind) {
  return [...S.files.keys()].filter(p => !isPage(p) && !isCss(p) && (kind === 'image' ? IMG_EXT.test(p) : kind === 'doc' ? DOC_EXT.test(p) : MEDIA_EXT.test(p)))
    .filter(p => p !== 'favicon.ico').sort();
}
function pickMedia(kind, cb) { openMedia({ kind, cb }); }
function openMedia(opts = {}) {
  const kind = opts.kind || 'all';
  let folder = S.mediaFolder || 'All', chosen = null;
  const draw = m => {
    const files = mediaFiles(kind);
    const folders = ['All', ...new Set(files.map(dirOf).map(d => d || 'Top level'))];
    if (!folders.includes(folder)) folder = 'All';
    const shown = files.filter(p => folder === 'All' || (dirOf(p) || 'Top level') === folder);
    $('.modal-body', m.card).innerHTML = `<div class="media-layout">
      <div class="list" style="background:var(--input);border:1px solid var(--line)">${folders.map(f => `<button class="item ${f === folder ? 'on' : ''}" data-folder="${esc(f)}">${icon(I.folder)}${esc(f === 'All' ? 'Everything' : pretty(f.split('/').pop()) || f)}</button>`).join('')}</div>
      <div class="media-grid">${shown.length ? shown.map(p => `<button data-file="${esc(p)}" class="${p === chosen ? 'on' : ''}" title="${esc(p)}"><span class="thumb">${IMG_EXT.test(p) ? `<img src="${assetUrl(p)}" alt="">` : `<span class="mono">${esc(ext(p).toUpperCase())}</span>`}</span><span class="name">${esc(pretty(p.split('/').pop()))}</span></button>`).join('') : `<p class="empty">${kind === 'image' ? 'No images here yet.' : 'Nothing here yet.'} Use Add files to bring some in.</p>`}</div></div>`;
    $$('[data-folder]', m.card).forEach(b => b.onclick = () => { folder = S.mediaFolder = b.dataset.folder; draw(m); });
    $$('[data-file]', m.card).forEach(b => {
      b.onclick = () => { chosen = b.dataset.file; draw(m); const u = $('[data-mb="1"]', m.card); if (u) u.disabled = false; };
      b.ondblclick = () => { if (opts.cb) { m.close(); opts.cb(b.dataset.file); } };
    });
  };
  const buttons = opts.cb ? [['Cancel'], [kind === 'image' ? 'Use this image' : 'Use this file', true, () => { if (!chosen) { toast('Pick something first'); return false; } opts.cb(chosen); }]] : [['Done']];
  const m = modal(opts.cb ? (kind === 'image' ? 'Pick an image' : 'Pick a document') : 'Media', '', buttons, {
    wide: true, footLeft: `<label class="btn">${icon(I.plus)}Add files<input type="file" id="mUpload" multiple hidden accept="${kind === 'image' ? 'image/*' : kind === 'doc' ? '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip' : ''}"></label>`
  });
  draw(m);
  $('#mUpload').onchange = e => {
    const list = [...e.target.files]; if (!list.length) return;
    const imgDir = mediaFiles('image').map(dirOf).find(Boolean) || 'images';
    const docDir = mediaFiles('doc').map(dirOf).find(Boolean) || 'Documents';
    const destFor = name => folder !== 'All' ? (folder === 'Top level' ? '' : folder) : IMG_EXT.test(name) ? imgDir : DOC_EXT.test(name) ? docDir : 'media';
    act(list.length === 1 ? `Added ${list[0].name} to Media` : `Added ${list.length} files to Media`, () => {
      for (const f of list) {
        const clean = f.name.replace(/\s+/g, '-').replace(/[^\w.\-]/g, '');
        const dest = destFor(clean);
        let p = (dest ? dest + '/' : '') + clean, n = 2;
        while (S.files.has(p)) p = p.replace(/(-\d+)?(\.[^.]+)$/, `-${n++}$2`);
        S.files.set(p, { kind: 'blob', blob: f, type: f.type || mimeOf(p), dirty: true, isNew: true });
        chosen = p;
      }
    }, { render: false, pageDirty: false, where: 'Media' });
    e.target.value = ''; draw(m);
  };
}

/* ============ 12. Download ============ */
function usesWidgets(doc) { return !!doc.querySelector('.se-countdown,[data-se-motion],[data-se-timeline]'); }
const RUNTIME_FILE = '/* Site Editor widgets: countdowns, motion effects and timeline animations.\n   Added by Site Editor. Keep it next to your pages; the editor updates it for you. */\n(' + seRuntime.toString() + ')();\n';
function exportPage(p) {
  const doc = S.docs.get(p);
  if (!doc) return fileText(p);
  const clone = doc.cloneNode(true);
  if (usesWidgets(clone)) {
    if (!clone.querySelector('link[href*="se-widgets.css"]')) { const l = clone.createElement('link'); l.rel = 'stylesheet'; l.href = relPath(p, 'se-widgets.css'); clone.head.appendChild(l); }
    if (!clone.querySelector('script[src*="se-widgets.js"]')) { const sc = clone.createElement('script'); sc.src = relPath(p, 'se-widgets.js'); sc.defer = true; clone.body.appendChild(sc); }
  }
  return serializeDoc(clone);
}
function openDownload() {
  if (S.editing) finishTextEdit();
  const n = S.changes.length;
  const list = n ? `<div class="change-list">${S.changes.map(c => `<div>${esc(c.text)}<small>${esc(c.where)}</small></div>`).join('')}</div>` : '<p class="hint">No changes since your last download.</p>';
  modal('Download your site', `<h2>${n ? `${n} change${n === 1 ? '' : 's'} since your last download` : 'Everything is up to date'}</h2>${list}
    <div class="radio-list"><span class="h">What to download</span>
      <label><input type="radio" name="dlScope" value="changed" ${n ? 'checked' : 'disabled'}>Just what changed</label>
      <label><input type="radio" name="dlScope" value="all" ${n ? '' : 'checked'}>The whole site</label></div>
    <p class="hint">You’ll get a ZIP. Upload what’s inside to wherever your site is hosted and everything lands in the right place.</p>`,
    [['Cancel'], ['Download', true, () => { doDownload($('input[name="dlScope"]:checked').value === 'all'); }]]);
}
async function doDownload(all) {
  if (typeof JSZip === 'undefined') { toast('The download tool didn’t load. Check your internet connection and refresh.'); return; }
  const zip = new JSZip(); let widgets = false, count = 0;
  for (const [p, f] of S.files) {
    if (isPage(p)) {
      const d = S.docs.get(p); if (d && usesWidgets(d)) widgets = true;
      if (all || f.dirty || f.isNew) { zip.file(p, exportPage(p)); count++; }
    } else if (p !== 'se-widgets.js' && p !== 'se-widgets.css' && (all || f.dirty || f.isNew)) {
      zip.file(p, f.kind === 'text' ? f.text : f.blob); count++;
    }
  }
  if (widgets && (all || fileText('se-widgets.js') !== RUNTIME_FILE || fileText('se-widgets.css') !== SE_RUNTIME_CSS)) {
    zip.file('se-widgets.js', RUNTIME_FILE); zip.file('se-widgets.css', SE_RUNTIME_CSS); count += 2;
    S.files.set('se-widgets.js', { kind: 'text', text: RUNTIME_FILE, type: 'text/javascript', dirty: false, isNew: false });
    S.files.set('se-widgets.css', { kind: 'text', text: SE_RUNTIME_CSS, type: 'text/css', dirty: false, isNew: false });
  }
  if (!count) { toast('Nothing changed yet, so there’s nothing to download'); return; }
  const blob = await zip.generateAsync({ type: 'blob' });
  const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(S.site || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${all ? 'full' : 'changes'}-${stamp}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  for (const [p, f] of S.files) { if (isPage(p) && S.docs.has(p)) f.text = exportPage(p); f.dirty = false; f.isNew = false; }
  S.changes = [];
  updateCount(); renderPages(); scheduleSave();
  toast('Downloaded. Upload what’s inside the ZIP to your site host to go live.', 5000);
}
function openAnother() {
  const go = () => { $('#app').hidden = true; $('#welcome').hidden = false; $('#welcomeError').hidden = true; checkResume(); };
  if (!S.changes.length) return go();
  modal('Open another site?', `<p>You have ${S.changes.length} change${S.changes.length === 1 ? '' : 's'} that haven’t been downloaded. Opening another site replaces this one in the browser.</p>`,
    [['Keep editing'], ['Download first', false, () => { setTimeout(openDownload, 50); }], ['Open another', true, go]]);
}

/* ============ 13. Keyboard & boot ============ */
function onKey(e) {
  const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (S.editing) { if (k === 'escape') { e.preventDefault(); const r = rEl(S.editing); if (r) r.blur(); } return; }
  if (mod && k === 's') { e.preventDefault(); openDownload(); return; }
  if (typing) { if (k === 'escape') t.blur(); return; }
  if (k === 'escape') { if (closeModal()) return; hideCtx(); closeMenus(); if (S.tool !== 'select') setTool('select'); else select(null); return; }
  if (!$('#modal').hidden || S.preview && k !== 'p') return;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (mod) return;
  if (k === 'delete' || k === 'backspace') { if (S.sel) { e.preventDefault(); deleteSel(); } return; }
  if (k === 'enter' && S.sel) { e.preventDefault(); startTextEdit(S.sel); return; }
  const tools = { v: 'select', m: 'rect', t: 'text', i: 'image', o: 'pivot' };
  if (tools[k]) { setTool(tools[k]); return; }
  if (k === 'p') togglePreview();
}
document.addEventListener('keydown', onKey);

function openApp(page) {
  $('#welcome').hidden = true; $('#app').hidden = false;
  S.page = page; if (!S.tabs.includes(page)) S.tabs.push(page);
  S.preview = false; S.sel = null; S.tool = 'select';
  setDevice('desktop');
  renderAll(); renderFrame(false);
  saveNow();
}
async function checkResume() {
  try {
    const p = await DB.get('project');
    const b = $('#resumeBtn');
    if (p && p.files && p.files.length) {
      b.hidden = false;
      b.textContent = `Continue editing ${p.site || 'your site'}${p.changes && p.changes.length ? ` (${p.changes.length} changes not downloaded)` : ''}`;
      b.onclick = resumeProject;
    } else b.hidden = true;
  } catch (e) { /* storage blocked */ }
}
(function boot() {
  let t = 'dark'; try { t = localStorage.getItem('se-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch (e) { /* ignore */ }
  setTheme(t);
  checkResume();
})();
