/* Orbyt Designs v2 — core
   State, files, saving in the browser, rendering, the per-element style
   sheet (se-styles.css), undo/history and shared parts. */
'use strict';

const S = {
  site: '', files: new Map(), docs: new Map(), page: null, tabs: [],
  sel: null, tool: 'select', scope: 'one', state: 'normal', device: 'desktop', zoom: 'fit',
  changes: [], undo: [], redo: [], preview: false, editing: null,
  tlOpen: false, tlTime: 0, recording: true, tlPlaying: false,
  nextId: 1, keyN: 0, cssCache: new Map(), assetCache: new Map(), cssVer: new Map(), scroll: 0,
  sty: { desktop: {}, tablet: {}, phone: {} },
  openLayers: new Set(), openSecs: new Set(['pos', 'look', 'widget', 'char', 'text']),
  showPopup: null, openDetails: new Set(), linkKind: null, linkFor: null, mediaFolder: 'All',
  fv: 0, docDirty: new Set(), dataCache: new Map(), multi: []
};
/* Options most quiet edits use: don't redraw the page, don't add "on phones" to the change log */
const Q = Object.freeze({ render: false, devLabel: false });
/* Remembers a scan of the site's files until any file changes */
function memo(fn) { let v = -1, out; return (...a) => { if (v !== S.fv) { out = fn(...a); v = S.fv; } return out; }; }
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
  if (f) { f.text = text; f.kind = 'text'; f.dirty = true; f.v = (f.v || 0) + 1; }
  else S.files.set(p, { kind: 'text', text, type: mimeOf(p), dirty: true, isNew: !!isNew, v: 1 });
  if (isCss(p)) S.cssVer.set(p, (S.cssVer.get(p) || 0) + 1);
  S.fv++;
}
function addFile(p, f) { f.v = (f.v || 0) + 1; S.files.set(p, f); S.assetCache.delete(p); S.fv++; }

/* ---------- Safety checks on anything typed or uploaded ---------- */
/* Style values may only be plain values: no way to start a new CSS rule, comment, import or URL */
function safeVal(v) { v = String(v); return /[{};<>\\]|\/\*|@|url\(|expression\(/i.test(v) ? null : v; }
/* File paths from an upload: forward slashes, no leading slash, never "..", so nothing lands outside the site folder */
function cleanPath(p) {
  p = String(p).replace(/\\/g, '/').replace(/^\/+/, '');
  return !p || p.split('/').some(seg => seg === '..' || seg === '.' || seg === '') ? null : p;
}
const LIMITS = { file: 50 * 1024 * 1024, total: 400 * 1024 * 1024, count: 6000 };


Object.assign(I, {
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 018 0v4', lockPos: 'M5 11h14v10H5z M8 11V7a4 4 0 018 0v4 M12 15v2',
  unlock: 'M5 11h14v10H5z M8 11V7a4 4 0 017.5-2', eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z M12 9a3 3 0 100 6 3 3 0 000-6z',
  eyeOff: 'M3 3l18 18 M10.6 6.1A10.9 10.9 0 0112 6c7 0 11 6 11 6a17 17 0 01-3.2 3.8 M6.1 6.9C3.2 8.7 1 12 1 12s4 7 11 7a10.6 10.6 0 004.9-1.2',
  ghost: 'M5 21V10a7 7 0 0114 0v11l-2.5-2-2.5 2-2-2-2 2-2.5-2z M9 10h.01 M15 10h.01', chev: 'M9 6l6 6-6 6', link: 'M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7 M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7',
  share: 'M4 12v8h16v-8 M12 3v12 M7 8l5-5 5 5', more: 'M5 12h.01 M12 12h.01 M19 12h.01', copy: 'M8 8h12v12H8z M4 16V4h12',
  popup: 'M3 4h18v14H3z M8 9h8 M8 13h5', expand: 'M4 6h16 M4 12h16 M4 18h10 M18 16l2 2 2-2', embed: 'M8 6l-6 6 6 6 M16 6l6 6-6 6', tabs: 'M4 5h4 M4 12h4 M4 19h4 M11 4v16',
  hand: 'M7 11V5a2 2 0 014 0v5 M11 10V4a2 2 0 014 0v6 M15 10V6a2 2 0 014 0v8a7 7 0 01-7 7h-1a7 7 0 01-6-3l-3-5a2 2 0 013-2l2 2',
  zoom: 'M11 4a7 7 0 100 14 7 7 0 000-14z M21 21l-5-5', select: 'M4 3l7 17 2.5-7.5L21 10z', direct: 'M5 3l6 16 2-6 6-2z M14 14l5 5',
  rect: 'M4 5h16v14H4z', ellipse: 'M12 4a8 8 0 100 16 8 8 0 000-16z', line: 'M4 20L20 4', text: 'M4 7V4h16v3 M9 20h6 M12 4v16',
  image: 'M3 3h18v18H3z M21 15l-5-5L5 21', pivot: 'M12 2v4 M12 18v4 M2 12h4 M18 12h4 M12 9a3 3 0 100 6 3 3 0 000-6z',
  props: 'M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M14 4v4 M8 10v4 M16 16v4', char: 'M4 20l6-16 6 16 M6 14h8 M17 20l2-6 2 6',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5', pages: 'M6 2h9l5 5v15H6z M14 2v6h6', history: 'M3 12a9 9 0 109-9 9 9 0 00-7 3.4 M3 4v4h4 M12 7v5l3 2',
  kit: 'M12 3a9 9 0 100 18c1 0 2-.8 2-2 0-1.2-1-1.6-1-2.6 0-1 .8-1.4 2-1.4h2a4 4 0 004-4c0-4.4-4-8-9-8z M7.5 11h.01 M10 7h.01 M15 7h.01',
  data: 'M4 5h16v14H4z M4 10h16 M4 15h16 M10 5v14', frame: 'M3 3h18v18H3z M3 16l5-5 4 4 3-3 6 6 M15 8h.01',
  effects: 'M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z M19 3v4 M17 5h4', media: 'M3 6h7l2 2h9v12H3z M8 16l3-3 2 2 2-2 3 3',
  help: 'M12 3a9 9 0 100 18 9 9 0 000-18z M9.5 9a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5 M12 17h.01', search: 'M11 4a7 7 0 100 14 7 7 0 000-14z M21 21l-5-5',
  alL: 'M4 3v18 M8 7h12v4H8z M8 14h8v4H8z', alC: 'M12 3v18 M6 7h12v4H6z M8 14h8v4H8z', alR: 'M20 3v18 M4 7h12v4H4z M8 14h8v4H8z',
  alT: 'M3 4h18 M7 8v12h4V8z M14 8v8h4V8z', alM: 'M3 12h18 M7 6v12h4V6z M14 8v8h4V8z', alB: 'M3 20h18 M7 4v12h4V4z M14 8v8h4V8z',
  disH: 'M4 4v16 M20 4v16 M10 8h4v8h-4z', disV: 'M4 4h16 M4 20h16 M8 10h8v4H8z', grad: 'M3 4h18v16H3z M7 4v16 M11 4v16 M15 4v16', pin: 'M12 17v5 M8 3h8l-1 6 3 3v2H6v-2l3-3z'
});

/* ============ 2. Opening a site ============ */
async function loadEntries(entries, opts = {}) {
  // entries: [{ path, read: async () => ({ text } | { blob }) }]
  entries = entries.filter(e => !/(^|\/)(\.git|node_modules|__MACOSX)(\/|$)|\.DS_Store$|Thumbs\.db$/.test(e.path));
  let skipped = 0;
  entries = entries.filter(e => { const c = cleanPath(e.path); if (!c || (e.size || 0) > LIMITS.file) { skipped++; return false; } e.path = c; return true; });
  if (!entries.length) throw new Error('That folder looks empty. Pick the folder that holds your index.html.');
  if (entries.length > LIMITS.count) throw new Error(`That’s ${entries.length} files, more than the ${LIMITS.count} the editor can open at once. Leave out folders the site doesn’t need.`);
  const total = entries.reduce((n, e) => n + (e.size || 0), 0);
  if (total > LIMITS.total) throw new Error(`That site is ${Math.round(total / 1048576)} MB, more than the ${LIMITS.total / 1048576} MB the editor can hold. Leave out big videos or old files and try again.`);
  const firsts = new Set(entries.map(e => e.path.split('/')[0]));
  const strip = firsts.size === 1 && entries.every(e => e.path.includes('/')) ? [...firsts][0] + '/' : '';
  resetProject();
  S.site = opts.name || (strip ? strip.slice(0, -1) : 'My site');
  for (const e of entries) {
    const path = strip ? e.path.slice(strip.length) : e.path;
    const data = await e.read(TEXT_EXT.test(path));
    if (data.text != null) S.files.set(path, { kind: 'text', text: data.text, type: mimeOf(path), dirty: false, isNew: false });
    else S.files.set(path, { kind: 'blob', blob: data.blob, type: mimeOf(path), dirty: false, isNew: false });
  }
  for (const f of S.files.values()) f.v = 1;
  loadSty();
  if (opts.beforeOpen) opts.beforeOpen();
  const pages = allPages();
  if (!pages.length) throw new Error('No web pages found. Pick the folder that holds your index.html.');
  openApp(pages.find(p => /^index\.html?$/i.test(p)) || pages[0]);
  if (skipped) toast(`${skipped} file${skipped === 1 ? ' was' : 's were'} left out (too big, or in an unsafe place inside the ZIP).`, 5000);
  if (!opts.quiet) setTimeout(() => runChecks({ afterImport: true }), 900);
}
function resetProject() {
  for (const v of S.cssCache.values()) URL.revokeObjectURL(v.url);
  for (const v of S.assetCache.values()) URL.revokeObjectURL(v);
  Object.assign(S, { files: new Map(), docs: new Map(), page: null, tabs: [], sel: null, changes: [], undo: [], redo: [], cssCache: new Map(), assetCache: new Map(), cssVer: new Map(), tlOpen: false, sty: { desktop: {}, tablet: {}, phone: {} }, keyN: 0, showPopup: null, fv: S.fv + 1, docDirty: new Set(), dataCache: new Map(), multi: [] });
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
    await loadEntries(list.map(f => ({ path: f.webkitRelativePath || f.name, size: f.size, read: async asText => asText ? { text: await f.text() } : { blob: f } })));
  } catch (err) { showWelcomeError(err.message); }
  e.target.value = '';
});
$('#openZip').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const zip = await JSZip.loadAsync(file);
    const entries = [];
    zip.forEach((path, z) => { if (!z.dir) entries.push({ path, size: (z._data && z._data.uncompressedSize) || 0, read: async asText => asText ? { text: await z.async('string') } : { blob: new Blob([await z.async('arraybuffer')], { type: mimeOf(path) }) } }); });
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
    for (const c of el.classList) if (/^se-x\d+$/.test(c)) S.keyN = Math.max(S.keyN, +c.slice(4));
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
  open() { return this._db || (this._db = new Promise((res, rej) => { const r = indexedDB.open('site-editor', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode); const out = fn(t.objectStore('kv')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); },
  get(k) { return this.tx('readonly', st => st.get(k)); },
  keys() { return this.tx('readonly', st => st.getAllKeys()); },
  putMany(entries, dels = []) { return this.tx('readwrite', st => { for (const [k, v] of entries) st.put(v, k); for (const k of dels) st.delete(k); }); },
  clear() { return this.tx('readwrite', st => st.clear()); }
};
/* Saving: only files and pages that changed since the last save are written */
function scheduleSave() {
  $('#saveState').textContent = 'Saving…';
  clearTimeout(scheduleSave.t);
  scheduleSave.t = setTimeout(saveNow, 700);
}
async function saveNow() {
  try {
    const put = [], dels = [];
    for (const [path, f] of S.files) if (f.sv !== f.v) { put.push(['f:' + path, { kind: f.kind, text: f.text, blob: f.blob, dirty: f.dirty, isNew: f.isNew }]); f.sv = f.v; }
    for (const p of S.docDirty) { const d = S.docs.get(p); if (d) put.push(['d:' + p, serializeDoc(d, true)]); }
    S.docDirty.clear();
    const flags = {}; for (const [path, f] of S.files) flags[path] = [f.dirty ? 1 : 0, f.isNew ? 1 : 0];
    put.push(['meta', { v: 3, site: S.site, paths: [...S.files.keys()], flags, changes: S.changes, page: S.page, tabs: S.tabs, nextId: S.nextId }]);
    for (const k of S.removedKeys || []) dels.push(k);
    S.removedKeys = [];
    await DB.putMany(put, dels);
    $('#saveState').textContent = 'Saved in this browser';
  } catch (e) { $('#saveState').textContent = 'Couldn’t save in this browser — download to keep your work'; }
}
function markDoc(p) { S.docDirty.add(p); }
async function resumeProject() {
  const meta = await DB.get('meta'), legacy = !meta && await DB.get('project');
  if (!meta && !legacy) return;
  resetProject();
  if (legacy) {
    S.site = legacy.site; S.changes = legacy.changes || []; S.nextId = legacy.nextId || 1;
    for (const f of legacy.files) S.files.set(f.path, { kind: f.kind, text: f.text, blob: f.blob, type: mimeOf(f.path), dirty: f.dirty, isNew: f.isNew, v: 1 });
    for (const [path, html] of legacy.docs || []) { const d = new DOMParser().parseFromString(html, 'text/html'); assignIds(d); S.docs.set(path, d); S.docDirty.add(path); }
    S.tabs = (legacy.tabs || []).filter(t => S.files.has(t));
    await DB.putMany([], ['project']);
  } else {
    S.site = meta.site; S.changes = meta.changes || []; S.nextId = meta.nextId || 1;
    for (const path of meta.paths) {
      const f = await DB.get('f:' + path); if (!f) continue;
      const fl = meta.flags[path] || [0, 0];
      S.files.set(path, { kind: f.kind, text: f.text, blob: f.blob, type: mimeOf(path), dirty: !!fl[0], isNew: !!fl[1], v: 1, sv: 1 });
      const html = await DB.get('d:' + path);
      if (html) { const d = new DOMParser().parseFromString(html, 'text/html'); assignIds(d); S.docs.set(path, d); }
    }
    S.tabs = (meta.tabs || []).filter(t => S.files.has(t));
  }
  S.fv++;
  loadSty();
  openApp(S.files.has((meta || legacy).page) ? (meta || legacy).page : allPages()[0]);
}
async function savedSiteInfo() {
  const meta = await DB.get('meta'); if (meta) return { site: meta.site, changes: (meta.changes || []).length };
  const legacy = await DB.get('project'); return legacy ? { site: legacy.site, changes: (legacy.changes || []).length } : null;
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
.se-ui-hover{outline:1px dashed #CA374D}
.se-ui-sel{outline:1px solid #CA374D;outline-offset:1px}
.se-ui-tag{position:absolute;left:-1px;top:-24px;background:#CA374D;color:#FFFFFF;font:600 11px/1 'IBM Plex Sans',system-ui,sans-serif;padding:4px 6px;white-space:nowrap}
.se-ui-h{position:absolute;width:8px;height:8px;background:#fff;border:1px solid #CA374D;pointer-events:auto}
.se-ui-guide{background:#FF3EA5}
.se-ui-pivot{width:20px;height:20px;margin:-10px 0 0 -10px;border:2px solid #fff;box-shadow:0 0 0 1px #1A1A1A}
.se-ui-pivot::before,.se-ui-pivot::after{content:"";position:absolute;background:#fff;left:50%;top:50%}
.se-ui-pivot::before{width:28px;height:1px;margin-left:-14px}
.se-ui-pivot::after{width:1px;height:28px;margin-top:-14px}
[data-se-vanish]{visibility:hidden!important}
.se-frame:not(:has(> img)){display:flex!important;align-items:center;justify-content:center;flex-direction:column;gap:6px;background:repeating-linear-gradient(45deg,rgba(128,128,128,.14) 0 10px,rgba(128,128,128,.22) 10px 20px)!important;outline:1px dashed rgba(128,128,128,.8);outline-offset:-1px;color:#9a9a9a;font:600 12px/1.3 'IBM Plex Sans',system-ui,sans-serif;text-align:center}
.se-frame:not(:has(> img))::before{content:"";width:32px;height:32px;background:no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239a9a9a' stroke-width='1.5'%3E%3Cpath d='M3 3h18v18H3z M3 16l5-5 4 4 3-3 6 6 M15 8h.01'/%3E%3C/svg%3E")}
.se-frame:not(:has(> img))::after{content:"Drop a photo here";}
.se-embed-ph{display:flex;align-items:center;justify-content:center;min-height:120px;height:100%;border:1px dashed #888;color:#888;font:13px system-ui,sans-serif;text-align:center;padding:12px}
[contenteditable]{outline:2px solid #CA374D!important;outline-offset:2px;cursor:text}
body.se-tool-insert,body.se-tool-insert *{cursor:crosshair!important}
body.se-tool-hand,body.se-tool-hand *{cursor:grab!important}
`;
function renderFrame(keepScroll = true) {
  const frame = $('#frame');
  if (S.preview) { renderPreview(); return; }
  frame.removeAttribute('sandbox');
  if (keepScroll && frame.contentWindow) { try { S.scroll = frame.contentWindow.scrollY; } catch (e) { S.scroll = 0; } }
  const page = S.page, doc = getDoc(page), clone = doc.cloneNode(true);
  for (const el of clone.querySelectorAll('script[src*="se-widgets"], link[href*="se-widgets"]')) el.remove();
  if (!S.preview) {
    /* While editing nothing from the site may run: no scripts, no inline handlers, no
       javascript: links, no self-running frames or plugins, no redirects or base changes */
    for (const s of clone.querySelectorAll('script, meta[http-equiv], base')) s.remove();
    for (const el of clone.querySelectorAll('*')) for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || a.name === 'srcdoc' || a.name === 'formaction' || /^\s*(javascript|vbscript):/i.test(a.value) && /^(href|src|action|data|xlink:href)$/i.test(a.name)) el.removeAttribute(a.name);
    }
    for (const f of clone.querySelectorAll('iframe, frame')) f.setAttribute('sandbox', '');
    for (const o of clone.querySelectorAll('object, embed, applet')) { const ph = clone.createElement('div'); ph.className = 'se-embed-ph'; ph.textContent = 'Plug-in content (shows on your site)'; const id = o.getAttribute('data-se-id'); if (id) ph.setAttribute('data-se-id', id); o.replaceWith(ph); }
    for (const e of clone.querySelectorAll('.se-embed')) e.innerHTML = '<div class="se-embed-ph">Embedded content<br>Shows in Preview and on your site</div>';
    for (const d of clone.querySelectorAll('details')) if (S.openDetails.has(d.getAttribute('data-se-id'))) d.setAttribute('open', '');
    if (S.showPopup) {
      const p = clone.querySelector(`[data-se-popup="${CSS.escape(S.showPopup)}"]`);
      if (p) { p.classList.add('se-open'); const b = clone.createElement('div'); b.className = 'se-backdrop se-open'; b.setAttribute('data-se-ui', 'backdrop'); p.before(b); }
    }
    if (S.sel && S.state !== 'normal') { const f = clone.querySelector(`[data-se-id="${S.sel}"]`); if (f) f.setAttribute('data-se-force', S.state); }
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
  const rt = clone.createElement('style'); rt.textContent = SE_RUNTIME_CSS; clone.head.prepend(rt);
  if (!S.preview) { const ui = clone.createElement('style'); ui.textContent = EDITOR_CSS; clone.head.appendChild(ui); }
  const flag = clone.createElement('script'); flag.textContent = S.preview ? '' : 'window.__SE_EDITOR=true;';
  const run = clone.createElement('script'); run.textContent = '(' + seRuntime.toString() + ')();';
  clone.body.appendChild(flag); clone.body.appendChild(run);
  frame.onload = onFrameLoad;
  frame.srcdoc = '<!DOCTYPE html>\n' + clone.documentElement.outerHTML;
}
/* Preview runs the site's own code, so it runs sealed off from the editor: its own blank
   origin, scripts allowed, nothing else. Files are embedded as data so it needs no access. */
function dataUrl(path) {
  const f = S.files.get(path); if (!f) return Promise.resolve(null);
  const c = S.dataCache.get(path); if (c && c.v === f.v) return c.p;
  const blob = f.kind === 'blob' ? f.blob : new Blob([f.text], { type: mimeOf(path) });
  const pr = new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
  S.dataCache.set(path, { v: f.v, p: pr });
  return pr;
}
async function inlineCssUrls(css, fromPath, depth = 0) {
  const refs = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)];
  for (const m of refs) { const p = resolve(fromPath, m[2]); if (p && S.files.has(p)) { const u = await dataUrl(p); if (u) css = css.split(m[0]).join(`url("${u}")`); } }
  for (const m of [...css.matchAll(/@import\s+(['"])([^'"]+)\1\s*;?/g)]) {
    const p = resolve(fromPath, m[2]);
    if (p && S.files.has(p) && depth < 3) css = css.split(m[0]).join(await inlineCssUrls(fileText(p) || '', p, depth + 1));
  }
  return css;
}
async function renderPreview() {
  const frame = $('#frame'), page = S.page, token = (renderPreview.n = (renderPreview.n || 0) + 1);
  const clone = getDoc(page).cloneNode(true);
  for (const el of clone.querySelectorAll('script[src*="se-widgets"], link[href*="se-widgets"]')) el.remove();
  for (const el of clone.querySelectorAll('[data-se-id]')) el.removeAttribute('data-se-id');
  for (const el of [...clone.querySelectorAll('link[rel~="stylesheet"][href]')]) {
    const p = resolve(page, el.getAttribute('href'));
    if (p && S.files.has(p)) { const st = clone.createElement('style'); st.textContent = await inlineCssUrls(fileText(p) || '', p); el.replaceWith(st); }
  }
  for (const el of clone.querySelectorAll('style')) el.textContent = await inlineCssUrls(el.textContent, page);
  for (const el of [...clone.querySelectorAll('script[src]')]) {
    const p = resolve(page, el.getAttribute('src'));
    if (p && S.files.has(p) && fileText(p) != null) {
      const sc = clone.createElement('script'); sc.textContent = fileText(p);
      if (el.type) sc.type = el.type;
      if (el.defer || el.type === 'module') { el.remove(); clone.body.appendChild(sc); } else el.replaceWith(sc);
    }
  }
  for (const attr of ['src', 'poster', 'href']) for (const el of clone.querySelectorAll(`[${attr}]`)) {
    if (attr === 'href' && el.tagName !== 'LINK' && el.tagName !== 'image' && el.tagName !== 'use') continue;
    const p = resolve(page, el.getAttribute(attr)); if (p && S.files.has(p)) el.setAttribute(attr, await dataUrl(p) || '');
  }
  for (const el of clone.querySelectorAll('[srcset]')) {
    const parts = await Promise.all(el.getAttribute('srcset').split(',').map(async part => { const [u, ...rest] = part.trim().split(/\s+/); const p = resolve(page, u); return [p && S.files.has(p) ? await dataUrl(p) : u, ...rest].join(' '); }));
    el.setAttribute('srcset', parts.join(', '));
  }
  for (const el of clone.querySelectorAll('[style*="url("]')) el.setAttribute('style', await inlineCssUrls(el.getAttribute('style'), page));
  const rt = clone.createElement('style'); rt.textContent = SE_RUNTIME_CSS; clone.head.prepend(rt);
  const run = clone.createElement('script'); run.textContent = '(' + seRuntime.toString() + ')();';
  const nav = clone.createElement('script');
  nav.textContent = "document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'';if(h.charAt(0)==='#'||a.hasAttribute('data-se-open'))return;e.preventDefault();parent.postMessage({seNav:h},'*');},true);";
  clone.body.appendChild(run); clone.body.appendChild(nav);
  if (token !== renderPreview.n || !S.preview) return;
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.onload = () => { layoutFrame(); };
  frame.srcdoc = '<!DOCTYPE html>\n' + clone.documentElement.outerHTML;
}
window.addEventListener('message', e => {
  if (!S.preview || e.source !== $('#frame').contentWindow || !e.data || typeof e.data.seNav !== 'string') return;
  const href = e.data.seNav.slice(0, 2000), p = resolve(S.page, href);
  if (p && isPage(p) && S.files.has(p)) switchPage(p);
  else if (p && S.files.has(p)) dataUrl(p).then(u => { const w = window.open(); if (w) w.document.write(`<iframe src="${esc(u)}" style="border:0;width:100%;height:100vh"></iframe>`); });
  else if (/^(https?:|mailto:)/i.test(href)) window.open(href, '_blank', 'noopener');
});
function fdoc() { try { return $('#frame').contentDocument; } catch (e) { return null; } }
/* While previewing, the frame is sealed off, so the editor never reaches into it */
function fwin() { return S.preview ? null : $('#frame').contentWindow; }
function rEl(id) { const d = fdoc(); return d && id ? d.querySelector(`[data-se-id="${id}"]`) : null; }
function sEl(id) { return id ? getDoc(S.page).querySelector(`[data-se-id="${id}"]`) : null; }

/* ============ 5. Per-element styles: se-styles.css ============
   Every "just this one" change lives here as a rule for that element's
   own class (se-x12), so it can differ per screen size and per state. */
const SE_CSS = 'se-styles.css';
const MEDIA = { tablet: 1024, phone: 640 };
const DEV_LABEL = { desktop: '', tablet: ' on tablets and phones', phone: ' on phones' };
function keyOf(el, create) {
  const k = [...(el.classList || [])].find(c => /^se-x\d+$/.test(c));
  if (k || !create) return k || null;
  const n = 'se-x' + (++S.keyN);
  el.classList.add(n);
  const r = rEl(el.getAttribute('data-se-id')); if (r) r.classList.add(n);
  return n;
}
const selOf = key => `.${key}.${key}.${key}`;
function stateSel(base, st) {
  if (!st || st === 'normal') return base;
  return `${base}:${st}, ${base}[data-se-force="${st}"]`;
}
function genSty() {
  const block = rules => Object.entries(rules).filter(([, d]) => Object.keys(d).length)
    .map(([sel, d]) => `${sel} { ${Object.entries(d).map(([p, v]) => `${p}: ${v};`).join(' ')} }`).join('\n');
  let out = '/* Orbyt Designs styles. Made by the editor: change them in the editor, not here. */\n' + block(S.sty.desktop) + '\n';
  for (const dev of ['tablet', 'phone']) {
    const b = block(S.sty[dev]);
    if (b) out += `\n@media (max-width: ${MEDIA[dev]}px) {\n${b.replace(/^/gm, '  ')}\n}\n`;
  }
  return out;
}
function parseDecls(body) {
  const d = {};
  for (const part of body.split(';')) { const i = part.indexOf(':'); if (i > 0) { const p = part.slice(0, i).trim(), v = part.slice(i + 1).trim(); if (p && v) d[p] = v; } }
  return d;
}
/* Splits CSS into top-level blocks, allowing nesting (for @media) and any formatting */
function cssBlocks(css) {
  const out = []; let i = 0, depth = 0, start = 0, open = -1; const n = css.length;
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") { i++; while (i < n && css[i] !== c) { if (css[i] === '\\') i++; i++; } i++; continue; }
    if (c === '{') { if (depth === 0) open = i; depth++; }
    else if (c === '}') { if (depth > 0 && --depth === 0) { out.push({ sel: css.slice(start, open).replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: css.slice(open + 1, i) }); start = i + 1; } }
    else if (c === ';' && depth === 0) start = i + 1;
    i++;
  }
  return out;
}
function parseSty(text) {
  const sty = { desktop: {}, tablet: {}, phone: {} };
  for (const b of cssBlocks(text || '')) {
    const m = b.sel.match(/^@media[^{]*max-width\s*:\s*(\d+)px/i);
    if (m) { const dev = +m[1] <= MEDIA.phone ? 'phone' : 'tablet'; for (const r of cssBlocks(b.body)) sty[dev][r.sel] = parseDecls(r.body); }
    else if (!b.sel.startsWith('@')) sty.desktop[b.sel] = parseDecls(b.body);
  }
  return sty;
}
function loadSty() {
  S.sty = parseSty(fileText(SE_CSS));
  for (const m of (fileText(SE_CSS) || '').matchAll(/se-x(\d+)/g)) S.keyN = Math.max(S.keyN, +m[1]);
}
function getSty(sel, prop, dev = S.device) {
  const chain = dev === 'phone' ? ['phone', 'tablet', 'desktop'] : dev === 'tablet' ? ['tablet', 'desktop'] : ['desktop'];
  for (const d of chain) { const r = S.sty[d][sel]; if (r && r[prop] != null) return r[prop]; }
  return null;
}
function putSty(sel, props, dev = S.device) {
  const r = S.sty[dev][sel] || (S.sty[dev][sel] = {});
  for (const [p, v] of Object.entries(props)) { if (v === '' || v == null) delete r[p]; else if (safeVal(v) != null && /^-?[a-z-]+$/i.test(p)) r[p] = v; }
  if (!Object.keys(r).length) delete S.sty[dev][sel];
}
function writeSty() { setText(SE_CSS, genSty(), !S.files.has(SE_CSS)); }
/* Makes sure the page links se-styles.css as its last stylesheet. Returns true if it had to add it. */
function ensureStyLink(doc = getDoc(S.page), page = S.page) {
  const has = [...doc.querySelectorAll('link[rel~="stylesheet"]')].some(l => resolve(page, l.getAttribute('href')) === SE_CSS);
  if (has) return false;
  const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = relPath(page, SE_CSS);
  doc.head.appendChild(l);
  const f = S.files.get(page); if (f) f.dirty = true;
  return true;
}
/* Apply element-level style props (layout or look) for the current device and state. */
function applyOwn(s, props, opts = {}) {
  const key = keyOf(s, true), sel = stateSel(selOf(key), opts.state || 'normal');
  const dev = opts.device || S.device;
  for (const p of Object.keys(props)) {
    if (s.style.getPropertyValue(p)) {
      if (getSty(selOf(key), p, 'desktop') == null && dev !== 'desktop') putSty(selOf(key), { [p]: s.style.getPropertyValue(p) }, 'desktop');
      s.style.removeProperty(p);
    }
  }
  if (!s.getAttribute('style')) s.removeAttribute('style');
  putSty(sel, props, dev);
  writeSty();
  const needLink = ensureStyLink();
  const r = rEl(s.getAttribute('data-se-id'));
  if (r) { for (const p of Object.keys(props)) r.style.removeProperty(p); }
  return needLink;
}

/* ============ 6. Actions, undo, history, shared parts ============ */
/* A restore point before an action. Text files are kept by reference (strings never change in
   place), so only the pages that might change are copied: this page, pages already changed,
   and pages sharing a part with this one, or every page for actions that touch them all. */
function snapshot(label, allDocs) {
  const css = [];
  for (const [p, f] of S.files) if (f.kind === 'text' && !isPage(p)) css.push([p, f.text, f.dirty]);
  const docs = [];
  const names = [...getDoc(S.page).querySelectorAll('[data-se-shared]')].map(e => e.getAttribute('data-se-shared'));
  for (const [p, d] of S.docs) {
    const f = S.files.get(p) || {};
    if (allDocs || p === S.page || f.dirty || names.some(n => d.querySelector(`[data-se-shared="${CSS.escape(n)}"]`))) docs.push([p, serializeDoc(d, true), !!f.dirty]);
  }
  return { label, page: S.page, sel: S.sel, docs, css, keys: [...S.files.keys()], changes: S.changes.length };
}
function restore(snap) {
  for (const [p, html, dirty] of snap.docs) {
    const d = new DOMParser().parseFromString(html, 'text/html'); assignIds(d);
    S.docs.set(p, d); markDoc(p); const f = S.files.get(p); if (f) f.dirty = dirty;
  }
  for (const [p, text, dirty] of snap.css) { const cf = S.files.get(p); if (cf && cf.text !== text) { cf.text = text; cf.v = (cf.v || 0) + 1; S.cssVer.set(p, (S.cssVer.get(p) || 0) + 1); } if (cf) cf.dirty = dirty; }
  for (const k of [...S.files.keys()]) if (!snap.keys.includes(k)) { S.files.delete(k); (S.removedKeys || (S.removedKeys = [])).push('f:' + k, 'd:' + k); }
  S.fv++;
  if (!snap.keys.includes(SE_CSS)) S.sty = { desktop: {}, tablet: {}, phone: {} }; else loadSty();
  S.changes.length = Math.min(S.changes.length, snap.changes);
  if (S.page !== snap.page) { S.page = snap.page; if (!S.tabs.includes(snap.page)) S.tabs.push(snap.page); }
  S.sel = snap.sel && getDoc(S.page).querySelector(`[data-se-id="${snap.sel}"]`) ? snap.sel : null;
  renderAll(); renderFrame();
}
function sharedHtml(el) { const c = el.cloneNode(true); for (const k of [c, ...c.querySelectorAll('[data-se-id]')]) k.removeAttribute('data-se-id'); return c.outerHTML; }
function sharedState(doc) { const m = new Map(); for (const el of doc.querySelectorAll('[data-se-shared]')) m.set(el.getAttribute('data-se-shared'), sharedHtml(el)); return m; }
function syncShared(before) {
  const after = sharedState(getDoc(S.page));
  let touched = 0;
  for (const [name, html] of after) {
    if (before.get(name) === html) continue;
    for (const p of allPages()) {
      if (p === S.page) continue;
      const d = getDoc(p), t = d.querySelector(`[data-se-shared="${CSS.escape(name)}"]`);
      if (!t) continue;
      const tmp = d.createElement('template'); tmp.innerHTML = html;
      const n = tmp.content.firstElementChild; if (!n) continue;
      t.replaceWith(n); assignIds(d); markDoc(p);
      const f = S.files.get(p); if (f) f.dirty = true;
      touched++;
    }
  }
  return touched;
}
function act(label, fn, opts = {}) {
  if (S.editing && !opts.fromEdit) finishTextEdit();
  S.undo.push(snapshot(label, opts.allDocs)); if (S.undo.length > 80) S.undo.shift();
  S.redo = [];
  const before = sharedState(getDoc(S.page));
  const res = fn();
  const f = S.files.get(S.page); if (f && opts.pageDirty !== false) f.dirty = true;
  markDoc(S.page); if (opts.allDocs) for (const p of S.docs.keys()) markDoc(p);
  const shared = syncShared(before);
  logChange(label + (opts.devLabel === false ? '' : DEV_LABEL[S.device] || ''), shared ? 'Every page with this shared part' : (opts.where || pageName(S.page)));
  if (opts.render !== false || res === true) renderFrame();
  else if (opts.cssPath) refreshCss(opts.cssPath);
  renderAll();
  scheduleSave();
  return res;
}
function logChange(text, where) {
  const last = S.changes[S.changes.length - 1];
  if (last && last.text === text && last.where === where) return;
  S.changes.push({ text, where, at: Date.now() });
}
/* Undo or redo several steps with a single redraw (History panel jumps use this) */
function undo(n = 1) {
  n = Math.min(n, S.undo.length); if (!n) return toast('Nothing to undo');
  const len = S.undo.length, cur = snapshot(null, true);
  for (let k = len - 1; k >= len - n; k--) S.redo.push(Object.assign({}, k === len - 1 ? cur : S.undo[k + 1], { label: S.undo[k].label }));
  const target = S.undo[len - n]; S.undo.length = len - n;
  restore(target); scheduleSave();
}
function redo(n = 1) {
  n = Math.min(n, S.redo.length); if (!n) return toast('Nothing to redo');
  let prev = snapshot(null, true);
  for (let i = 0; i < n; i++) { const r = S.redo.pop(); S.undo.push(Object.assign({}, prev, { label: r.label })); prev = r; }
  restore(prev); scheduleSave();
}
function updateCount() { const n = S.changes.length, c = $('#changeCount'); c.hidden = !n; c.textContent = n; }

/* ============ 7. Site stylesheets ============ */
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
  setText(p, '/* Styles added by Orbyt Designs */\n', true);
  const doc = getDoc(S.page), l = doc.createElement('link');
  l.rel = 'stylesheet'; l.href = relPath(S.page, p); doc.head.appendChild(l);
  return p;
}
function sheetWithRule(selector) {
  const order = [...pageSheets(S.page), ...[...S.files.keys()].filter(isCss)];
  return order.find(p => findRule(fileText(p) || '', selector)) || null;
}

/* Swaps in the new stylesheet, then drops the temporary inline styles used while dragging */
function refreshCss(path) {
  const d = fdoc(); if (!d) return;
  const links = [...d.querySelectorAll(`link[data-se-css="${CSS.escape(path)}"]`)];
  const pending = S.pendingClear.splice(0);
  const clear = () => { pending.forEach(([el, ps]) => ps.forEach(p => el.style.removeProperty(p))); drawSelection(); if (S.tlOpen) tlScrub(); };
  if (!links.length) clear();
  for (const l of links) { l.onload = clear; l.href = cssUrl(path); }
  setTimeout(drawSelection, 80);
}
const PX_PROPS = new Set(['font-size', 'letter-spacing', 'width', 'height', 'padding', 'border-radius', 'border-width', 'margin', 'gap', 'max-width', 'left', 'top', 'right', 'bottom', 'min-height']);
function normVal(prop, v) {
  v = String(v).trim();
  if (PX_PROPS.has(prop)) v = v.split(/\s+/).map(x => /^-?\d*\.?\d+$/.test(x) ? x + 'px' : x).join(' ');
  return v;
}
/* Style edits from the panels: respects "every one like this", the screen size and Normal/Hover/Pressed */
function setStyle(prop, value, label) {
  const s = sEl(S.sel); if (!s) return;
  const props = typeof prop === 'object' ? prop : { [prop]: normVal(prop, value) };
  for (const v of Object.values(props)) if (safeVal(v) == null) { toast('That value can’t be used. Type a number, a size like 12px, or pick a color.'); return; }
  const cls = mainClass(s);
  if (S.scope === 'all' && cls) {
    if (S.device === 'desktop' && S.state === 'normal') {
      const sel = '.' + cls, path = sheetWithRule(sel) || mainSheet(true);
      const key = keyOf(s, false);
      act(`Changed the ${label} of every ${pretty(cls).toLowerCase()}`, () => {
        for (const [p, v] of Object.entries(props)) setDecl(path, sel, p, v);
        /* This one's own value would hide the shared change, so drop it */
        if (key) { putSty(selOf(key), Object.fromEntries(Object.keys(props).map(p => [p, ''])), 'desktop'); writeSty(); }
      }, { render: false, where: 'Every page', pageDirty: false, cssPath: path });
      if (key) refreshCss(SE_CSS);
    } else {
      act(`Changed the ${label} of every ${pretty(cls).toLowerCase()}${S.state !== 'normal' ? ` (${S.state === 'hover' ? 'hovered' : 'pressed'})` : ''}`, () => {
        putSty(stateSel('.' + cls, S.state), props); writeSty(); return ensureStyLink();
      }, { render: false, where: 'Every page', cssPath: SE_CSS });
    }
  } else {
    act(`Changed the ${label} of ${nameOf(s)}${S.state !== 'normal' ? ` (${S.state === 'hover' ? 'hovered' : 'pressed'})` : ''}`, () => applyOwn(s, props, { state: S.state }),
      { render: false, cssPath: SE_CSS });
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
        if (!/^(#[0-9a-f]{3}|#[0-9a-f]{6})$|^rgb\(|^hsl\(/i.test(v) && !/^(rgba|hsla)\([^)]*[,\/]\s*1(\.0+)?\s*\)$/i.test(v) || seen.has(m[1])) continue;
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



teamColors = memo(teamColors);
teamFonts = memo(teamFonts);
const _hexCache = new Map(); let _hexV = -1;
const _resolvedHex = resolvedHex;
resolvedHex = v => { if (_hexV !== S.fv) { _hexCache.clear(); _hexV = S.fv; } if (!_hexCache.has(v)) _hexCache.set(v, _resolvedHex(v)); return _hexCache.get(v); };

/* Countdown defaults live here because the canvas, panels and runtime all use them */
function defaultCountdown() {
  const d = new Date(Date.now() + 30 * 86400000); d.setHours(9, 0, 0, 0);
  return { show: 'd', label: 'Counting down to', queue: [{ name: 'Next event', date: localISO(d) }], auto: true, upnext: true, zero: 'day', zeroText: 'Happening now!', after: 'hide', afterText: 'See you next season' };
}
function localISO(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
