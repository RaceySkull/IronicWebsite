/* Site Editor v2 — canvas
   Frame size and zoom, rulers, picking and selecting, free placement
   (drag, resize, snapping), inserting, the floating action bar, the
   right-click menu, tools and keyboard shortcuts. */
'use strict';

const DEV_W = { desktop: 1280, tablet: 834, phone: 390 };
S.z = 1;
S.pendingClear = [];

/* ---------- Frame size, zoom, rulers ---------- */
function layoutFrame() {
  const stage = $('#stage'), box = $('#frameBox'), fr = $('#frame');
  if (!stage || $('#app').hidden) return;
  const W = DEV_W[S.device];
  const availW = Math.max(200, stage.clientWidth - 64), availH = Math.max(200, stage.clientHeight - 64);
  const z = S.zoom === 'fit' ? Math.min(1, availW / W) : S.zoom;
  S.z = z;
  const H = Math.round(availH / z);
  box.style.width = Math.round(W * z) + 'px';
  box.style.height = Math.round(H * z) + 'px';
  fr.style.width = W + 'px'; fr.style.height = H + 'px';
  fr.style.transform = `scale(${z})`;
  $('#zoomBtn').textContent = (S.zoom === 'fit' ? 'Fit · ' : '') + Math.round(z * 100) + '%';
  $('#statusDev').textContent = { desktop: 'Desktop', tablet: 'Tablet', phone: 'Phone' }[S.device] + ` · ${W}px`;
  drawRulers(); drawSelection(); if (typeof renderTabs === 'function' && S.page) renderTabs();
}
window.addEventListener('resize', () => layoutFrame());
function setZoom(z) {
  if (z === 'fit') S.zoom = 'fit';
  else S.zoom = Math.min(4, Math.max(0.1, Math.round(z * 100) / 100));
  layoutFrame();
}
function zoomStep(dir) {
  const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  const cur = S.z;
  const next = dir > 0 ? steps.find(s => s > cur + 0.001) : [...steps].reverse().find(s => s < cur - 0.001);
  setZoom(next || cur);
}
$('#zoomBtn').onclick = e => {
  showFlyout(e.currentTarget, [['Fit to window', () => setZoom('fit')], ['50%', () => setZoom(0.5)], ['75%', () => setZoom(0.75)], ['100%', () => setZoom(1)], ['150%', () => setZoom(1.5)], ['200%', () => setZoom(2)]], 'up');
};
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function drawRulers() {
  const h = $('#rulerH'), v = $('#rulerV'), box = $('#frameBox');
  if (!h || !box.offsetWidth) return;
  const dpr = window.devicePixelRatio || 1, z = S.z;
  let sy = 0; try { sy = fwin().scrollY || 0; } catch (e) { /* not loaded */ }
  const step = [5, 10, 25, 50, 100, 200, 500, 1000].find(s => s * z >= 60) || 1000;
  const draw = (cv, horiz) => {
    const r = cv.getBoundingClientRect(); cv.width = r.width * dpr; cv.height = r.height * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    c.fillStyle = cssVar('--panel'); c.fillRect(0, 0, r.width, r.height);
    c.strokeStyle = cssVar('--faint'); c.fillStyle = cssVar('--dim'); c.font = '9px "IBM Plex Mono", monospace'; c.lineWidth = 1;
    const br = box.getBoundingClientRect();
    const origin = horiz ? br.left - r.left : br.top - r.top - sy * z;
    const len = horiz ? r.width : r.height;
    const first = Math.floor(-origin / z / (step / 5)) * (step / 5);
    for (let val = first; ; val += step / 5) {
      const pos = origin + val * z; if (pos > len) break; if (pos < 0) continue;
      const major = Math.abs(val % step) < 0.001, tl = major ? 10 : 4;
      c.beginPath();
      if (horiz) { c.moveTo(Math.round(pos) + .5, r.height); c.lineTo(Math.round(pos) + .5, r.height - tl); }
      else { c.moveTo(r.width, Math.round(pos) + .5); c.lineTo(r.width - tl, Math.round(pos) + .5); }
      c.stroke();
      if (major) {
        if (horiz) c.fillText(String(Math.round(val)), pos + 3, 9);
        else { c.save(); c.translate(9, pos + 3); c.rotate(-Math.PI / 2); c.textAlign = 'right'; c.fillText(String(Math.round(val)), 0, 0); c.restore(); }
      }
    }
    const el = rEl(S.sel);
    if (el) {
      const er = el.getBoundingClientRect();
      c.fillStyle = 'rgba(240,90,40,0.25)';
      if (horiz) c.fillRect(br.left - r.left + er.left * z, 0, er.width * z, r.height);
      else c.fillRect(0, br.top - r.top + er.top * z, r.width, er.height * z);
    }
  };
  draw(h, true); draw(v, false);
}
$('#stage').addEventListener('scroll', () => { drawRulers(); placeCtxBar(); });

/* ---------- Frame events ---------- */
function onFrameLoad() {
  S.pendingClear = [];
  const d = fdoc(), w = fwin(); if (!d) return;
  try { w.scrollTo(0, S.scroll || 0); } catch (e) { /* ignore */ }
  layoutFrame();
  w.addEventListener('scroll', () => { drawSelection(); hideCtx(); drawRulers(); }, { passive: true });
  if (S.preview) {
    d.addEventListener('click', e => {
      const a = e.target.closest('a[href]'); if (!a) return;
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#') || a.hasAttribute('data-se-open')) return;
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
  d.addEventListener('mousedown', onCanvasDown, true);
  d.addEventListener('click', e => { if (!(S.editing && e.target.closest('[contenteditable]'))) { e.preventDefault(); e.stopPropagation(); } }, true);
  d.addEventListener('dblclick', onCanvasDbl, true);
  d.addEventListener('contextmenu', onCanvasMenu, true);
  d.addEventListener('keydown', onKey, true);
  d.addEventListener('keyup', onKeyUp, true);
  d.addEventListener('submit', e => e.preventDefault(), true);
  d.addEventListener('toggle', e => { const t = e.target; if (t.tagName === 'DETAILS') { const id = t.getAttribute('data-se-id'); if (t.open) S.openDetails.add(id); else S.openDetails.delete(id); } }, true);
  w.addEventListener('resize', drawSelection);
  setBodyToolClass();
  drawSelection();
  if (S.tlOpen) tlScrub();
}
function setBodyToolClass() {
  const d = fdoc(); if (!d || !d.body) return;
  d.body.classList.toggle('se-tool-insert', ['rect', 'ellipse', 'line', 'text', 'image', 'pivot', 'zoom'].includes(S.tool));
  d.body.classList.toggle('se-tool-hand', S.tool === 'hand' || S.spaceHand);
}

/* ---------- Picking ---------- */
function lockedAll(el) { return !!(el && el.closest && el.closest('[data-se-lock="all"]')); }
function pickAt(x, y, opts = {}) {
  const d = fdoc(); if (!d) return null;
  const list = d.elementsFromPoint(x, y);
  for (let el of list) {
    if (!el.closest || el.closest('[data-se-ui]')) continue;
    if (el.tagName === 'HTML') continue;
    const cd = el.closest('.se-countdown,.se-embed'); if (cd) el = cd;
    el = el.closest('[data-se-id]'); if (!el) continue;
    if (lockedAll(el)) continue;
    if (opts.group && el.parentElement && el.parentElement.tagName !== 'BODY' && el.parentElement.hasAttribute('data-se-id')) {
      let g = el.parentElement; if (!lockedAll(g)) el = g;
    }
    return el;
  }
  return null;
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
    const s = sEl(target.getAttribute('data-se-id'));
    const locked = s && s.getAttribute('data-se-lock');
    const H = { nw: '0,0', n: '50%,0', ne: '100%,0', e: '100%,50%', se: '100%,100%', s: '50%,100%', sw: '0,100%', w: '0,50%' };
    const cur = { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' };
    box.innerHTML = `<span class="se-ui-tag">${esc(label || '')}${locked ? ' · locked' : ''}</span>` + (locked || S.editing ? '' : Object.entries(H).map(([k, h]) => {
      const [x, y] = h.split(','); return `<span class="se-ui-h" data-h="${k}" style="left:calc(${x} - 4px);top:calc(${y} - 4px);cursor:${cur[k]}-resize"></span>`;
    }).join(''));
    if (r.top < 28) box.firstChild.style.top = (r.height + 4) + 'px';
  }
}
function drawSelection() {
  const el = rEl(S.sel);
  drawBox('sel', el, el ? nameOf(sEl(S.sel)) : '');
  const piv = ui('pivot');
  if (piv) {
    if (S.tlOpen && el) {
      const c = tlCfg(sEl(S.sel)), r = el.getBoundingClientRect();
      const [px, py] = (c.pivot || '50% 50%').split(' ').map(v => parseFloat(v) / 100);
      Object.assign(piv.style, { display: 'block', left: (r.left + r.width * px) + 'px', top: (r.top + r.height * py) + 'px', width: '20px', height: '20px' });
      piv.className = 'se-ui-pivot';
    } else piv.style.display = 'none';
  }
  placeCtxBar(); drawRulers();
}
function onHover(e) {
  if (S.editing || S.dragging) return;
  const t = pickAt(e.clientX, e.clientY, { group: S.tool === 'direct' });
  drawBox('hover', t && t.getAttribute('data-se-id') !== S.sel ? t : null);
}

/* ---------- Selecting ---------- */
function select(id, opts = {}) {
  if (S.editing) finishTextEdit();
  if (id === 'body') id = null;
  const changed = id !== S.sel;
  S.sel = id;
  if (changed) {
    S.scope = 'one';
    if (S.state !== 'normal') { S.state = 'normal'; renderFrame(); }
    const s = sEl(id);
    if (s) { for (let p = s.parentElement; p; p = p.parentElement) { const pid = p.getAttribute && p.getAttribute('data-se-id'); if (pid) S.openLayers.add(pid); } }
    const pop = s && s.closest('[data-se-popup]');
    const want = pop ? pop.getAttribute('data-se-popup') : null;
    if (want !== S.showPopup && (want || S.showPopup)) { S.showPopup = want; renderFrame(); }
  }
  drawSelection(); drawBox('hover', null);
  renderAll();
  const el = sEl(id);
  $('#statusSel').textContent = el ? nameOf(el) : 'Nothing selected';
}
function nameOf(el) {
  if (!el || !el.tagName) return '';
  if (el.getAttribute('data-se-name')) return el.getAttribute('data-se-name');
  const tag = el.tagName.toLowerCase(), cls = mainClass(el);
  let kind;
  if (el.hasAttribute('data-se-popup')) return 'Pop-up: ' + el.getAttribute('data-se-popup');
  if (el.hasAttribute('data-se-shared')) return el.getAttribute('data-se-shared');
  if (el.classList.contains('se-countdown')) kind = 'Countdown';
  else if (el.classList.contains('se-embed')) kind = 'Embed';
  else if (el.hasAttribute('data-se-tabs')) kind = 'Section tabs';
  else if (el.classList.contains('se-shape')) kind = el.classList.contains('se-ellipse') ? 'Ellipse' : el.classList.contains('se-line') ? 'Line' : 'Rectangle';
  else if (tag === 'details') kind = 'Expanding row';
  else if (tag === 'a') kind = /btn|button/.test(el.className) ? 'Button' : 'Link';
  else kind = ({ h1: 'Headline', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading', p: 'Paragraph', img: 'Image', nav: 'Menu bar', header: 'Header', footer: 'Footer',
    section: 'Section', main: 'Main area', article: 'Article', aside: 'Side area', ul: 'List', ol: 'List', li: 'List item', span: 'Text', strong: 'Bold text', em: 'Italic text', summary: 'Row title',
    div: 'Box', button: 'Button', svg: 'Graphic', g: 'Graphic part', path: 'Graphic part', circle: 'Graphic part', rect: 'Graphic part', line: 'Graphic part', polygon: 'Graphic part', ellipse: 'Graphic part',
    form: 'Form', input: 'Field', textarea: 'Field', select: 'Dropdown', label: 'Label', iframe: 'Embedded page', video: 'Video', table: 'Table', figure: 'Figure', figcaption: 'Caption', canvas: 'Animation area' })[tag] || 'Box';
  let detail = cls && !/^se-|^type-/.test(cls) ? pretty(cls) : '';
  if (!detail && el.id) detail = pretty(el.id);
  if (!detail && el.getAttribute && el.getAttribute('class') && (el.getAttribute('class') || '').match(/\b(j\d|ft|fb)\b/)) detail = el.getAttribute('class');
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
  if (!detail && text && text.length < 40 && !['section', 'nav', 'main', 'header', 'footer', 'ul', 'ol', 'details'].includes(tag)) detail = '“' + text + '”';
  if (tag === 'details') { const s = el.querySelector('summary'); if (s) detail = '“' + s.textContent.trim().slice(0, 30) + '”'; }
  if (tag === 'img' && el.getAttribute('alt')) detail = '“' + el.getAttribute('alt').slice(0, 30) + '”';
  const out = detail && detail.toLowerCase() !== kind.toLowerCase() ? `${kind}: ${detail}` : kind;
  return out.length > 48 ? out.slice(0, 46) + '…' : out;
}
function mainClass(el) { return [...(el.classList || [])].find(c => !/^se-|^type-/.test(c)) || ''; }

/* ---------- Free placement ---------- */
const NOFREE = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT', 'BR', 'TITLE', 'HEAD']);
const ATOMIC = new Set(['SVG', 'IMG', 'IFRAME', 'VIDEO', 'PICTURE', 'CANVAS', 'DETAILS', 'FORM', 'SELECT', 'TEXTAREA', 'INPUT', 'TABLE', 'UL', 'OL', 'BUTTON', 'A', 'SUMMARY']);
function hasDirectText(el) { for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true; return false; }
function rpos(r) { try { return fwin().getComputedStyle(r).position; } catch (e) { return 'static'; } }
function isFree(r) { const p = rpos(r); return p === 'absolute' || p === 'fixed'; }
/* The element that actually moves: climbs out of text so words never get pulled apart */
function movableOf(r) {
  let el = r;
  while (el.parentElement && el.parentElement.tagName !== 'BODY' && (hasDirectText(el.parentElement) || ['SUMMARY', 'svg', 'g'].includes(el.parentElement.tagName) && false)) el = el.parentElement;
  return el;
}
function textish(r) { return !r.children.length || hasDirectText(r) || /^(P|H[1-6]|SPAN|A|LABEL|LI|BUTTON|SUMMARY)$/.test(r.tagName); }
/* Measures a rendered element's box relative to its parent, ready to become an absolute position */
function measure(r) {
  const p = r.parentElement, w = fwin();
  const cr = r.getBoundingClientRect(), pr = p.getBoundingClientRect(), ps = w.getComputedStyle(p);
  const left = cr.left - pr.left - parseFloat(ps.borderLeftWidth) + p.scrollLeft;
  const top = cr.top - pr.top - parseFloat(ps.borderTopWidth) + p.scrollTop;
  const inner = p.clientWidth;
  const props = { position: 'absolute', margin: '0', 'box-sizing': 'border-box' };
  if (Math.abs(cr.width - inner) < 1.5 && Math.abs(left) < 1.5) { props.left = '0px'; props.width = '100%'; }
  else {
    const gapL = left, gapR = inner - left - cr.width;
    props.left = Math.abs(gapL - gapR) < 2 && gapL > 4 ? `calc(50% - ${Math.round(cr.width / 2)}px)` : Math.round(left) + 'px';
    props.width = Math.ceil(cr.width + (textish(r) ? 1 : 0)) + 'px';
  }
  props.top = Math.round(top) + 'px';
  props.height = textish(r) ? 'auto' : Math.round(cr.height) + 'px';
  if (textish(r)) props['min-height'] = Math.round(cr.height) + 'px';
  return props;
}
function parentPrep(p) {
  const w = fwin(), cs = w.getComputedStyle(p), out = {};
  if (cs.position === 'static') out.position = 'relative';
  if (p.tagName !== 'HTML') out.height = Math.round(p.getBoundingClientRect().height) + 'px';
  if (cs.boxSizing !== 'border-box') out['box-sizing'] = 'border-box';
  /* A first/last child's margin can poke out through its parent ("margin collapse").
     Once the children are free-placed that stops, so keep the parent where it was. */
  if (p.tagName !== 'HTML') {
    const flow = [...p.children].filter(c => !NOFREE.has(c.tagName.toUpperCase()) && !['absolute', 'fixed'].includes(w.getComputedStyle(c).position) && w.getComputedStyle(c).display !== 'none');
    if (flow.length && !parseFloat(cs.paddingTop) && !parseFloat(cs.borderTopWidth)) { const m = parseFloat(w.getComputedStyle(flow[0]).marginTop) || 0; if (m > (parseFloat(cs.marginTop) || 0)) out['margin-top'] = m + 'px'; }
    if (flow.length && !parseFloat(cs.paddingBottom) && !parseFloat(cs.borderBottomWidth)) { const m = parseFloat(w.getComputedStyle(flow[flow.length - 1]).marginBottom) || 0; if (m > (parseFloat(cs.marginBottom) || 0)) out['margin-bottom'] = m + 'px'; }
  }
  return out;
}
/* Freezes every flowing sibling of r (and r) into absolute positions. Returns [id, props][] to apply. */
function planFreeze(r) {
  const p = r.parentElement; if (!p) return [];
  const plan = [];
  const kids = [...p.children].filter(c => !NOFREE.has(c.tagName.toUpperCase()) && !c.hasAttribute('data-se-ui') && c.hasAttribute('data-se-id'));
  const flowing = kids.filter(c => { const ps = rpos(c); return ps !== 'absolute' && ps !== 'fixed' && ps !== 'sticky' && fwin().getComputedStyle(c).display !== 'none'; });
  if (!flowing.length) return plan;
  if (p.hasAttribute('data-se-id')) plan.push([p.getAttribute('data-se-id'), parentPrep(p)]);
  for (const c of flowing) plan.push([c.getAttribute('data-se-id'), measure(c)]);
  return plan;
}
function planFreezeTree(root) {
  const plan = [], seen = new Set();
  (function walk(p) {
    const kids = [...p.children].filter(c => c.hasAttribute('data-se-id') && !c.hasAttribute('data-se-ui'));
    if (!kids.length || hasDirectText(p)) return;
    for (const step of planFreeze(kids[0])) { if (!seen.has(step[0])) { seen.add(step[0]); plan.push(step); } }
    for (const c of kids) if (!ATOMIC.has(c.tagName.toUpperCase()) && c.children.length && !hasDirectText(c) && rpos(c) !== 'fixed') walk(c);
  })(root);
  return plan;
}
function applyPlan(plan, devOverride) {
  let needLink = false;
  for (const [id, props] of plan) {
    const s = sEl(id); if (!s) continue;
    if (applyOwn(s, props, { device: devOverride || 'desktop' })) needLink = true;
  }
  return needLink;
}
function freeWholePage() {
  const d = fdoc(); if (!d) return;
  if (S.device !== 'desktop') { toast('Switch to Desktop first. Free placement starts from the desktop layout.'); return; }
  const plan = planFreezeTree(d.body);
  if (!plan.length) { toast('Everything on this page is already free-placed'); return; }
  act('Free-placed everything on the page', () => { applyPlan(plan); return true; }, { devLabel: false });
  toast('Done. Everything on this page can now be dragged anywhere.', 4000);
}

/* ---------- Dragging, resizing, snapping ---------- */
function frameXY(e) { const fr = $('#frameBox').getBoundingClientRect(); return { x: (e.clientX - fr.left) / S.z, y: (e.clientY - fr.top) / S.z }; }
function shield(cursor) { const sh = document.createElement('div'); sh.className = 'drag-shield'; sh.style.cursor = cursor || 'default'; document.body.appendChild(sh); return sh; }
function onCanvasDown(e) {
  if (e.button !== 0) return;
  if (S.editing && e.target.closest('[contenteditable]')) return;
  e.preventDefault();
  hideCtx(); closeMenus(); hideFlyout();
  const h = e.target.closest && e.target.closest('[data-h]');
  if (h && S.sel) { startResize(e, h.dataset.h); return; }
  if (S.tool === 'hand' || S.spaceHand) { startPan(e); return; }
  if (S.tool === 'zoom') { zoomStep(e.altKey ? -1 : 1); return; }
  if (S.tool === 'pivot') { setPivotFromClick(e); return; }
  if (['rect', 'ellipse', 'line', 'text'].includes(S.tool)) { insertAt(e.clientX, e.clientY, S.tool); return; }
  if (S.tool === 'image') { const pt = { x: e.clientX, y: e.clientY }; pickMedia('image', p => insertImage(pt, p)); setTool('select'); return; }
  let t = pickAt(e.clientX, e.clientY, { group: S.tool === 'direct' });
  const cur = rEl(S.sel);
  if (!t) { select(null); return; }
  const id = t.getAttribute('data-se-id');
  if (id !== S.sel) select(id);
  startMove(e, t);
}
/* Follows a press that started in the page: the browser keeps sending moves to the page
   frame until release, so listen there too and convert to window coordinates. */
function trackDrag(mv, up) {
  let done = false;
  const d = fdoc();
  const conv = ev => { const fb = $('#frameBox').getBoundingClientRect(); return { clientX: fb.left + ev.clientX * S.z, clientY: fb.top + ev.clientY * S.z, shiftKey: ev.shiftKey, altKey: ev.altKey, screenX: ev.screenX, screenY: ev.screenY }; };
  const mvIn = ev => mv(conv(ev));
  const fin = ev => {
    if (done) return; done = true;
    removeEventListener('mousemove', mv); removeEventListener('mouseup', fin);
    if (d) { d.removeEventListener('mousemove', mvIn, true); d.removeEventListener('mouseup', fin, true); }
    up(ev);
  };
  addEventListener('mousemove', mv); addEventListener('mouseup', fin);
  if (d) { d.addEventListener('mousemove', mvIn, true); d.addEventListener('mouseup', fin, true); }
}
function startPan(e) {
  const sh = shield('grabbing'), st = $('#stage'), sx = e.screenX, sy = e.screenY, sl = st.scrollLeft;
  let last = e.screenY;
  const mv = ev => { st.scrollLeft = sl - (ev.screenX - sx); try { fwin().scrollBy(0, -(ev.screenY - last) / S.z); } catch (er) { /* ignore */ } last = ev.screenY; };
  trackDrag(mv, () => sh.remove());
}
function snapLines(r, box) {
  const p = r.parentElement, pr = p.getBoundingClientRect();
  const xs = [0, pr.width / 2, pr.width], ys = [0, pr.height / 2, pr.height];
  for (const c of p.children) {
    if (c === r || !c.hasAttribute('data-se-id')) continue;
    const cr = c.getBoundingClientRect(); if (!cr.width) continue;
    xs.push(cr.left - pr.left, cr.left - pr.left + cr.width / 2, cr.right - pr.left);
    ys.push(cr.top - pr.top, cr.top - pr.top + cr.height / 2, cr.bottom - pr.top);
  }
  const th = 5 / S.z;
  const snap1 = (vals, edges) => {
    let best = null;
    for (const v of vals) for (const [k, ev] of edges) { const d = v - ev; if (Math.abs(d) <= th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, v, k }; }
    return best;
  };
  const sx = snap1(xs, [['l', box.left], ['c', box.left + box.width / 2], ['r', box.left + box.width]]);
  const sy = snap1(ys, [['t', box.top], ['m', box.top + box.height / 2], ['b', box.top + box.height]]);
  return { sx, sy, pr };
}
function drawGuides(sx, sy, pr) {
  for (const k of ['gx', 'gy']) { const g = ui(k); if (g) g.style.display = 'none'; }
  if (sx) { const g = ui('gx'); Object.assign(g.style, { display: 'block', left: (pr.left + sx.v) + 'px', top: pr.top + 'px', width: '1px', height: pr.height + 'px' }); g.className = 'se-ui-guide'; }
  if (sy) { const g = ui('gy'); Object.assign(g.style, { display: 'block', left: pr.left + 'px', top: (pr.top + sy.v) + 'px', width: pr.width + 'px', height: '1px' }); g.className = 'se-ui-guide'; }
}
function startMove(e, t0) {
  const s0 = sEl(t0.getAttribute('data-se-id'));
  const start = { x: e.clientX, y: e.clientY };
  let r = null, plan = null, base = null, moved = false, sh = null;
  const lockedPos = () => s0 && s0.closest('[data-se-lock]');
  const mv = ev => {
    const p = frameXY(ev); let dx = p.x - start.x, dy = p.y - start.y;
    if (!moved) {
      if (Math.hypot(dx, dy) < 3 / S.z) return;
      if (lockedPos()) { if (!mv.warned) toast('This is locked in place. Unlock it in Layers to move it.'); mv.warned = true; return; }
      if (S.device !== 'desktop' && !isFree(movableOf(t0))) { if (!mv.warned) toast('Switch to Desktop to free-place this first, then you can move it for this screen.'); mv.warned = true; return; }
      moved = true; S.dragging = true; sh = shield('move'); $('#ctxBar').hidden = true;
      r = movableOf(t0);
      if (r !== t0) { select(r.getAttribute('data-se-id')); }
      plan = isFree(r) ? [] : planFreeze(r);
      for (const [id, props] of plan) { const el = rEl(id); if (el) for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v); }
      const cs = fwin().getComputedStyle(r), pr = r.parentElement.getBoundingClientRect(), cr = r.getBoundingClientRect();
      base = { left: cr.left - pr.left - parseFloat(fwin().getComputedStyle(r.parentElement).borderLeftWidth), top: cr.top - pr.top - parseFloat(fwin().getComputedStyle(r.parentElement).borderTopWidth), w: cr.width, h: cr.height, fixed: cs.position === 'fixed' };
      if (base.fixed) { base.left = cr.left; base.top = cr.top; }
    }
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    let L = base.left + dx, T = base.top + dy;
    if (!base.fixed && !ev.altKey) {
      const { sx, sy, pr } = snapLines(r, { left: L, top: T, width: base.w, height: base.h });
      if (sx) L += sx.d; if (sy) T += sy.d;
      drawGuides(sx, sy, pr);
    }
    r.style.setProperty('left', Math.round(L) + 'px'); r.style.setProperty('top', Math.round(T) + 'px');
    r.style.setProperty('right', 'auto'); r.style.setProperty('bottom', 'auto');
    r.__seFinal = { L: Math.round(L), T: Math.round(T), center: !base.fixed && Math.abs((L + base.w / 2) - r.parentElement.getBoundingClientRect().width / 2) < 1 };
    drawSelection(); $('#ctxBar').hidden = true;
  };
  const up = () => {
    S.dragging = false; if (sh) sh.remove();
    for (const k of ['gx', 'gy']) { const g = ui(k); if (g) g.style.display = 'none'; }
    if (!moved || !r || !r.__seFinal) { drawSelection(); return; }
    const f = r.__seFinal, s = sEl(r.getAttribute('data-se-id'));
    const left = f.center ? `calc(50% - ${Math.round(base.w / 2)}px)` : f.L + 'px';
    const props = { left, top: f.T + 'px', right: 'auto', bottom: 'auto' };
    S.pendingClear.push([r, Object.keys(props)]);
    act(`Moved ${nameOf(s)}`, () => {
      let link = plan.length ? applyPlan(plan) : false;
      if (applyOwn(s, props)) link = true;
      return link;
    }, { render: false, cssPath: SE_CSS });
  };
  trackDrag(mv, up);
}
function startResize(e, hnd) {
  const r0 = rEl(S.sel), s = sEl(S.sel); if (!r0 || !s) return;
  if (s.closest('[data-se-lock]')) { toast('This is locked. Unlock it in Layers to resize it.'); return; }
  if (S.device !== 'desktop' && !isFree(movableOf(r0))) { toast('Switch to Desktop to free-place this first.'); return; }
  const r = r0, start = { x: e.clientX, y: e.clientY }, sh = shield(getComputedStyle(e.target).cursor);
  const plan = isFree(r) ? [] : planFreeze(r);
  for (const [id, props] of plan) { const el = rEl(id); if (el) for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v); }
  const pr = r.parentElement.getBoundingClientRect(), cr = r.getBoundingClientRect(), fixed = rpos(r) === 'fixed';
  const b = fixed ? { l: cr.left, t: cr.top, w: cr.width, h: cr.height } : { l: cr.left - pr.left, t: cr.top - pr.top, w: cr.width, h: cr.height };
  const ratio = b.w / (b.h || 1);
  let out = null;
  S.dragging = true; $('#ctxBar').hidden = true;
  const mv = ev => {
    const p = frameXY(ev), dx = p.x - start.x, dy = p.y - start.y;
    let { l, t, w, h } = b;
    if (hnd.includes('e')) w = b.w + dx;
    if (hnd.includes('w')) { w = b.w - dx; l = b.l + dx; }
    if (hnd.includes('s')) h = b.h + dy;
    if (hnd.includes('n')) { h = b.h - dy; t = b.t + dy; }
    if (ev.shiftKey && hnd.length === 2) { if (Math.abs(dx) > Math.abs(dy)) { const nh = w / ratio; if (hnd.includes('n')) t += h - nh; h = nh; } else { const nw = h * ratio; if (hnd.includes('w')) l += w - nw; w = nw; } }
    w = Math.max(4, w); h = Math.max(4, h);
    out = { left: Math.round(l) + 'px', top: Math.round(t) + 'px', width: Math.round(w) + 'px', height: Math.round(h) + 'px' };
    for (const [k, v] of Object.entries(out)) r.style.setProperty(k, v);
    if (!fixed) r.style.setProperty('position', 'absolute');
    drawSelection(); $('#ctxBar').hidden = true;
  };
  const up = () => {
    sh.remove(); S.dragging = false;
    if (!out) { drawSelection(); return; }
    if (hnd === 'e' || hnd === 'w') delete out.height;
    if (hnd === 'n' || hnd === 's') delete out.width;
    if (!hnd.includes('n') && !hnd.includes('s')) delete out.top;
    if (!hnd.includes('w') && !hnd.includes('e')) delete out.left;
    if (hnd === 'n' || hnd === 's' || hnd.length === 2) out['min-height'] = '';
    S.pendingClear.push([r, Object.keys(out).concat(['position'])]);
    act(`Resized ${nameOf(s)}`, () => { let link = plan.length ? applyPlan(plan) : false; if (applyOwn(s, out)) link = true; return link; }, { render: false, cssPath: SE_CSS });
  };
  trackDrag(mv, up);
}
function nudge(dx, dy) {
  const s = sEl(S.sel), r = rEl(S.sel); if (!s || !r) return;
  if (s.closest('[data-se-lock]')) { toast('Locked in place'); return; }
  const m = movableOf(r);
  if (!isFree(m)) { toast('Drag it once to free-place it, then arrow keys nudge it'); return; }
  const cs = fwin().getComputedStyle(m);
  const L = parseFloat(cs.left) + dx, T = parseFloat(cs.top) + dy;
  m.style.left = L + 'px'; m.style.top = T + 'px';
  S.pendingClear.push([m, ['left', 'top']]);
  act(`Nudged ${nameOf(sEl(m.getAttribute('data-se-id')))}`, () => applyOwn(sEl(m.getAttribute('data-se-id')), { left: Math.round(L) + 'px', top: Math.round(T) + 'px' }), { render: false, cssPath: SE_CSS });
}
/* After a stylesheet reload, drop the temporary inline styles used while dragging */
const _refreshCss = refreshCss;
refreshCss = function (path) {
  const d = fdoc(); if (!d) return;
  const links = [...d.querySelectorAll(`link[data-se-css="${CSS.escape(path)}"]`)];
  const pending = S.pendingClear.splice(0);
  if (!links.length) { pending.forEach(([el, ps]) => ps.forEach(p => el.style.removeProperty(p))); }
  for (const l of links) {
    l.onload = () => { pending.forEach(([el, ps]) => ps.forEach(p => el.style.removeProperty(p))); drawSelection(); if (S.tlOpen) tlScrub(); };
    l.href = cssUrl(path);
  }
  setTimeout(drawSelection, 80);
};

/* ---------- Text editing ---------- */
function onCanvasDbl(e) {
  e.preventDefault();
  const t = pickAt(e.clientX, e.clientY); if (!t) return;
  if (t.tagName === 'DETAILS' || t.tagName === 'SUMMARY') { const d = t.closest('details'); d.open = !d.open; return; }
  startTextEdit(t.getAttribute('data-se-id'));
}
function canEditText(el) {
  if (!el || el.closest('.se-countdown,.se-embed')) return false;
  if (['IMG', 'SVG', 'svg', 'VIDEO', 'IFRAME', 'INPUT', 'SELECT', 'TEXTAREA', 'BODY', 'CANVAS'].includes(el.tagName)) return false;
  if (el.querySelector('img,svg,video,iframe,picture,canvas,input,select,textarea,div,section,ul,ol,table,details')) return false;
  return (el.textContent || '').trim().length > 0 || el.classList.contains('se-text');
}
function startTextEdit(id) {
  const el = rEl(id);
  if (!canEditText(el)) { toast('Only plain text can be typed into directly. Select a smaller piece.'); return; }
  if (sEl(id).closest('[data-se-lock="all"]')) { toast('This is locked'); return; }
  if (S.sel !== id) select(id);
  S.editing = id;
  el.setAttribute('contenteditable', 'true'); el.focus();
  const d = fdoc(), rg = d.createRange(); rg.selectNodeContents(el);
  const sl = fwin().getSelection(); sl.removeAllRanges(); sl.addRange(rg);
  el.addEventListener('blur', finishTextEdit, { once: true });
  ui('sel').style.display = 'none'; $('#ctxBar').hidden = true;
  $('#statusTip').textContent = 'Typing. Click outside or press Esc when you’re done.';
}
function finishTextEdit() {
  const id = S.editing; if (!id) return;
  S.editing = null;
  const r = rEl(id), s = sEl(id);
  $('#statusTip').textContent = '';
  if (!r || !s) return;
  r.removeAttribute('contenteditable');
  const html = r.innerHTML;
  if (html !== s.innerHTML) {
    act(`Changed the words in ${nameOf(s)}`, () => { s.innerHTML = html; assignIds(getDoc(S.page)); }, { render: false, fromEdit: true, devLabel: false });
    r.innerHTML = s.innerHTML;
  }
  drawSelection();
}

/* ---------- Inserting ---------- */
const CONTAINERS = new Set(['BODY', 'MAIN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'DIV', 'NAV', 'FIGURE']);
function containerAt(x, y) {
  const d = fdoc();
  for (let el of d.elementsFromPoint(x, y)) {
    if (!el.closest || el.closest('[data-se-ui]')) continue;
    el = el.closest('[data-se-id]') || d.body;
    while (el && el !== d.body && (!CONTAINERS.has(el.tagName) || hasDirectText(el) || el.classList.contains('se-shape') || el.classList.contains('se-countdown') || el.classList.contains('se-embed') || lockedAll(el))) el = el.parentElement;
    return el || d.body;
  }
  return d.body;
}
function insertAt(cx, cy, kind, html) {
  const d = fdoc(); if (!d) return;
  const box = containerAt(cx, cy), br = box.getBoundingClientRect();
  const sPar = box === d.body ? getDoc(S.page).body : sEl(box.getAttribute('data-se-id'));
  const x = Math.max(0, Math.round(cx - br.left)), y = Math.max(0, Math.round(cy - br.top + (box === d.body ? fwin().scrollY : 0) - (box === d.body ? fwin().scrollY : 0)));
  const doc = getDoc(S.page); let id;
  const parentNeedsPos = fwin().getComputedStyle(box).position === 'static';
  const label = { rect: 'Added a rectangle', ellipse: 'Added an ellipse', line: 'Added a line', text: 'Added text', image: 'Added an image', countdown: 'Added a countdown', expand: 'Added an expanding row', embed: 'Added embedded content', tabs: 'Added section tabs' }[kind];
  act(label, () => {
    let el; const firstColor = (teamColors()[0] || {}).prop;
    const look = { position: 'absolute', left: x + 'px', top: y + 'px', margin: '0', 'box-sizing': 'border-box' };
    if (kind === 'rect' || kind === 'ellipse' || kind === 'line') {
      el = doc.createElement('div'); el.className = 'se-shape' + (kind === 'ellipse' ? ' se-ellipse' : kind === 'line' ? ' se-line' : '');
      Object.assign(look, { width: kind === 'line' ? '240px' : '200px', height: kind === 'line' ? '2px' : kind === 'ellipse' ? '200px' : '120px', background: firstColor ? `var(${firstColor})` : '#808080' });
      if (kind === 'ellipse') look['border-radius'] = '50%';
    } else if (kind === 'text') {
      el = doc.createElement('p'); el.className = 'se-text'; el.textContent = 'Type something here';
      Object.assign(look, { width: '280px' });
    } else if (kind === 'countdown') {
      el = doc.createElement('div'); el.className = 'se-countdown'; el.setAttribute('data-se-countdown', JSON.stringify(defaultCountdown()));
      Object.assign(look, { width: '420px' });
    } else if (kind === 'expand') {
      el = doc.createElement('details'); el.className = 'se-expand';
      el.innerHTML = '<summary>Click to open</summary><div class="se-expand-body"><p>What shows when it opens.</p></div>';
      Object.assign(look, { width: '480px' });
    } else if (kind === 'tabs') {
      el = doc.createElement('nav'); el.setAttribute('data-se-tabs', ''); el.setAttribute('aria-label', 'Sections on this page');
      Object.assign(look, { width: '200px' });
    } else if (kind === 'embed') {
      el = doc.createElement('div'); el.className = 'se-embed'; el.innerHTML = html || '';
      Object.assign(look, { width: '480px', 'min-height': '160px' });
    } else if (kind === 'image') {
      el = doc.createElement('img'); el.setAttribute('src', relPath(S.page, html)); el.setAttribute('alt', '');
      Object.assign(look, { width: '320px', height: 'auto' });
    }
    sPar.appendChild(el); assignIds(doc); id = el.getAttribute('data-se-id');
    if (parentNeedsPos && sPar !== doc.body) applyOwn(sPar, { position: 'relative' }, { device: 'desktop' });
    if (parentNeedsPos && sPar === doc.body) applyOwn(sPar, { position: 'relative' }, { device: 'desktop' });
    applyOwn(el, look);
    return true;
  });
  setTool('select');
  setTimeout(() => {
    if (kind === 'countdown') S.tab = 'widget';
    select(id);
    if (kind === 'text') setTimeout(() => startTextEdit(id), 80);
  }, 120);
}
function insertImage(pt, path) { insertAt(pt.x, pt.y, 'image', path); }
function insertCenter(kind, html) {
  const d = fdoc(); if (!d) return;
  const r = rEl(S.sel);
  if (r && CONTAINERS.has(r.tagName)) { const b = r.getBoundingClientRect(); insertAt(b.left + 24, b.top + 24, kind, html); return; }
  insertAt(fwin().innerWidth / 2 - 120, Math.min(fwin().innerHeight / 2, 240), kind, html);
}
function defaultCountdown() {
  const d = new Date(Date.now() + 30 * 86400000); d.setHours(9, 0, 0, 0);
  return { show: 'd', label: 'Counting down to', queue: [{ name: 'Next event', date: localISO(d) }], auto: true, upnext: true, zero: 'day', zeroText: 'Happening now!', after: 'hide', afterText: 'See you next season' };
}
function localISO(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

/* ---------- Structure edits ---------- */
function canChange(s, what) {
  if (!s) return false;
  if (s.closest('[data-se-lock]')) { toast(`It’s locked, so it can’t be ${what}. Unlock it in Layers first.`); return false; }
  return true;
}
function duplicateSel() {
  const s = sEl(S.sel); if (!s || s === getDoc(S.page).body) return;
  let id;
  act(`Duplicated ${nameOf(s)}`, () => {
    const c = s.cloneNode(true);
    for (const k of [c, ...c.querySelectorAll('[data-se-id]')]) k.removeAttribute('data-se-id');
    c.removeAttribute('data-se-shared');
    const oldKey = keyOf(s, false);
    if (oldKey) {
      c.classList.remove(oldKey);
      const nk = 'se-x' + (++S.keyN); c.classList.add(nk);
      for (const dev of ['desktop', 'tablet', 'phone']) for (const [sel, decl] of Object.entries(S.sty[dev])) {
        if (sel.includes(oldKey)) S.sty[dev][sel.split(oldKey).join(nk)] = Object.assign({}, decl, sel === selOf(oldKey) && decl.left && !decl.left.includes('calc') ? { left: (parseFloat(decl.left) + 16) + 'px', top: (parseFloat(decl.top || 0) + 16) + 'px' } : {});
      }
      writeSty();
    }
    if (c.id) c.removeAttribute('id');
    s.after(c); assignIds(getDoc(S.page)); id = c.getAttribute('data-se-id');
  }, { devLabel: false });
  setTimeout(() => select(id), 100);
}
function deleteSel() {
  const s = sEl(S.sel); if (!s || s === getDoc(S.page).body) return;
  if (!canChange(s, 'deleted')) return;
  act(`Deleted ${nameOf(s)}`, () => s.remove(), { devLabel: false });
  select(null);
}
function restack(how) {
  const s = sEl(S.sel); if (!s) return;
  const p = s.parentElement;
  const sibs = () => [...p.children].filter(c => c.hasAttribute('data-se-id'));
  const words = { front: 'to the front', forward: 'forward', backward: 'backward', back: 'to the back' };
  act(`Brought ${nameOf(s)} ${words[how]}`.replace('Brought', how === 'backward' || how === 'back' ? 'Sent' : 'Brought'), () => {
    const list = sibs(), i = list.indexOf(s);
    if (how === 'front') p.appendChild(s);
    else if (how === 'back') list[0] !== s && list[0].before(s);
    else if (how === 'forward' && list[i + 1]) list[i + 1].after(s);
    else if (how === 'backward' && list[i - 1]) list[i - 1].before(s);
  }, { devLabel: false });
  setTimeout(drawSelection, 100);
}
function replaceTag(s, tag, extra) {
  const doc = getDoc(S.page), n = doc.createElement(tag);
  for (const a of s.attributes) n.setAttribute(a.name, a.value);
  while (s.firstChild) n.appendChild(s.firstChild);
  if (extra) extra(n);
  s.replaceWith(n);
  return n;
}
function turnInto(kind) {
  const s = sEl(S.sel); if (!s) return;
  if (!canChange(s, 'changed')) return;
  if (kind === 'button') {
    if (s.tagName === 'A') { S.tab = 'widget'; renderAll(); return; }
    act(`Turned ${nameOf(s)} into a button`, () => { replaceTag(s, 'a', n => { n.setAttribute('href', '#'); n.classList.add('se-button'); }); }, { devLabel: false });
  } else if (kind === 'shape') {
    act(`Turned ${nameOf(s)} back into a plain shape`, () => {
      replaceTag(s, 'div', n => { for (const a of ['href', 'target', 'rel', 'data-se-open']) n.removeAttribute(a); n.classList.remove('se-button'); });
    }, { devLabel: false });
  } else if (kind === 'countdown') {
    act(`Turned ${nameOf(s)} into a countdown`, () => {
      const n = replaceTag(s, 'div', n => { n.classList.add('se-countdown'); n.removeAttribute('href'); n.setAttribute('data-se-countdown', JSON.stringify(defaultCountdown())); });
      n.innerHTML = '';
    }, { devLabel: false });
  } else if (kind === 'popup') {
    const used = new Set([...getDoc(S.page).querySelectorAll('[data-se-popup]')].map(e => e.getAttribute('data-se-popup')));
    let n = 1; while (used.has('Pop-up ' + n)) n++;
    const name = 'Pop-up ' + n;
    act(`Turned ${nameOf(s)} into ${name}`, () => {
      s.setAttribute('data-se-popup', name);
      if (!s.querySelector('[data-se-close]')) {
        const b = getDoc(S.page).createElement('button'); b.setAttribute('data-se-close', ''); b.setAttribute('aria-label', 'Close'); b.textContent = '×';
        b.setAttribute('style', 'position: absolute; right: 8px; top: 8px; width: 36px; height: 36px; background: transparent; border: 0; color: inherit; font-size: 24px; cursor: pointer;');
        s.appendChild(b); assignIds(getDoc(S.page));
      }
    }, { devLabel: false });
    S.showPopup = name; renderFrame();
    toast('Now point a button at it: select a button, then Link → Pop-up.', 5000);
  } else if (kind === 'expand') {
    if (s.tagName === 'DETAILS') return;
    act(`Turned ${nameOf(s)} into an expanding row`, () => {
      const doc = getDoc(S.page), d = doc.createElement('details'), key = keyOf(s, false);
      d.className = 'se-expand' + (key ? ' ' + key : '');
      if (key) s.classList.remove(key);
      d.innerHTML = '<summary>Click to open</summary><div class="se-expand-body"></div>';
      s.replaceWith(d); d.querySelector('.se-expand-body').appendChild(s); assignIds(doc);
      S.sel = d.getAttribute('data-se-id');
    }, { devLabel: false });
  }
  S.tab = 'widget';
  setTimeout(() => { renderAll(); drawSelection(); }, 120);
}

/* ---------- Floating action bar ---------- */
function placeCtxBar() {
  const bar = $('#ctxBar'); if (!bar) return;
  const r = rEl(S.sel), s = sEl(S.sel);
  if (!r || !s || S.preview || S.editing || S.dragging) { bar.hidden = true; return; }
  const box = $('#frameBox'), er = r.getBoundingClientRect();
  if (er.bottom < 0 || er.top > fwin().innerHeight) { bar.hidden = true; return; }
  const lock = s.getAttribute('data-se-lock');
  bar.innerHTML = `<button data-cb="turn">Turn into ${icon(I.chev)}</button>
    ${s.tagName === 'A' ? `<button data-cb="link">${icon(I.link)}Link</button>` : ''}
    <button data-cb="motion">${icon(I.motion)}Motion</button>
    <span class="bsep"></span>
    <button data-cb="lock" class="${lock ? 'on' : ''}" title="${lock ? 'Unlock' : 'Lock'}">${icon(lock ? I.lock : I.unlock)}${lock ? 'Locked' : 'Lock'}</button>
    <button data-cb="dup" title="Duplicate">${icon(I.copy)}</button>
    <button data-cb="more" title="More" aria-label="More">${icon(I.more)}</button>`;
  bar.hidden = false;
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  let x = box.offsetLeft + er.left * S.z, y = box.offsetTop + er.bottom * S.z + 10;
  if (er.bottom * S.z + bh + 20 > box.offsetHeight) y = box.offsetTop + er.top * S.z - bh - 34;
  x = Math.max(box.offsetLeft, Math.min(x, box.offsetLeft + box.offsetWidth - bw));
  bar.style.left = x + 'px'; bar.style.top = Math.max(box.offsetTop, y) + 'px';
  $$('[data-cb]', bar).forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const k = b.dataset.cb;
    if (k === 'turn') showFlyout(b, turnItems(s));
    if (k === 'link') { S.tab = 'widget'; S.openSecs.add('widget'); showPanel('properties'); }
    if (k === 'motion') { S.openSecs.add('motion'); showPanel('properties'); renderAll(); setTimeout(() => { const m = $('[data-sec="motion"]'); if (m) m.scrollIntoView({ block: 'start' }); }, 50); }
    if (k === 'lock') toggleLock(s.getAttribute('data-se-id'));
    if (k === 'dup') duplicateSel();
    if (k === 'more') { const br = b.getBoundingClientRect(); showCtx(br.left, br.bottom + 4); }
  });
}
function turnItems(s) {
  const isA = s.tagName === 'A';
  return [
    isA ? ['Plain shape (stops being clickable)', () => turnInto('shape')] : ['Button', () => turnInto('button')],
    !s.classList.contains('se-countdown') && ['Countdown', () => turnInto('countdown')],
    !s.hasAttribute('data-se-popup') && ['Pop-up', () => turnInto('popup')],
    s.tagName !== 'DETAILS' && ['Expanding row', () => turnInto('expand')]
  ].filter(Boolean);
}

/* ---------- Locks, visibility, sharing ---------- */
function toggleLock(id, to) {
  const s = getDoc(S.page).querySelector(`[data-se-id="${id}"]`); if (!s) return;
  const cur = s.getAttribute('data-se-lock') || '';
  const next = to !== undefined ? to : (cur ? '' : 'all');
  act(next === 'all' ? `Locked ${nameOf(s)}` : next === 'position' ? `Locked the position of ${nameOf(s)}` : `Unlocked ${nameOf(s)}`, () => {
    if (next) s.setAttribute('data-se-lock', next); else s.removeAttribute('data-se-lock');
  }, { render: false, devLabel: false });
  const r = rEl(id); if (r) { if (next) r.setAttribute('data-se-lock', next); else r.removeAttribute('data-se-lock'); }
  drawSelection();
}
function toggleAttr(id, attr, label) {
  const s = getDoc(S.page).querySelector(`[data-se-id="${id}"]`); if (!s) return;
  const on = !s.hasAttribute(attr);
  act(`${on ? label[0] : label[1]} ${nameOf(s)}`, () => { if (on) s.setAttribute(attr, ''); else s.removeAttribute(attr); }, { render: false, devLabel: false, pageDirty: attr !== 'data-se-vanish' });
  const r = rEl(id); if (r) { if (on) r.setAttribute(attr, ''); else r.removeAttribute(attr); }
  drawSelection();
}
const toggleVanish = id => toggleAttr(id, 'data-se-vanish', ['Vanished', 'Brought back']);
const toggleHide = id => toggleAttr(id, 'data-se-hide', ['Hid', 'Unhid']);
function makeShared() {
  const s = sEl(S.sel); if (!s) return;
  if (s.hasAttribute('data-se-shared')) {
    const name = s.getAttribute('data-se-shared');
    modal('Stop sharing?', `<p>Every page keeps its own copy of ${esc(name)}, but changing one won’t change the others anymore.</p>`, [['Cancel'], ['Stop sharing', true, () => {
      act(`Stopped sharing ${name}`, () => { for (const p of allPages()) { const d = getDoc(p), e = d.querySelector(`[data-se-shared="${CSS.escape(name)}"]`); if (e) { e.removeAttribute('data-se-shared'); S.files.get(p).dirty = true; } } }, { where: 'Every page', devLabel: false });
    }]]);
    return;
  }
  const sig = el => el.tagName + '|' + (el.id || '') + '|' + [...el.classList].filter(c => !/^se-/.test(c)).sort().join('.');
  const mySig = sig(s), matches = [];
  for (const p of allPages()) { if (p === S.page) continue; const d = getDoc(p); const m = [...d.body.querySelectorAll(s.tagName)].find(e => sig(e) === mySig && !e.hasAttribute('data-se-shared')); if (m) matches.push(p); }
  modal('Make it shared', `<label class="field">Name<input class="inp" id="shName" value="${esc(nameOf(s).replace(/^.*?: /, '').replace(/[“”]/g, ''))}"></label>
    <p class="hint">${matches.length ? `Found the same ${esc(nameOf(s).split(':')[0].toLowerCase())} on ${matches.length} other page${matches.length === 1 ? '' : 's'}: ${matches.map(p => esc(pageName(p))).join(', ')}. They’ll all be replaced with this one, and from then on editing it anywhere changes it everywhere.` : 'It isn’t on any other page yet. Copy it onto another page and it stays linked.'}</p>`,
    [['Cancel'], ['Make shared', true, () => {
      const name = $('#shName').value.trim() || 'Shared part';
      act(`Made ${name} shared`, () => {
        s.setAttribute('data-se-shared', name);
        const html = sharedHtml(s);
        for (const p of matches) {
          const d = getDoc(p), m = [...d.body.querySelectorAll(s.tagName)].find(e => sig(e) === mySig && !e.hasAttribute('data-se-shared'));
          if (!m) continue;
          const t = d.createElement('template'); t.innerHTML = html; m.replaceWith(t.content.firstElementChild); assignIds(d);
          S.files.get(p).dirty = true;
        }
      }, { where: matches.length ? 'Every page with it' : pageName(S.page), devLabel: false });
    }]]);
}

/* ---------- Right-click menu & flyouts ---------- */
function onCanvasMenu(e) {
  e.preventDefault();
  const t = pickAt(e.clientX, e.clientY); if (!t) return;
  select(t.getAttribute('data-se-id'));
  const fr = $('#frameBox').getBoundingClientRect();
  showCtx(fr.left + e.clientX * S.z, fr.top + e.clientY * S.z);
}
function showCtx(x, y) {
  const s = sEl(S.sel); if (!s) return;
  const m = $('#ctxMenu'), lock = s.getAttribute('data-se-lock');
  const turn = turnItems(s);
  m.innerHTML = `<div class="sub-title">Turn into</div>${turn.map((t, i) => `<button data-ti="${i}">${esc(t[0])}</button>`).join('')}<hr>
    ${canEditText(rEl(S.sel)) ? '<button data-cmd="editText">Edit the words<kbd>↵</kbd></button>' : ''}
    <button data-cmd="addMotion">Add motion…</button>
    <button data-cmd="duplicate">Duplicate<kbd>⌘D</kbd></button>
    <hr><button data-cmd="front">Bring to front<kbd>⇧⌘]</kbd></button><button data-cmd="forward">Bring forward<kbd>⌘]</kbd></button>
    <button data-cmd="backward">Send backward<kbd>⌘[</kbd></button><button data-cmd="back">Send to back<kbd>⇧⌘[</kbd></button>
    <hr>${lock ? '<button data-cmd="unlock">Unlock</button>' : '<button data-cmd="lockAll">Lock<kbd>⌘L</kbd></button><button data-cmd="lockPos">Lock position only</button>'}
    <button data-cmd="vanish">${s.hasAttribute('data-se-vanish') ? 'Bring back' : 'Vanish while editing'}</button>
    <button data-cmd="hideSite">${s.hasAttribute('data-se-hide') ? 'Unhide' : 'Hide (also on the site)'}</button>
    <button data-cmd="share">${s.hasAttribute('data-se-shared') ? 'Stop sharing' : 'Make shared…'}</button>
    <button data-cmd="selectParent">Select what it’s inside</button>
    <hr><button data-cmd="delete">Delete<kbd>⌫</kbd></button>`;
  m.hidden = false;
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.min(x, innerWidth - w - 8) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  $$('[data-ti]', m).forEach(b => b.onclick = ev => { ev.stopPropagation(); hideCtx(); turn[+b.dataset.ti][1](); });
  bindCmds(m, hideCtx);
}
function hideCtx() { $('#ctxMenu').hidden = true; }
function showFlyout(anchor, items, dir) {
  const f = $('#flyout');
  f.innerHTML = items.map((it, i) => `<button data-fi="${i}">${it[2] ? icon(it[2]) : ''}${esc(it[0])}${it[3] ? `<kbd>${it[3]}</kbd>` : ''}</button>`).join('');
  f.hidden = false;
  const r = anchor.getBoundingClientRect();
  let x = dir === 'right' ? r.right + 4 : r.left, y = dir === 'right' ? r.top : dir === 'up' ? r.top - f.offsetHeight - 4 : r.bottom + 4;
  f.style.left = Math.min(x, innerWidth - f.offsetWidth - 8) + 'px'; f.style.top = Math.max(8, Math.min(y, innerHeight - f.offsetHeight - 8)) + 'px';
  $$('[data-fi]', f).forEach(b => b.onclick = ev => { ev.stopPropagation(); hideFlyout(); items[+b.dataset.fi][1](); });
}
function hideFlyout() { $('#flyout').hidden = true; }

/* ---------- Tools ---------- */
const TOOL_GROUPS = [
  [['select', 'Select', 'V', I.select], ['direct', 'Select group', 'A', I.direct]],
  [['rect', 'Rectangle', 'M', I.rect], ['ellipse', 'Ellipse', 'U', I.ellipse], ['line', 'Line', 'L', I.line]],
  [['text', 'Text', 'T', I.text]],
  [['image', 'Image', 'I', I.image], ['embedCode', 'Embed code…', '', I.embed]],
  [['pivot', 'Pivot point', 'O', I.pivot]],
  '-',
  [['hand', 'Hand', 'H', I.hand]],
  [['zoom', 'Zoom', 'Z', I.zoom]]
];
S.toolPick = {};
function renderTools() {
  const box = $('#tools');
  box.innerHTML = TOOL_GROUPS.map((g, gi) => {
    if (g === '-') return '<span class="tsep"></span>';
    const cur = g.find(t => t[0] === S.toolPick[gi]) || g.find(t => t[0] === S.tool) || g[0];
    const on = g.some(t => t[0] === S.tool);
    return `<button class="tool ${on ? 'on' : ''} ${g.length > 1 ? 'more' : ''}" data-tg="${gi}" data-tool="${cur[0]}" title="${cur[1]}${cur[2] ? ` (${cur[2]})` : ''}${g.length > 1 ? ' — right-click for more' : ''}" aria-label="${cur[1]}">${icon(cur[3])}</button>`;
  }).join('') + `<div class="chips" title="Fill and outline of the selection"><span class="bg" id="chipBg"></span><span class="fg" id="chipFg"></span></div>`;
  $$('[data-tg]', box).forEach(b => {
    const g = TOOL_GROUPS[+b.dataset.tg];
    const open = () => showFlyout(b, g.map(t => [t[1], () => { if (t[0] === 'embedCode') { embedModal(); return; } S.toolPick[+b.dataset.tg] = t[0]; setTool(t[0]); }, t[3], t[2]]), 'right');
    b.onclick = () => { if (b.dataset.tool === 'embedCode') { embedModal(); return; } setTool(b.dataset.tool); };
    b.oncontextmenu = e => { e.preventDefault(); if (g.length > 1) open(); };
    let t; b.onmousedown = () => { if (g.length > 1) t = setTimeout(open, 450); }; b.onmouseup = b.onmouseleave = () => clearTimeout(t);
  });
  const r = rEl(S.sel);
  if (r) { const cs = fwin().getComputedStyle(r); $('#chipFg').style.background = cs.backgroundColor; $('#chipBg').style.borderColor = cs.borderTopColor; }
  else { $('#chipFg').style.background = 'transparent'; }
}
function setTool(t) {
  if (t === 'pivot' && !S.sel) { toast('Select the part you want to animate first'); return; }
  S.tool = t;
  const gi = TOOL_GROUPS.findIndex(g => g !== '-' && g.some(x => x[0] === t)); if (gi >= 0) S.toolPick[gi] = t;
  renderTools(); setBodyToolClass();
  if (t === 'pivot' && !S.tlOpen) { S.tlOpen = true; renderTimeline(); drawSelection(); }
  renderOptbar();
}

/* ---------- Keyboard ---------- */
function onKey(e) {
  const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (S.editing) { if (k === 'escape') { e.preventDefault(); const r = rEl(S.editing); if (r) r.blur(); } return; }
  if (mod && k === 's') { e.preventDefault(); openDownload(); return; }
  if (typing) { if (k === 'escape') t.blur(); return; }
  if (k === 'escape') { if (closeModal()) return; hideCtx(); hideFlyout(); closeMenus(); if (S.tool !== 'select') setTool('select'); else select(null); return; }
  if (!$('#modal').hidden || S.preview && k !== 'p') return;
  if (k === ' ' && !S.spaceHand) { e.preventDefault(); S.spaceHand = true; setBodyToolClass(); $('#stage').classList.add('hand'); return; }
  if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomStep(1); return; }
  if (mod && k === '-') { e.preventDefault(); zoomStep(-1); return; }
  if (mod && k === '0') { e.preventDefault(); setZoom('fit'); return; }
  if (mod && k === '1') { e.preventDefault(); setZoom(1); return; }
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (mod && k === 'l') { e.preventDefault(); if (S.sel) toggleLock(S.sel); return; }
  if (mod && (k === ']' || k === '[')) { e.preventDefault(); if (S.sel) restack(k === ']' ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward')); return; }
  if (mod) return;
  if (k.startsWith('arrow') && S.sel) { e.preventDefault(); const n = e.shiftKey ? 10 : 1; nudge(k === 'arrowleft' ? -n : k === 'arrowright' ? n : 0, k === 'arrowup' ? -n : k === 'arrowdown' ? n : 0); return; }
  if (k === 'delete' || k === 'backspace') { if (S.sel) { e.preventDefault(); deleteSel(); } return; }
  if (k === 'enter' && S.sel) { e.preventDefault(); startTextEdit(S.sel); return; }
  const tools = { v: 'select', a: 'direct', m: 'rect', u: 'ellipse', l: 'line', t: 'text', i: 'image', o: 'pivot', h: 'hand', z: 'zoom' };
  if (tools[k]) { setTool(tools[k]); return; }
  if (k === 'p') togglePreview();
}
function onKeyUp(e) { if (e.key === ' ') { S.spaceHand = false; setBodyToolClass(); $('#stage').classList.remove('hand'); } }
document.addEventListener('keydown', onKey);
document.addEventListener('keyup', onKeyUp);
$('#stage').addEventListener('mousedown', e => { if (e.target === $('#stage') || e.target === $('#frameBox')) { if (S.spaceHand || S.tool === 'hand') startPan(e); else select(null); } });
$('#stage').addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
