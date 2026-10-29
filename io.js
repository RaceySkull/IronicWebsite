/* Site Editor v2 — modal, timeline, media, download, boot */
'use strict';

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
  act(label, () => { if (c.steps.length || c.pivot !== '50% 50%') s.setAttribute('data-se-timeline', json); else s.removeAttribute('data-se-timeline'); }, { render: false, devLabel: false });
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
    $('#tlClose').onclick = () => { S.tlOpen = false; renderTimeline(); drawSelection(); setTimeout(layoutFrame, 30); };
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
  $('#tlClose').onclick = () => { stopPlayback(); S.tlOpen = false; renderTimeline(); drawSelection(); renderPanels(); setTimeout(layoutFrame, 30); };
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
function usesWidgets(doc) { return !!doc.querySelector('.se-countdown,[data-se-motion],[data-se-timeline],[data-se-hide],[data-se-popup],[data-se-open],details[data-se-doc],[data-se-tabs]'); }
const RUNTIME_FILE = '/* Site Editor widgets: countdowns, motion effects and timeline animations.\n   Added by Site Editor. Keep it next to your pages; the editor updates it for you. */\n(' + seRuntime.toString() + ')();\n';
function exportPage(p) {
  const doc = S.docs.get(p);
  if (!doc) return fileText(p);
  const clone = doc.cloneNode(true);
  if (usesWidgets(clone)) {
    if (!clone.querySelector('link[href*="se-widgets.css"]')) { const l = clone.createElement('link'); l.rel = 'stylesheet'; l.href = relPath(p, 'se-widgets.css'); clone.head.appendChild(l); }
    if (!clone.querySelector('script[src*="se-widgets.js"]')) { const sc = clone.createElement('script'); sc.src = relPath(p, 'se-widgets.js'); sc.defer = true; clone.body.appendChild(sc); }
  }
  for (const el of clone.querySelectorAll('[data-se-force]')) el.removeAttribute('data-se-force');
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
  updateCount(); renderAll(); scheduleSave();
  toast('Downloaded. Upload what’s inside the ZIP to your site host to go live.', 5000);
}
function openAnother() {
  const go = () => { $('#app').hidden = true; $('#welcome').hidden = false; $('#welcomeError').hidden = true; checkResume(); };
  if (!S.changes.length) return go();
  modal('Open another site?', `<p>You have ${S.changes.length} change${S.changes.length === 1 ? '' : 's'} that haven’t been downloaded. Opening another site replaces this one in the browser.</p>`,
    [['Keep editing'], ['Download first', false, () => { setTimeout(openDownload, 50); }], ['Open another', true, go]]);
}


function embedModal() {
  modal('Embed code', `<label class="field">Paste the embed code (a form, map, video or widget)<textarea class="inp mono" id="emNew" rows="8" placeholder="<iframe …> or <div …><script …>"></textarea></label><p class="hint">It shows as a placeholder while you edit and works in Preview and on your site.</p>`,
    [['Cancel'], ['Add it', true, () => { const v = $('#emNew').value.trim(); if (!v) { toast('Paste some embed code first'); return false; } insertCenter('embed', v); }]]);
}
function openAnother() {
  const go = () => { $('#app').hidden = true; $('#welcome').hidden = false; $('#welcomeError').hidden = true; checkResume(); };
  if (!S.changes.length) return go();
  modal('Open another site?', `<p>You have ${S.changes.length} change${S.changes.length === 1 ? '' : 's'} that haven’t been downloaded. Opening another site replaces this one in the browser.</p>`,
    [['Keep editing'], ['Download first', false, () => { setTimeout(openDownload, 50); }], ['Open another', true, go]]);
}
function openApp(page) {
  $('#welcome').hidden = true; $('#app').hidden = false;
  S.page = page; if (!S.tabs.includes(page)) S.tabs.push(page);
  S.preview = false; S.sel = null; S.tool = 'select'; S.device = 'desktop'; S.state = 'normal';
  renderDock(); renderTools();
  renderAll(); layoutFrame(); renderFrame(false);
  saveNow();
}
async function checkResume() {
  try {
    const p = await DB.get('project'), b = $('#resumeBtn');
    if (p && p.files && p.files.length) { b.hidden = false; b.textContent = `Continue editing ${p.site || 'your site'}${p.changes && p.changes.length ? ` (${p.changes.length} changes not downloaded)` : ''}`; b.onclick = resumeProject; }
    else b.hidden = true;
  } catch (e) { /* storage blocked */ }
}
(function boot() {
  let t = 'dark'; try { t = localStorage.getItem('se-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch (e) { /* ignore */ }
  document.documentElement.dataset.theme = t;
  checkResume();
})();
