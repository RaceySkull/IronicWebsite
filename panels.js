/* Site Editor v2 — panels
   The panel dock (tabbed groups you can drag, collapse, close and save),
   the menus, the option bar, and every panel: Properties, Character,
   Layers, Pages, History, Team Kit and Data. Plus the timeline. */
'use strict';

/* ============ Dock ============ */
const PANELS = {
  properties: { title: 'Properties', icon: I.props, render: renderProperties },
  character: { title: 'Character', icon: I.char, render: renderCharacter },
  layers: { title: 'Layers', icon: I.layers, render: renderLayers },
  pages: { title: 'Pages', icon: I.pages, render: renderPagesPanel },
  history: { title: 'History', icon: I.history, render: renderHistory },
  kit: { title: 'Team Kit', icon: I.kit, render: renderTeamKit },
  data: { title: 'Data', icon: I.data, render: renderData }
};
const ESSENTIALS = { groups: [
  { tabs: ['properties', 'character'], active: 'properties', collapsed: false, w: 3 },
  { tabs: ['layers', 'pages'], active: 'layers', collapsed: false, w: 2 },
  { tabs: ['history', 'kit', 'data'], active: 'kit', collapsed: true, w: 2 }
], closed: [], compact: false };
S.ws = (() => { try { const w = JSON.parse(localStorage.getItem('se-ws')); if (w && w.groups) return w; } catch (e) { /* none */ } return JSON.parse(JSON.stringify(ESSENTIALS)); })();
function saveWs() { try { localStorage.setItem('se-ws', JSON.stringify(S.ws)); } catch (e) { /* private mode */ } }
function renderDock() {
  const dock = $('#dock');
  const open = Object.keys(PANELS).filter(p => !S.ws.closed.includes(p));
  dock.classList.toggle('compact', !!S.ws.compact);
  dock.innerHTML = `<div class="dock-icons">${open.map(p => `<button data-dicon="${p}" title="${PANELS[p].title}" aria-label="${PANELS[p].title}">${icon(PANELS[p].icon)}</button>`).join('')}</div>
    <div class="dock-col">${S.ws.groups.map((g, gi) => `
      <section class="pgroup ${g.collapsed ? 'collapsed' : ''}" style="flex:${g.collapsed ? 'none' : (g.w || 1) + ' 1 0'}" data-g="${gi}">
        <div class="ptabs" data-gtabs="${gi}">
          ${g.tabs.map(p => `<button class="ptab ${p === g.active ? 'on' : ''}" draggable="true" data-ptab="${p}">${PANELS[p].title}</button>`).join('')}
          <span class="pfill" data-gcollapse="${gi}"></span>
          <button class="pctl" data-gcollapse="${gi}" title="${g.collapsed ? 'Expand' : 'Collapse'}" aria-label="${g.collapsed ? 'Expand' : 'Collapse'}">${icon(g.collapsed ? I.down : I.up)}</button>
          <button class="pctl" data-pclose="${g.active}" title="Close ${PANELS[g.active].title}" aria-label="Close panel">${icon(I.x)}</button>
        </div>
        <div class="pbody" id="pb-${g.active}"></div>
      </section>`).join('')}
      <div class="dock-drop" data-newgroup title="Drop a panel tab here to make a new group"></div>
    </div>`;
  $$('[data-ptab]', dock).forEach(b => {
    b.onclick = () => { const g = S.ws.groups.find(x => x.tabs.includes(b.dataset.ptab)); g.active = b.dataset.ptab; g.collapsed = false; saveWs(); renderDock(); renderPanels(); };
    b.ondragstart = e => { e.dataTransfer.setData('text/se-panel', b.dataset.ptab); e.dataTransfer.effectAllowed = 'move'; };
  });
  const dropOn = (el, fn) => {
    el.ondragover = e => { if ([...e.dataTransfer.types].includes('text/se-panel')) { e.preventDefault(); el.classList.add('drop-zone'); } };
    el.ondragleave = () => el.classList.remove('drop-zone');
    el.ondrop = e => { e.preventDefault(); el.classList.remove('drop-zone'); const p = e.dataTransfer.getData('text/se-panel'); if (p) fn(p); };
  };
  const pull = p => { for (const g of S.ws.groups) { g.tabs = g.tabs.filter(t => t !== p); if (g.active === p) g.active = g.tabs[0]; } S.ws.groups = S.ws.groups.filter(g => g.tabs.length); };
  $$('[data-gtabs]', dock).forEach(el => dropOn(el, p => { const target = S.ws.groups[+el.dataset.gtabs]; pull(p); target.tabs.push(p); target.active = p; target.collapsed = false; saveWs(); renderDock(); renderPanels(); }));
  dropOn($('[data-newgroup]', dock), p => { pull(p); S.ws.groups.push({ tabs: [p], active: p, collapsed: false, w: 2 }); saveWs(); renderDock(); renderPanels(); });
  $$('[data-gcollapse]', dock).forEach(b => b.onclick = () => { const g = S.ws.groups[+b.dataset.gcollapse]; g.collapsed = !g.collapsed; saveWs(); renderDock(); renderPanels(); });
  $$('[data-pclose]', dock).forEach(b => b.onclick = () => { const p = b.dataset.pclose; pull(p); S.ws.closed.push(p); saveWs(); renderDock(); renderPanels(); toast(`${PANELS[p].title} closed. Bring it back from the Window menu.`); });
  $$('[data-dicon]', dock).forEach(b => b.onclick = () => { if (S.ws.compact) openFlyPanel(b.dataset.dicon, b); else showPanel(b.dataset.dicon); });
}
function showPanel(p) {
  if (S.ws.closed.includes(p)) { S.ws.closed = S.ws.closed.filter(x => x !== p); (S.ws.groups[0] || S.ws.groups.push({ tabs: [], w: 2 }) && S.ws.groups[0]).tabs.push(p); }
  const g = S.ws.groups.find(x => x.tabs.includes(p)); if (!g) return;
  g.active = p; g.collapsed = false; saveWs();
  if (S.ws.compact) { const b = $(`[data-dicon="${p}"]`); if (b) openFlyPanel(p, b); return; }
  renderDock(); renderPanels();
}
let flyPanel = null;
function openFlyPanel(p, anchor) {
  closeFlyPanel();
  flyPanel = document.createElement('div'); flyPanel.className = 'flyout-panel'; flyPanel.dataset.p = p;
  flyPanel.innerHTML = `<div class="ptabs"><span class="ptab on">${PANELS[p].title}</span><span class="pfill"></span><button class="pctl" aria-label="Close">${icon(I.x)}</button></div><div class="pbody" id="pb-${p}"></div>`;
  document.body.appendChild(flyPanel);
  const r = anchor.getBoundingClientRect();
  flyPanel.style.left = (r.left - 304) + 'px'; flyPanel.style.top = Math.min(r.top, innerHeight - 320) + 'px';
  $('.pctl', flyPanel).onclick = closeFlyPanel;
  PANELS[p].render($('.pbody', flyPanel));
}
function closeFlyPanel() { if (flyPanel) { flyPanel.remove(); flyPanel = null; } }
document.addEventListener('mousedown', e => { if (flyPanel && !flyPanel.contains(e.target) && !e.target.closest('.dock-icons')) closeFlyPanel(); });
function renderPanels() {
  for (const g of S.ws.groups) { if (g.collapsed || S.ws.compact) continue; const box = $('#pb-' + g.active); if (box) PANELS[g.active].render(box); }
  if (flyPanel) PANELS[flyPanel.dataset.p].render($('.pbody', flyPanel));
}
function renderAll() {
  if (!S.page) return;
  if (!$('#dock').children.length) renderDock();
  renderPanels(); renderTabs(); renderOptbar(); renderTools(); renderTimeline(); updateCount(); renderMenus();
  $$('#deviceSeg button').forEach(b => b.classList.toggle('on', b.dataset.dev === S.device));
}

/* ============ Menus ============ */
function menuDefs() {
  const s = sEl(S.sel);
  const panelItems = Object.keys(PANELS).map(p => [`${!S.ws.closed.includes(p) ? '✓ ' : '\u2003'}${PANELS[p].title}`, () => { if (S.ws.closed.includes(p)) showPanel(p); else { for (const g of S.ws.groups) { g.tabs = g.tabs.filter(t => t !== p); if (g.active === p) g.active = g.tabs[0]; } S.ws.groups = S.ws.groups.filter(g => g.tabs.length); S.ws.closed.push(p); saveWs(); renderDock(); renderPanels(); } }]);
  return {
    File: [['Download…', openDownload, '⌘S'], ['New page…', newPage], '-', ['Open another site…', openAnother]],
    Edit: [['Undo', undo, '⌘Z', !S.undo.length], ['Redo', redo, '⇧⌘Z', !S.redo.length], '-', ['Duplicate', duplicateSel, '⌘D', !s], ['Delete', deleteSel, '⌫', !s], '-',
      [s && s.getAttribute('data-se-lock') ? 'Unlock' : 'Lock', () => toggleLock(S.sel), '⌘L', !s], [s && s.hasAttribute('data-se-shared') ? 'Stop sharing…' : 'Make shared…', makeShared, '', !s]],
    Insert: [['Rectangle', () => insertCenter('rect'), 'M'], ['Ellipse', () => insertCenter('ellipse'), 'U'], ['Line', () => insertCenter('line'), 'L'], ['Text', () => insertCenter('text'), 'T'],
      ['Image…', () => pickMedia('image', p => insertCenter('image', p)), 'I'], '-', ['Countdown', () => insertCenter('countdown')], ['Expanding row', () => insertCenter('expand')],
      ['Section tabs', () => insertCenter('tabs')], ['Embed code…', embedModal], '-', ['New page…', newPage]],
    Layer: [['Bring to front', () => restack('front'), '⇧⌘]', !s], ['Bring forward', () => restack('forward'), '⌘]', !s], ['Send backward', () => restack('backward'), '⌘[', !s], ['Send to back', () => restack('back'), '⇧⌘[', !s], '-',
      ['Group it', groupSel, '', !s], ['Select what it’s inside', () => runCmd('selectParent'), '', !s], '-', ['Free-place everything on this page', freeWholePage]],
    View: [['Desktop', () => setDevice('desktop')], ['Tablet', () => setDevice('tablet')], ['Phone', () => setDevice('phone')], '-',
      ['Zoom in', () => zoomStep(1), '⌘+'], ['Zoom out', () => zoomStep(-1), '⌘−'], ['Fit to window', () => setZoom('fit'), '⌘0'], ['Actual size', () => setZoom(1), '⌘1'], '-',
      ['Preview the page', togglePreview, 'P'], ['Switch light / dark', () => runCmd('toggleTheme')]],
    Window: [...panelItems, '-', [`${S.tlOpen ? '✓ ' : '\u2003'}Timeline`, () => runCmd('toggleTimeline')], ['Media…', () => openMedia()], '-',
      [`${S.ws.compact ? '✓ ' : '\u2003'}Compact panels (icons only)`, () => { S.ws.compact = !S.ws.compact; saveWs(); renderDock(); renderPanels(); }],
      ['Save this panel layout', () => { try { localStorage.setItem('se-ws-saved', JSON.stringify(S.ws)); toast('Panel layout saved'); } catch (e) { /* ignore */ } }],
      ['Use my saved layout', () => { try { const w = JSON.parse(localStorage.getItem('se-ws-saved')); if (w) { S.ws = w; saveWs(); renderDock(); renderPanels(); } else toast('Save a layout first'); } catch (e) { /* ignore */ } }],
      ['Reset to Essentials', () => { S.ws = JSON.parse(JSON.stringify(ESSENTIALS)); saveWs(); renderDock(); renderPanels(); }]]
  };
}
function renderMenus() {
  const box = $('#menus'), open = $('.menu.open', box);
  const openName = open && open.dataset.menu;
  const defs = menuDefs();
  box.innerHTML = Object.entries(defs).map(([name, items]) => `<div class="menu ${name === openName ? 'open' : ''}" data-menu="${name}"><button class="menu-btn">${name}</button><div class="menu-pop">${items.map((it, i) => it === '-' ? '<hr>' : `<button data-mi="${i}" ${it[3] ? 'disabled' : ''}>${esc(it[0])}${it[2] ? `<kbd>${it[2]}</kbd>` : ''}</button>`).join('')}</div></div>`).join('');
  $$('.menu', box).forEach(m => {
    const items = defs[m.dataset.menu];
    $('.menu-btn', m).onclick = e => { e.stopPropagation(); const was = m.classList.contains('open'); closeMenus(); if (!was) m.classList.add('open'); };
    m.onmouseenter = () => { if ($('.menu.open', box) && !m.classList.contains('open')) { closeMenus(); m.classList.add('open'); } };
    $$('[data-mi]', m).forEach(b => b.onclick = e => { e.stopPropagation(); closeMenus(); items[+b.dataset.mi][1](); });
  });
}
function closeMenus() { $$('.menu.open').forEach(m => m.classList.remove('open')); }
document.addEventListener('mousedown', e => { if (!e.target.closest('.menu')) closeMenus(); if (!e.target.closest('#ctxMenu')) hideCtx(); if (!e.target.closest('#flyout') && !e.target.closest('[data-tg]') && !e.target.closest('[data-cb]') && !e.target.closest('#zoomBtn')) hideFlyout(); });
function bindCmds(root, after) { $$('[data-cmd]', root).forEach(b => b.onclick = e => { e.stopPropagation(); if (after) after(); closeMenus(); runCmd(b.dataset.cmd); }); }
const CMD = {
  download: () => openDownload(), undo, redo, duplicate: duplicateSel, delete: deleteSel,
  viewDesktop: () => setDevice('desktop'), viewTablet: () => setDevice('tablet'), viewPhone: () => setDevice('phone'),
  preview: () => togglePreview(), toggleTheme: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
  toggleTimeline: () => { S.tlOpen = !S.tlOpen; renderTimeline(); drawSelection(); renderMenus(); setTimeout(layoutFrame, 30); },
  editText: () => startTextEdit(S.sel), addMotion: () => { S.openSecs.add('motion'); showPanel('properties'); },
  front: () => restack('front'), forward: () => restack('forward'), backward: () => restack('backward'), back: () => restack('back'),
  lockAll: () => toggleLock(S.sel, 'all'), lockPos: () => toggleLock(S.sel, 'position'), unlock: () => toggleLock(S.sel, ''),
  vanish: () => toggleVanish(S.sel), hideSite: () => toggleHide(S.sel), share: makeShared,
  selectParent: () => { const s = sEl(S.sel); if (s && s.parentElement && s.parentElement.tagName !== 'BODY') select(s.parentElement.getAttribute('data-se-id')); }
};
function runCmd(c) { if (CMD[c]) CMD[c](); }
bindCmds($('.menubar'));
function setDevice(dev) {
  S.device = dev;
  $$('#deviceSeg button').forEach(b => b.classList.toggle('on', b.dataset.dev === dev));
  layoutFrame(); renderAll();
  if (dev !== 'desktop') toast(dev === 'phone' ? 'Phone view: changes you make now only apply to phones.' : 'Tablet view: changes you make now apply to tablets and phones.', 3500);
}
function togglePreview() {
  if (S.editing) finishTextEdit();
  S.preview = !S.preview;
  $('#previewBtn').textContent = S.preview ? 'Back to editing' : 'Preview';
  stopPlayback(); renderOptbar(); renderTimeline(); renderFrame(false); placeCtxBar();
}
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('se-theme', t); } catch (e) { /* ignore */ } setTimeout(drawRulers, 30); }

/* ============ Option bar ============ */
function renderOptbar() {
  const bar = $('#optbar'); if (!S.page) return;
  if (S.preview) { bar.innerHTML = '<span class="chip">Preview</span><span>This is how visitors see the page. Links between your pages work here.</span><span class="spacer"></span><button class="btn btn-primary" data-cmd="preview">Back to editing</button>'; bindCmds(bar); return; }
  const hints = { rect: 'Click where the rectangle should go.', ellipse: 'Click where the ellipse should go.', line: 'Click where the line should start.', text: 'Click where the new text should go.', image: 'Click where the image should go, then pick it.', pivot: 'Click on the selected part right where it should bend or turn.', hand: 'Drag to move around the page. Hold Space to do this with any tool.', zoom: 'Click to zoom in. Alt-click to zoom out.', direct: 'Clicks pick the whole group instead of the piece inside it.' };
  const devNote = S.device !== 'desktop' ? `<span class="chip" style="background:var(--sel);color:var(--sel-text)">${S.device === 'phone' ? 'Editing for phones' : 'Editing for tablets and phones'}</span>` : '';
  const s = sEl(S.sel);
  if (!s || hints[S.tool]) { bar.innerHTML = `${devNote}<span>${hints[S.tool] || 'Click something to select it. Drag to move it, double-click text to type, right-click for more.'}</span>`; return; }
  const r = rEl(S.sel), cs = r ? fwin().getComputedStyle(r) : null, free = r && isFree(movableOf(r));
  const num = (k, label, v) => `<label title="${label}">${k}<input class="inp num" data-ob="${k}" style="width:64px" value="${v}"></label>`;
  let geo = '';
  if (r && free) { const m = movableOf(r), mcs = fwin().getComputedStyle(m); geo = `${num('X', 'Left', Math.round(parseFloat(mcs.left)))}${num('Y', 'Top', Math.round(parseFloat(mcs.top)))}${num('W', 'Width', Math.round(m.getBoundingClientRect().width))}${num('H', 'Height', Math.round(m.getBoundingClientRect().height))}<span class="vsep"></span>`; }
  const txt = r && textish(r);
  const bold = cs && parseInt(cs.fontWeight, 10) >= 600;
  bar.innerHTML = `${devNote}<span class="chip">${esc(nameOf(s))}</span><span class="vsep"></span>${geo}
    ${txt ? `<label>Size<input class="inp num" id="obSize" style="width:56px" value="${cs ? Math.round(parseFloat(cs.fontSize)) : ''}"></label>
    <button class="icon-btn" id="obBold" title="Bold" aria-pressed="${bold}" style="${bold ? 'background:var(--accent);color:var(--on-accent);border-color:var(--accent)' : ''};font-weight:700">B</button>` : ''}
    ${!free && r && S.device === 'desktop' ? '<span>Drag it to free-place it.</span>' : ''}
    <span class="spacer"></span>${s.getAttribute('data-se-lock') ? '<span>Locked</span>' : ''}`;
  $$('[data-ob]', bar).forEach(inp => inp.onchange = () => {
    const m = movableOf(r), ms = sEl(m.getAttribute('data-se-id')), v = parseFloat(inp.value); if (isNaN(v)) return;
    const prop = { X: 'left', Y: 'top', W: 'width', H: 'height' }[inp.dataset.ob];
    act(`Changed the ${prop === 'left' ? 'position' : prop === 'top' ? 'position' : prop} of ${nameOf(ms)}`, () => applyOwn(ms, { [prop]: Math.round(v) + 'px' }), { render: false, cssPath: SE_CSS });
  });
  const sz = $('#obSize'); if (sz) sz.onchange = () => setStyle('font-size', sz.value, 'text size');
  const b = $('#obBold'); if (b) b.onclick = () => setStyle('font-weight', bold ? '400' : '700', 'boldness');
}

/* ============ Shared builders ============ */
const seg = (name, opts, val) => `<div class="seg full" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(val) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const tog = (name, on, label) => `<label class="toggle">${label}<input type="checkbox" data-tog="${name}" ${on ? 'checked' : ''}><span class="sw"></span></label>`;
function bindSeg(root, name, fn) { const s = $(`[data-seg="${name}"]`, root); if (s) $$('button', s).forEach(b => b.onclick = () => fn(b.dataset.v)); }
function bindTog(root, name, fn) { const t = $(`[data-tog="${name}"]`, root); if (t) t.onchange = () => fn(t.checked); }
function sec(id, title, html) {
  return `<div class="sec ${S.openSecs.has(id) ? 'open' : ''}" data-sec="${id}"><button class="sec-h" data-sech="${id}">${icon(I.chev)}${title}</button><div class="sec-b">${html}</div></div>`;
}
function bindSecs(root) { $$('[data-sech]', root).forEach(b => b.onclick = () => { const id = b.dataset.sech; if (S.openSecs.has(id)) S.openSecs.delete(id); else S.openSecs.add(id); b.parentElement.classList.toggle('open'); }); }
function swatchRow(prop, label, current, allowNone) {
  const cur = rgbToHex(current);
  const sw = teamColors().map(c => `<button class="swatch ${resolvedHex(c.value) === cur ? 'on' : ''}" title="${esc(c.name)}" aria-label="${esc(c.name)}" style="background:${esc(c.value)}" data-color="var(${c.prop})" data-prop="${prop}" data-label="${label}"></button>`).join('');
  const none = allowNone ? `<button class="swatch ${cur === 'transparent' ? 'on' : ''}" title="None" aria-label="None" data-color="transparent" data-prop="${prop}" data-label="${label}" style="background:linear-gradient(135deg,transparent 45%,#E5484D 45%,#E5484D 55%,transparent 55%),var(--input)"></button>` : '';
  return `<div class="swatches">${none}${sw}<label class="swatch add" title="Pick any color" style="display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative">+<input type="color" value="${cur === 'transparent' ? '#ffffff' : cur}" data-prop="${prop}" data-label="${label}" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>`;
}
function bindSwatches(root, fn) {
  $$('.swatch[data-color]', root).forEach(b => b.onclick = () => fn(b.dataset.prop, b.dataset.color, b.dataset.label));
  $$('input[type=color][data-prop]', root).forEach(i => i.onchange = () => fn(i.dataset.prop, i.value.toUpperCase(), i.dataset.label));
}

/* ============ Properties panel ============ */
function renderProperties(box) {
  const s = sEl(S.sel);
  if (!s) {
    const doc = getDoc(S.page), desc = doc.querySelector('meta[name="description"]');
    box.innerHTML = `<p class="panel-note">Click something on the page to change it. Drag to move it anywhere. Right-click for more.</p>
      ${sec('page', 'This page', `<label class="field">Name in the browser tab<input class="inp" id="pgTitle" value="${esc(doc.title)}"></label>
      <label class="field">Search engine summary<textarea class="inp" id="pgDesc" rows="3">${esc(desc ? desc.getAttribute('content') : '')}</textarea></label>`)}
      ${sec('free', 'Free placement', `<p class="hint">Things you drag become free-placed on their own. To free-place everything on this page at once:</p><button class="btn" id="pgFree">Free-place everything on this page</button>`)}`;
    if (!S.openSecs.has('page')) S.openSecs.add('page');
    bindSecs(box);
    $('#pgTitle', box).onchange = e => act('Changed the page name', () => { doc.title = e.target.value; }, { render: false, devLabel: false });
    $('#pgDesc', box).onchange = e => act('Changed the search engine summary', () => {
      let m = doc.querySelector('meta[name="description"]');
      if (!m) { m = doc.createElement('meta'); m.name = 'description'; doc.head.appendChild(m); }
      m.setAttribute('content', e.target.value);
    }, { render: false, devLabel: false });
    $('#pgFree', box).onclick = freeWholePage;
    return;
  }
  const r = rEl(S.sel), cs = r ? fwin().getComputedStyle(r) : null, g = k => cs ? cs.getPropertyValue(k) : '';
  const cls = mainClass(s);
  const widget = widgetSection(s);
  box.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;padding:12px">
      <label class="field">Name<input class="inp" id="pName" value="${esc(nameOf(s))}"></label>
      ${cls ? `<div class="field">Apply changes to${seg('scope', [['one', 'Just this one'], ['all', 'Every one like this']], S.scope)}</div>` : ''}
    </div>
    ${widget ? sec('widget', widget.title, widget.html) : ''}
    ${sec('pos', 'Position & size', posSection(s, r))}
    ${sec('look', 'Look', lookSection(s, r, g))}
    ${sec('motion', 'Motion', motionSection(s))}
    ${sec('layer', 'Layer', layerSection(s))}`;
  bindSecs(box);
  $('#pName', box).onchange = e => act('Renamed a layer', () => { if (e.target.value.trim()) s.setAttribute('data-se-name', e.target.value.trim()); else s.removeAttribute('data-se-name'); }, { render: false, devLabel: false, pageDirty: true });
  bindSeg(box, 'scope', v => { S.scope = v; renderPanels(); });
  if (widget) widget.bind($('[data-sec="widget"] .sec-b', box));
  bindPos($('[data-sec="pos"] .sec-b', box), s, r);
  bindLook($('[data-sec="look"] .sec-b', box), s, r);
  bindMotion($('[data-sec="motion"] .sec-b', box), s);
  bindLayer($('[data-sec="layer"] .sec-b', box), s);
}

/* Position & size, pinning, show per screen size */
function posSection(s, r) {
  if (!r) return '<p class="hint">Loading…</p>';
  const m = movableOf(r), mcs = fwin().getComputedStyle(m), free = isFree(m), mr = m.getBoundingClientRect();
  const pinned = mcs.position === 'fixed';
  const pinMode = pinned ? (parseFloat(mcs.bottom) === 0 && mcs.top === 'auto' || mcs.bottom === '0px' && Math.abs(mr.bottom - fwin().innerHeight) < 2 ? 'bottom' : parseFloat(mcs.top) === 0 ? 'top' : 'here') : 'none';
  const hiddenHere = mcs.display === 'none';
  const devName = { desktop: 'desktop', tablet: 'tablets', phone: 'phones' }[S.device];
  return `${m !== r ? `<p class="hint">Moves together with ${esc(nameOf(sEl(m.getAttribute('data-se-id'))))}, since it’s part of that text.</p>` : ''}
    ${free ? `<div class="grid2">
      <label class="field">X<input class="inp num" data-geo="left" value="${Math.round(parseFloat(mcs.left)) || 0}"></label>
      <label class="field">Y<input class="inp num" data-geo="top" value="${Math.round(parseFloat(mcs.top)) || 0}"></label>
      <label class="field">Width<input class="inp num" data-geo="width" value="${Math.round(mr.width)}"></label>
      <label class="field">Height<input class="inp num" data-geo="height" value="${Math.round(mr.height)}"></label></div>`
      : `<p class="hint">It still sits in the page’s normal flow. Drag it, or:</p><button class="btn" id="posFree" ${S.device !== 'desktop' ? 'disabled' : ''}>Free-place it</button>`}
    ${s.hasAttribute('data-se-popup') ? '' : `<div class="field">Stay on screen when scrolling${seg('pin', [['none', 'No'], ['top', 'Top'], ['bottom', 'Bottom'], ['here', 'Where it is']], pinMode)}</div>`}
    ${pinned && !s.hasAttribute('data-se-popup') ? tog('stretch', mcs.left === '0px' && (mcs.right === '0px' || Math.abs(mr.width - fwin().innerWidth) < 2), 'Stretch across the screen') : ''}
    ${tog('showDev', !hiddenHere, `Show on ${devName}`)}
    ${S.device !== 'desktop' && m.children.length ? `<button class="btn" id="posStack">Stack what’s inside for ${devName}</button><p class="hint" style="margin-top:-6px">Lines up everything inside it top to bottom, full width, just for this screen size.</p>` : ''}`;
}
function bindPos(box, s, r) {
  if (!r || !box) return;
  const m = movableOf(r), ms = sEl(m.getAttribute('data-se-id'));
  $$('[data-geo]', box).forEach(i => i.onchange = () => {
    const v = parseFloat(i.value); if (isNaN(v)) return;
    act(`Changed the ${i.dataset.geo === 'left' || i.dataset.geo === 'top' ? 'position' : i.dataset.geo} of ${nameOf(ms)}`, () => applyOwn(ms, { [i.dataset.geo]: Math.round(v) + 'px' }), { render: false, cssPath: SE_CSS });
  });
  const pf = $('#posFree', box); if (pf) pf.onclick = () => { const plan = planFreeze(m); act(`Free-placed ${nameOf(ms)}`, () => applyPlan(plan) || true, { devLabel: false }); };
  bindSeg(box, 'pin', v => {
    const mr = m.getBoundingClientRect();
    const props = v === 'none' ? { position: 'absolute', top: Math.round(mr.top + fwin().scrollY - m.parentElement.getBoundingClientRect().top - fwin().scrollY) + 'px', bottom: 'auto', right: 'auto', 'z-index': '' }
      : v === 'top' ? { position: 'fixed', top: '0px', bottom: 'auto', 'z-index': '500' }
      : v === 'bottom' ? { position: 'fixed', top: 'auto', bottom: '0px', 'z-index': '500' }
      : { position: 'fixed', top: Math.round(mr.top) + 'px', left: Math.round(mr.left) + 'px', bottom: 'auto', 'z-index': '500' };
    act(v === 'none' ? `Unpinned ${nameOf(ms)}` : `Pinned ${nameOf(ms)} to the screen`, () => applyOwn(ms, props), { render: false, cssPath: SE_CSS });
  });
  bindTog(box, 'stretch', on => act(on ? `Stretched ${nameOf(ms)} across the screen` : `Stopped stretching ${nameOf(ms)}`, () => applyOwn(ms, on ? { left: '0px', right: '0px', width: 'auto' } : { right: 'auto', width: Math.round(m.getBoundingClientRect().width) + 'px' }), { render: false, cssPath: SE_CSS }));
  bindTog(box, 'showDev', on => {
    const key = keyOf(ms, false), sel = key ? selOf(key) : null;
    const inherited = sel && getSty(sel, 'display') === 'none' && !(S.sty[S.device][sel] || {}).display;
    act(on ? `Showed ${nameOf(ms)}` : `Hid ${nameOf(ms)}`, () => applyOwn(ms, { display: on ? (inherited ? 'block' : '') : 'none' }), { render: false, cssPath: SE_CSS });
  });
  const st = $('#posStack', box); if (st) st.onclick = () => stackForDevice(m);
}
function stackForDevice(m) {
  const kids = [...m.children].filter(c => c.hasAttribute('data-se-id') && isFree(c) && fwin().getComputedStyle(c).position !== 'fixed');
  if (!kids.length) { toast('Nothing free-placed inside it to stack'); return; }
  kids.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  const gap = 16, pad = 16; let y = pad;
  const plan = [];
  for (const c of kids) {
    const h = textish(c) ? 'auto' : Math.round(Math.min(c.getBoundingClientRect().height, 480)) + 'px';
    plan.push([c, { left: pad + 'px', top: y + 'px', width: `calc(100% - ${pad * 2}px)`, height: h }]);
    y += (h === 'auto' ? Math.max(40, c.scrollHeight) : parseFloat(h)) + gap;
  }
  act(`Stacked what’s inside ${nameOf(sEl(m.getAttribute('data-se-id')))}`, () => {
    for (const [c, p] of plan) applyOwn(sEl(c.getAttribute('data-se-id')), p);
    applyOwn(sEl(m.getAttribute('data-se-id')), { height: (y + pad) + 'px' });
  }, { render: false, cssPath: SE_CSS });
}

/* Look: state, fill (solid / gradient), outline, corners, see-through */
function gradOf(s, g) {
  try { const d = JSON.parse(s.getAttribute('data-se-grad') || 'null'); if (d) return d; } catch (e) { /* ignore */ }
  const bi = g('background-image');
  const m = bi && bi.match(/linear-gradient\((.*)\)$/);
  if (!m) return null;
  const parts = m[1].split(/,(?![^(]*\))/).map(x => x.trim());
  let angle = 180; if (/deg$/.test(parts[0])) angle = parseFloat(parts.shift()); else if (/^to /.test(parts[0])) { const map = { 'to right': 90, 'to left': 270, 'to bottom': 180, 'to top': 0 }; angle = map[parts.shift()] || 180; }
  const stops = parts.map((p, i) => { const mm = p.match(/^(.*?)(?:\s+([\d.]+)%)?$/); return { c: rgbToHex(mm[1]) === '#000000' && !/rgb|#/.test(mm[1]) ? mm[1] : rgbToHex(mm[1]), p: mm[2] != null ? +mm[2] : Math.round(i / Math.max(1, parts.length - 1) * 100) }; });
  return { angle, stops };
}
const gradCss = gd => `linear-gradient(${gd.angle}deg, ${gd.stops.slice().sort((a, b) => a.p - b.p).map(st => `${st.c} ${st.p}%`).join(', ')})`;
function lookSection(s, r, g) {
  const gd = gradOf(s, g);
  const fillMode = gd ? 'grad' : rgbToHex(g('background-color')) === 'transparent' ? 'none' : 'solid';
  const px = v => { const n = parseFloat(v); return isNaN(n) ? '' : Math.round(n * 10) / 10; };
  const colorsFor = (i, cur) => teamColors().map(c => `<option value="var(${c.prop})" ${cur === `var(${c.prop})` ? 'selected' : ''}>${esc(c.name)}</option>`).join('') + (cur && !/^var/.test(cur) ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : '') + '<option value="__pick">Pick a color…</option>';
  return `<div class="field">Look when${seg('state', [['normal', 'Normal'], ['hover', 'Hovered'], ['active', 'Pressed']], S.state)}</div>
    ${S.state !== 'normal' ? `<p class="hint" style="margin-top:-6px">Showing the ${S.state === 'hover' ? 'hovered' : 'pressed'} look. Changes here only apply then.</p>` : ''}
    <div class="field">Fill${seg('fill', [['none', 'None'], ['solid', 'Solid'], ['grad', 'Gradient']], fillMode)}</div>
    ${fillMode === 'solid' ? swatchRow('background-color', 'fill', g('background-color')) : ''}
    ${fillMode === 'grad' && gd ? `<div class="grad-preview" style="background:${esc(gradCss(gd))}"></div>
      <div class="field">Direction${seg('gdir', [['90', '→'], ['180', '↓'], ['135', '↘'], ['45', '↗']], String(gd.angle))}</div>
      <label class="inline-field">Angle<input class="inp num" id="gAngle" style="width:70px" value="${gd.angle}">°</label>
      ${gd.stops.map((st, i) => `<div class="grad-stop"><span class="swatch" style="background:${esc(st.c)}"></span><select class="inp" data-gc="${i}">${colorsFor(i, st.c)}</select><input class="inp num" data-gp="${i}" value="${st.p}%"><button class="icon-btn" data-gx="${i}" aria-label="Remove color" ${gd.stops.length <= 2 ? 'disabled' : ''}>${icon(I.x)}</button></div>`).join('')}
      <button class="btn btn-dashed" id="gAdd">${icon(I.plus)}Add a color</button>` : ''}
    <div class="grid2">
      <label class="field">Corners<input class="inp num" data-lk="border-radius" data-label="corners" value="${px(g('border-top-left-radius'))}"></label>
      <label class="field">See-through<input class="inp num" id="lOpacity" value="${Math.round((1 - parseFloat(g('opacity') || 1)) * 100)}%"></label>
      <label class="field">Outline<input class="inp num" id="lOutline" value="${px(g('border-top-width'))}"></label>
      <label class="field">Space inside<input class="inp num" data-lk="padding" data-label="space inside" value="${esc(g('padding').replace(/px/g, ''))}"></label>
    </div>
    ${parseFloat(g('border-top-width')) ? `<div class="field">Outline color${swatchRow('border-color', 'outline color', g('border-top-color'))}</div>` : ''}`;
}
function bindLook(box, s, r) {
  if (!box) return;
  const g = k => r ? fwin().getComputedStyle(r).getPropertyValue(k) : '';
  bindSeg(box, 'state', v => { S.state = v; renderFrame(); renderPanels(); });
  bindSwatches(box, (prop, val, label) => setStyle(prop === 'background-color' ? { 'background-color': val, 'background-image': 'none' } : { [prop]: val }, null, label));
  const saveGrad = (gd, label) => {
    act(label || `Changed the gradient on ${nameOf(s)}`, () => {
      s.setAttribute('data-se-grad', JSON.stringify(gd));
      return applyOwn(s, { 'background-image': gradCss(gd) }, { state: S.state });
    }, { render: false, cssPath: SE_CSS });
    const rr = rEl(S.sel); if (rr) rr.setAttribute('data-se-grad', JSON.stringify(gd));
  };
  bindSeg(box, 'fill', v => {
    if (v === 'none') setStyle({ 'background-color': 'transparent', 'background-image': 'none' }, null, 'fill');
    else if (v === 'solid') { const c = (teamColors()[0] || {}).prop; setStyle({ 'background-color': c ? `var(${c})` : '#808080', 'background-image': 'none' }, null, 'fill'); }
    else { const cs = teamColors(); saveGrad({ angle: 90, stops: [{ c: cs[0] ? `var(${cs[0].prop})` : '#F05A28', p: 0 }, { c: cs[1] ? `var(${cs[1].prop})` : '#1A1A1A', p: 100 }] }, `Gave ${nameOf(s)} a gradient`); }
  });
  const gd = gradOf(s, g);
  if (gd) {
    bindSeg(box, 'gdir', v => { gd.angle = +v; saveGrad(gd); });
    const ga = $('#gAngle', box); if (ga) ga.onchange = () => { gd.angle = parseFloat(ga.value) || 0; saveGrad(gd); };
    $$('[data-gc]', box).forEach(sl => sl.onchange = () => {
      const i = +sl.dataset.gc;
      if (sl.value === '__pick') { const inp = document.createElement('input'); inp.type = 'color'; inp.onchange = () => { gd.stops[i].c = inp.value.toUpperCase(); saveGrad(gd); }; inp.click(); return; }
      gd.stops[i].c = sl.value; saveGrad(gd);
    });
    $$('[data-gp]', box).forEach(inp => inp.onchange = () => { gd.stops[+inp.dataset.gp].p = Math.min(100, Math.max(0, parseFloat(inp.value) || 0)); saveGrad(gd); });
    $$('[data-gx]', box).forEach(b => b.onclick = () => { gd.stops.splice(+b.dataset.gx, 1); saveGrad(gd); });
    const add = $('#gAdd', box); if (add) add.onclick = () => { gd.stops.push({ c: gd.stops[0].c, p: 50 }); saveGrad(gd); };
  }
  $$('[data-lk]', box).forEach(i => i.onchange = () => setStyle(i.dataset.lk, i.value, i.dataset.label));
  $('#lOpacity', box).onchange = e => { const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)); setStyle('opacity', String((100 - v) / 100), 'see-through amount'); };
  $('#lOutline', box).onchange = e => { const v = parseFloat(e.target.value) || 0; setStyle(v ? { 'border-width': v + 'px', 'border-style': 'solid' } : { 'border-width': '0px', 'border-style': 'none' }, null, 'outline'); };
}

/* Layer: lock, vanish, hide, shared, stacking */
function layerSection(s) {
  const lock = s.getAttribute('data-se-lock') || '';
  return `<div class="field">Lock${seg('lock', [['', 'Unlocked'], ['position', 'Position'], ['all', 'Everything']], lock)}</div>
    <p class="hint" style="margin-top:-6px">${lock === 'all' ? 'Can’t be clicked on the page. Clicks go to whatever is underneath. Select it here in Layers.' : lock === 'position' ? 'You can still change its look and words, but it can’t be moved, resized or deleted.' : 'Lock it so it can’t be changed by accident.'}</p>
    ${tog('vanish', s.hasAttribute('data-se-vanish'), 'Vanish while editing')}
    ${tog('hide', s.hasAttribute('data-se-hide'), 'Hide (also on the site)')}
    <button class="btn" id="lyShare">${s.hasAttribute('data-se-shared') ? 'Stop sharing across pages' : 'Make shared across pages…'}</button>
    <div class="grid2"><button class="btn" data-cmd="front">To front</button><button class="btn" data-cmd="back">To back</button>
      <button class="btn" data-cmd="duplicate">Duplicate</button><button class="btn btn-danger" data-cmd="delete">Delete</button></div>`;
}
function bindLayer(box, s) {
  if (!box) return;
  const id = s.getAttribute('data-se-id');
  bindSeg(box, 'lock', v => toggleLock(id, v));
  bindTog(box, 'vanish', () => toggleVanish(id));
  bindTog(box, 'hide', () => toggleHide(id));
  $('#lyShare', box).onclick = makeShared;
  bindCmds(box);
}

/* ============ Widget sections (depend on what it is) ============ */
function widgetSection(s) {
  if (s.tagName === 'A') return { title: 'Link', html: linkHtml(s), bind: b => bindLink(b, s) };
  if (s.classList.contains('se-countdown')) return { title: 'Countdown', html: cdHtml(s), bind: b => bindCountdown(b, s) };
  if (s.hasAttribute('data-se-popup')) return { title: 'Pop-up', html: popupHtml(s), bind: b => bindPopup(b, s) };
  if (s.tagName === 'DETAILS') return { title: 'Expanding row', html: expandHtml(s), bind: b => bindExpand(b, s) };
  if (s.classList.contains('se-embed')) return { title: 'Embedded content', html: `<label class="field">Embed code<textarea class="inp mono" id="emCode" rows="6">${esc(s.innerHTML.trim())}</textarea></label><button class="btn" id="emSave">Update embed</button><p class="hint">It shows as a placeholder while editing. Use Preview to see it working.</p>`, bind: b => { $('#emSave', b).onclick = () => act('Updated embedded content', () => { s.innerHTML = $('#emCode', b).value; assignIds(getDoc(S.page)); }, { devLabel: false }); } };
  if (s.hasAttribute('data-se-tabs')) return { title: 'Section tabs', html: tabsHtml(s), bind: b => bindTabs(b, s) };
  if (s.tagName === 'IMG') return { title: 'Image', html: `<button class="btn" id="imSwap">Swap image…</button><label class="field">Describe it for people who can’t see it<input class="inp" id="imAlt" value="${esc(s.getAttribute('alt') || '')}"></label>`, bind: b => {
    $('#imSwap', b).onclick = () => pickMedia('image', p => act(`Swapped an image for ${p.split('/').pop()}`, () => s.setAttribute('src', relPath(S.page, p)), { devLabel: false }));
    $('#imAlt', b).onchange = e => act('Described an image', () => s.setAttribute('alt', e.target.value), { render: false, devLabel: false });
  } };
  return null;
}
function linkKind(s) {
  const href = s.getAttribute('href') || '';
  if (s.hasAttribute('data-se-open')) return 'popup';
  if (!href || href === '#') return 'page';
  if (/^mailto:/i.test(href)) return 'email';
  if (/^https?:|^\/\//i.test(href)) return 'website';
  const p = resolve(S.page, href);
  return p && !isPage(p) ? 'document' : 'page';
}
function linkHtml(s) {
  const href = s.getAttribute('href') || '';
  if (S.linkFor !== S.sel) { S.linkKind = linkKind(s); S.linkFor = S.sel; }
  const target = resolve(S.page, href);
  let list = '';
  if (S.linkKind === 'page') list = `<input class="inp" id="lSearch" placeholder="Search pages"><div class="link-list" id="lList">${allPages().map(p => `<button data-href="${esc(relPath(S.page, p))}" data-name="${esc(pageName(p))}" class="${p === target && !s.hasAttribute('data-se-open') ? 'on' : ''}">${icon(I.page)}<span style="flex:1">${esc(pageName(p))}</span></button>`).join('')}</div>`;
  else if (S.linkKind === 'website') list = `<label class="field">Web address<input class="inp" id="lUrl" placeholder="https://" value="${/^https?:/.test(href) ? esc(href) : ''}"></label>`;
  else if (S.linkKind === 'document') { const docs = [...S.files.keys()].filter(p => DOC_EXT.test(p) && !isPage(p)); list = `<div class="link-list">${docs.length ? docs.map(p => `<button data-href="${esc(relPath(S.page, p))}" data-name="${esc(pretty(p.split('/').pop()))}" class="${p === target ? 'on' : ''}">${icon(I.doc)}<span style="flex:1">${esc(pretty(p.split('/').pop()))}</span></button>`).join('') : '<p class="empty">No documents yet.</p>'}</div><button class="btn btn-dashed" id="lUpload">${icon(I.plus)}Add a document</button>`; }
  else if (S.linkKind === 'popup') { const pops = [...getDoc(S.page).querySelectorAll('[data-se-popup]')].map(e => e.getAttribute('data-se-popup')); list = pops.length ? `<div class="link-list">${pops.map(n => `<button data-pop="${esc(n)}" class="${s.getAttribute('data-se-open') === n ? 'on' : ''}">${icon(I.popup)}<span style="flex:1">${esc(n)}</span></button>`).join('')}</div>` : '<p class="empty">No pop-ups on this page yet. Right-click a box and choose Turn into → Pop-up.</p>'; }
  else list = `<label class="field">Email address<input class="inp" id="lMail" type="email" placeholder="team@example.org" value="${esc(href.replace(/^mailto:/i, ''))}"></label>`;
  return `<span class="h">When someone clicks it, go to</span>
    ${seg('lkind', [['page', 'Page'], ['website', 'Site'], ['document', 'File'], ['email', 'Email'], ['popup', 'Pop-up']], S.linkKind)}${list}
    ${S.linkKind !== 'popup' ? tog('newtab', s.getAttribute('target') === '_blank', 'Open in a new tab') : ''}
    <button class="btn btn-ghost" id="lPlain" style="justify-content:flex-start;padding:0">Turn back into a plain shape</button>`;
}
function bindLink(b, s) {
  bindSeg(b, 'lkind', v => { S.linkKind = v; renderPanels(); });
  const setHref = (h, label, pop) => act(`Pointed ${nameOf(s)} to ${label}`, () => { s.setAttribute('href', h); if (pop) s.setAttribute('data-se-open', pop); else s.removeAttribute('data-se-open'); }, { render: false, devLabel: false });
  $$('[data-href]', b).forEach(x => x.onclick = () => setHref(x.dataset.href, x.dataset.name));
  $$('[data-pop]', b).forEach(x => x.onclick = () => setHref('#', x.dataset.pop, x.dataset.pop));
  const se = $('#lSearch', b); if (se) se.oninput = () => $$('#lList button', b).forEach(x => { x.hidden = !x.dataset.name.toLowerCase().includes(se.value.toLowerCase()); });
  const u = $('#lUrl', b); if (u) u.onchange = () => { let v = u.value.trim(); if (v && !/^[a-z]+:/i.test(v)) v = 'https://' + v; setHref(v, v.replace(/^https?:\/\//, '')); };
  const m = $('#lMail', b); if (m) m.onchange = () => setHref('mailto:' + m.value.trim(), m.value.trim());
  const up = $('#lUpload', b); if (up) up.onclick = () => pickMedia('doc', p => setHref(relPath(S.page, p), pretty(p.split('/').pop())));
  bindTog(b, 'newtab', on => act(on ? `Made ${nameOf(s)} open in a new tab` : `Made ${nameOf(s)} open in the same tab`, () => { if (on) { s.setAttribute('target', '_blank'); s.setAttribute('rel', 'noopener'); } else { s.removeAttribute('target'); s.removeAttribute('rel'); } }, { render: false, devLabel: false }));
  $('#lPlain', b).onclick = () => turnInto('shape');
}
function cdCfg(s) { try { return Object.assign(defaultCountdown(), JSON.parse(s.getAttribute('data-se-countdown') || '{}')); } catch (e) { return defaultCountdown(); } }
function cdHtml(s) {
  const c = cdCfg(s), now = Date.now(); let fNow = false, fNext = false;
  const st = c.queue.map((q, i) => { const t = new Date(q.date).getTime(); if (!q.date || isNaN(t)) return ['Pick a date', '']; if (c.auto === false && i > 0) return ['Won’t run', '']; if (t <= now) return ['Done', '']; if (!fNow) { fNow = true; return ['Counting now', 'accent']; } if (!fNext) { fNext = true; return ['Up next', '']; } return ['Later', '']; });
  return `<div class="field">Show${seg('show', [['d', 'Days'], ['dh', 'Days + hours'], ['dhms', 'To the second']], c.show)}</div>
    <label class="field">Words above the timer<input class="inp" id="cLabel" value="${esc(c.label)}"></label>
    <span class="h">Count down to</span><span class="hint" style="margin-top:-6px">When one date passes, the next one starts.</span>
    <div style="display:flex;flex-direction:column;gap:4px">${c.queue.map((q, i) => `<div class="queue-item ${st[i][1] ? 'now' : ''}"><span class="q-n">${i + 1}</span>
      <div class="q-fields"><input class="inp" data-q="${i}" data-f="name" value="${esc(q.name)}" placeholder="Event name" aria-label="Event name"><input class="inp num" type="datetime-local" data-q="${i}" data-f="date" value="${esc(q.date)}" aria-label="Date and time"></div>
      <div class="q-side"><span class="tag ${st[i][1]}">${st[i][0]}</span><div class="mini"><button data-qa="up" data-q="${i}" aria-label="Move earlier">${icon(I.up)}</button><button data-qa="down" data-q="${i}" aria-label="Move later">${icon(I.down)}</button><button data-qa="del" data-q="${i}" aria-label="Remove">${icon(I.x)}</button></div></div></div>`).join('')}</div>
    <button class="btn btn-dashed" id="cAdd">${icon(I.plus)}Add another date</button>
    ${tog('auto', c.auto !== false, 'Start the next date automatically')}${tog('upnext', c.upnext !== false, 'Show “Up next” under the timer')}
    <label class="field">When it hits zero<select class="inp" id="cZero"><option value="day" ${c.zero !== 'none' ? 'selected' : ''}>Show a message for 1 day</option><option value="none" ${c.zero === 'none' ? 'selected' : ''}>Go straight to the next date</option></select></label>
    ${c.zero !== 'none' ? `<label class="field">Message<input class="inp" id="cZeroText" value="${esc(c.zeroText)}"></label>` : ''}
    <label class="field">After the last date<select class="inp" id="cAfter"><option value="hide" ${c.after === 'hide' ? 'selected' : ''}>Hide the countdown</option><option value="message" ${c.after === 'message' ? 'selected' : ''}>Show a message</option><option value="zeros" ${c.after === 'zeros' ? 'selected' : ''}>Keep showing zeros</option></select></label>
    ${c.after === 'message' ? `<label class="field">Message<input class="inp" id="cAfterText" value="${esc(c.afterText)}"></label>` : ''}
    <button class="btn" id="cPreview">${icon(I.play)}Preview the switch to the next date</button>`;
}
function bindCountdown(b, s) {
  const save = (label, mut) => {
    const n = cdCfg(s); mut(n);
    act(label, () => s.setAttribute('data-se-countdown', JSON.stringify(n)), { render: false, devLabel: false });
    const r = rEl(S.sel); if (r) { r.setAttribute('data-se-countdown', JSON.stringify(n)); r.__seLast = null; try { fwin().SEWidgets.refresh(); } catch (e) { /* not ready */ } }
    setTimeout(drawSelection, 50);
  };
  bindSeg(b, 'show', v => save('Changed what the countdown shows', n => { n.show = v; }));
  $('#cLabel', b).onchange = e => save('Changed the countdown’s words', n => { n.label = e.target.value; });
  $$('[data-f]', b).forEach(inp => inp.onchange = () => save(inp.dataset.f === 'date' ? 'Changed a countdown date' : 'Renamed a countdown date', n => { n.queue[+inp.dataset.q][inp.dataset.f] = inp.value; }));
  $$('[data-qa]', b).forEach(x => x.onclick = () => { const i = +x.dataset.q, a = x.dataset.qa; save(a === 'del' ? 'Removed a countdown date' : 'Reordered the countdown dates', n => { if (a === 'del') n.queue.splice(i, 1); else { const j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= n.queue.length) return; [n.queue[i], n.queue[j]] = [n.queue[j], n.queue[i]]; } }); });
  $('#cAdd', b).onclick = () => save('Added a countdown date', n => { const last = n.queue.length ? new Date(n.queue[n.queue.length - 1].date) : new Date(); const d = isNaN(last) ? new Date() : last; d.setDate(d.getDate() + 7); n.queue.push({ name: 'Next event', date: localISO(d) }); });
  bindTog(b, 'auto', on => save(on ? 'Countdown now moves to the next date' : 'Countdown now stops after one date', n => { n.auto = on; }));
  bindTog(b, 'upnext', on => save('Changed the “Up next” line', n => { n.upnext = on; }));
  $('#cZero', b).onchange = e => save('Changed what shows at zero', n => { n.zero = e.target.value; });
  const zt = $('#cZeroText', b); if (zt) zt.onchange = e => save('Changed the zero message', n => { n.zeroText = e.target.value; });
  $('#cAfter', b).onchange = e => save('Changed what shows after the last date', n => { n.after = e.target.value; });
  const at = $('#cAfterText', b); if (at) at.onchange = e => save('Changed the last message', n => { n.afterText = e.target.value; });
  $('#cPreview', b).onclick = () => {
    const q = cdCfg(s).queue.map(x => ({ name: x.name, t: new Date(x.date).getTime() })).find(x => x.t > Date.now());
    if (!q) { toast('Add a date in the future to preview the switch'); return; }
    try { fwin().SEWidgets.setNowOffset(q.t - Date.now() - 6000); } catch (e) { return; }
    toast(`Showing the last few seconds before ${q.name}…`, 5000);
    clearTimeout(bindCountdown.t); bindCountdown.t = setTimeout(() => { try { fwin().SEWidgets.setNowOffset(0); } catch (e) { /* page changed */ } }, 14000);
  };
}
function popupHtml(s) {
  const n = s.getAttribute('data-se-popup');
  const openers = [...getDoc(S.page).querySelectorAll(`[data-se-open="${CSS.escape(n)}"]`)].length;
  return `<label class="field">Name<input class="inp" id="ppName" value="${esc(n)}"></label>
    ${tog('ppShow', S.showPopup === n, 'Show it while editing')}
    <p class="hint">${openers ? `${openers} button${openers === 1 ? '' : 's'} open${openers === 1 ? 's' : ''} it.` : 'Nothing opens it yet. Select a button, then in Link pick Pop-up.'} Visitors close it with the × button, the Esc key, or by clicking outside it.</p>
    <button class="btn" id="ppUndo">Stop being a pop-up</button>`;
}
function bindPopup(b, s) {
  const n = s.getAttribute('data-se-popup');
  $('#ppName', b).onchange = e => { const v = e.target.value.trim(); if (!v || v === n) return; act(`Renamed ${n} to ${v}`, () => { s.setAttribute('data-se-popup', v); for (const o of getDoc(S.page).querySelectorAll(`[data-se-open="${CSS.escape(n)}"]`)) o.setAttribute('data-se-open', v); }, { devLabel: false }); S.showPopup = v; };
  bindTog(b, 'ppShow', on => { S.showPopup = on ? n : null; renderFrame(); });
  $('#ppUndo', b).onclick = () => { act(`Turned ${n} back into a normal box`, () => s.removeAttribute('data-se-popup'), { devLabel: false }); S.showPopup = null; };
}
function expandHtml(s) {
  const sum = s.querySelector('summary'), doc = s.getAttribute('data-se-doc') || s.getAttribute('data-pdf') || '';
  return `<label class="field">Title<input class="inp" id="exTitle" value="${esc(sum ? sum.textContent.trim() : '')}"></label>
    ${tog('exOpen', S.openDetails.has(s.getAttribute('data-se-id')), 'Open while editing')}
    ${tog('exStart', s.hasAttribute('open'), 'Starts open on the site')}
    <div class="field">Document inside<div class="row"><span>${doc ? esc(pretty(doc.split('/').pop())) : 'None'}</span><button class="btn" id="exDoc">${doc ? 'Change…' : 'Add a document…'}</button></div></div>
    ${doc ? '<button class="btn btn-ghost" id="exNoDoc" style="justify-content:flex-start;padding:0">Remove the document</button>' : ''}
    <p class="hint">Documents load only when someone opens the row, so the page stays fast.</p>`;
}
function bindExpand(b, s) {
  const attr = s.hasAttribute('data-pdf') ? 'data-pdf' : 'data-se-doc';
  $('#exTitle', b).onchange = e => act('Changed an expanding row’s title', () => { let sm = s.querySelector('summary'); if (!sm) { sm = getDoc(S.page).createElement('summary'); s.prepend(sm); } sm.textContent = e.target.value; assignIds(getDoc(S.page)); }, { devLabel: false });
  bindTog(b, 'exOpen', on => { const id = s.getAttribute('data-se-id'); if (on) S.openDetails.add(id); else S.openDetails.delete(id); const r = rEl(id); if (r) r.open = on; setTimeout(drawSelection, 30); });
  bindTog(b, 'exStart', on => act(on ? 'Made a row start open' : 'Made a row start closed', () => { if (on) s.setAttribute('open', ''); else s.removeAttribute('open'); }, { render: false, devLabel: false }));
  $('#exDoc', b).onclick = () => pickMedia('doc', p => act(`Put ${pretty(p.split('/').pop())} inside an expanding row`, () => s.setAttribute(attr, relPath(S.page, p)), { render: false, devLabel: false }));
  const nd = $('#exNoDoc', b); if (nd) nd.onclick = () => act('Removed a document from an expanding row', () => s.removeAttribute(attr), { render: false, devLabel: false });
}
function tabsCandidates() {
  const doc = getDoc(S.page), root = doc.querySelector('main') || doc.body;
  const out = [];
  for (const el of root.querySelectorAll('section, [id], article')) {
    if (el.closest('[data-se-tabs]') || el.closest('nav') || ['HTML', 'BODY', 'MAIN'].includes(el.tagName) || el.closest('header,footer')) continue;
    const h = el.querySelector('h1,h2,h3');
    if (!el.id && !h) continue;
    if (out.some(o => o.el.contains(el))) continue;
    out.push({ el, label: h ? h.textContent.trim().slice(0, 40) : pretty(el.id) });
  }
  return out.slice(0, 30);
}
function tabsHtml(s) {
  const have = new Set([...s.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href').slice(1)));
  const c = tabsCandidates();
  return `<p class="hint">Pick the parts of the page to list. The one on screen gets highlighted as visitors scroll.</p>
    <div class="radio-list">${c.map((x, i) => `<label><input type="checkbox" data-tc="${i}" ${x.el.id && have.has(x.el.id) ? 'checked' : ''}>${esc(x.label)}</label>`).join('') || '<p class="empty">No sections with headings found on this page.</p>'}</div>`;
}
function bindTabs(b, s) {
  const c = tabsCandidates();
  $$('[data-tc]', b).forEach(cb => cb.onchange = () => act('Changed the section tabs', () => {
    const doc = getDoc(S.page), picked = $$('[data-tc]', b).filter(x => x.checked).map(x => c[+x.dataset.tc]);
    s.innerHTML = '';
    for (const p of picked) {
      if (!p.el.id) { let id = p.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'; let n = 2; while (doc.getElementById(id)) id = id.replace(/-\d+$/, '') + '-' + n++; p.el.id = id; }
      const a = doc.createElement('a'); a.href = '#' + p.el.id; a.textContent = p.label; s.appendChild(a);
    }
    assignIds(doc);
  }, { devLabel: false }));
}

/* ============ Motion ============ */
function motionCfg(s) { try { return Object.assign({ effect: 'none', trigger: 'load', speed: 'normal', repeat: 'once', calm: true }, JSON.parse(s.getAttribute('data-se-motion') || '{}')); } catch (e) { return { effect: 'none' }; } }
function motionSection(s) {
  const c = motionCfg(s), tl = tlCfg(s), hasGrad = /gradient/.test(s.getAttribute('data-se-grad') || '') || !!s.getAttribute('data-se-grad');
  const FX = [['none', 'None'], ['fade', 'Fade in'], ['slide', 'Slide in'], ['grow', 'Grow'], ['spin', 'Spin'], ['float', 'Float'], ['pulse', 'Pulse']].concat(hasGrad ? [['flow', 'Flowing color']] : []);
  const T = [['load', 'When the page loads'], ['view', 'When scrolled into view'], ['hover', 'When hovered'], ['click', 'When clicked']];
  return `<div class="fx-grid">${FX.map(([k, l]) => `<button data-fx="${k}" class="${c.effect === k ? 'on' : ''}">${icon(I[k] || I.grad)}${l}</button>`).join('')}</div>
    ${c.effect !== 'none' ? `<span class="h">Play it</span><div class="radio-list">${T.map(([k, l]) => `<label><input type="radio" name="mtrig" value="${k}" ${c.trigger === k ? 'checked' : ''}>${l}</label>`).join('')}</div>
      ${c.effect === 'spin' ? `<div class="field">Direction${seg('mdir', [['cw', 'Clockwise'], ['ccw', 'Counter-clockwise']], c.dir || 'cw')}</div>` : ''}
      <div class="field">Speed${seg('mspeed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['exact', 'Exact']], c.secs ? 'exact' : c.speed)}</div>
      ${c.secs ? `<label class="inline-field">One full ${c.effect === 'spin' ? 'turn' : 'play'} takes<input class="inp num" id="mSecs" style="width:64px" value="${c.secs}">seconds</label>` : ''}
      <div class="field">Repeat${seg('mrep', [['once', 'Once'], ['forever', 'Forever']], c.repeat)}</div>
      <button class="btn" id="mPlay">${icon(I.play)}Play it</button>` : ''}
    ${tog('calm', c.calm !== false, 'Calm it down for people who turn off motion')}
    <div class="box"><span class="h">Your own animation</span><span class="hint">${tl.steps.length ? `${tl.steps.length} steps · ${tl.duration} seconds${tl.smooth !== false ? ' · smoothed' : ''}` : 'Move, turn, grow or fade it over time, step by step.'}</span>
      <button class="btn" id="mTl">${S.tlOpen ? 'Timeline is open below' : 'Open the timeline'}</button></div>`;
}
function bindMotion(b, s) {
  if (!b) return;
  const playIt = () => { const r = rEl(S.sel); try { if (r) fwin().SEWidgets.playMotion(r); } catch (e) { /* ignore */ } };
  const save = (label, mut) => {
    const n = motionCfg(s); mut(n);
    act(label, () => { if (n.effect === 'none') s.removeAttribute('data-se-motion'); else s.setAttribute('data-se-motion', JSON.stringify(n)); if (n.effect === 'flow') return applyOwn(s, { 'background-size': '300% 100%' }); }, { render: false, devLabel: false });
    const r = rEl(S.sel); if (r) { if (n.effect === 'none') r.removeAttribute('data-se-motion'); else { r.setAttribute('data-se-motion', JSON.stringify(n)); setTimeout(playIt, 60); } }
  };
  $$('[data-fx]', b).forEach(x => x.onclick = () => save(x.dataset.fx === 'none' ? `Removed the effect from ${nameOf(s)}` : `Gave ${nameOf(s)} the ${x.textContent.trim().toLowerCase()} effect`, n => {
    n.effect = x.dataset.fx; if (['spin', 'float', 'pulse', 'flow'].includes(n.effect)) n.repeat = 'forever'; else if (n.effect !== 'none') n.repeat = 'once';
  }));
  $$('input[name="mtrig"]', b).forEach(r => r.onchange = () => save('Changed when an effect plays', n => { n.trigger = r.value; }));
  bindSeg(b, 'mdir', v => save('Changed which way something spins', n => { n.dir = v; }));
  bindSeg(b, 'mspeed', v => save('Changed an effect’s speed', n => { if (v === 'exact') n.secs = n.effect === 'spin' ? 20 : n.effect === 'flow' ? 8 : 1; else { delete n.secs; n.speed = v; } }));
  const secs = $('#mSecs', b); if (secs) secs.onchange = () => save('Changed an effect’s speed', n => { n.secs = Math.max(0.1, parseFloat(secs.value) || 1); });
  bindSeg(b, 'mrep', v => save('Changed how often an effect repeats', n => { n.repeat = v; }));
  bindTog(b, 'calm', on => save('Changed the calm-motion setting', n => { n.calm = on; }));
  const p = $('#mPlay', b); if (p) p.onclick = playIt;
  $('#mTl', b).onclick = () => { S.tlOpen = true; renderTimeline(); renderPanels(); drawSelection(); setTimeout(layoutFrame, 30); };
}

/* ============ Character panel ============ */
function textStyles() {
  const out = [], seen = new Set();
  const TP = /^(font|line-height|letter-spacing|text-transform|font-family|font-size|font-weight|font-style|text-decoration)/;
  for (const [p] of S.files) {
    if (!isCss(p) || p === SE_CSS) continue;
    const css = fileText(p) || '';
    for (const r of topRules(css)) {
      if (!/^\.[a-zA-Z][\w-]*$/.test(r.sel)) continue;
      const decl = parseDecls(css.slice(r.open + 1, r.close).replace(/\/\*[\s\S]*?\*\//g, ''));
      const keys = Object.keys(decl); if (!keys.length) continue;
      const t = keys.filter(k => TP.test(k)).length;
      if (!(decl['font-size'] || decl['font-family']) || t / keys.length < 0.6) continue;
      const c = r.sel.slice(1); if (seen.has(c)) continue; seen.add(c);
      out.push({ cls: c, name: pretty(c.replace(/^type-/, '')) });
    }
  }
  return out;
}
function renderCharacter(box) {
  const s = sEl(S.sel);
  if (!s) { box.innerHTML = '<p class="panel-note">Select some text to change its font, size and color.</p>'; return; }
  const r = rEl(S.sel), cs = r ? fwin().getComputedStyle(r) : null, g = k => cs ? cs.getPropertyValue(k) : '';
  const fonts = teamFonts(), styles = textStyles();
  const curFont = (g('font-family').split(',')[0] || '').replace(/['"]/g, '').trim();
  const curStyle = styles.find(t => s.classList.contains(t.cls));
  const leaf = !s.children.length && !['IMG', 'svg', 'INPUT', 'IFRAME', 'VIDEO'].includes(s.tagName) && !s.classList.contains('se-countdown');
  const W = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold']];
  const px = v => { const n = parseFloat(v); return isNaN(n) ? '' : Math.round(n * 10) / 10; };
  const ls = g('letter-spacing') === 'normal' ? 0 : px(g('letter-spacing'));
  const lh = g('line-height') === 'normal' ? 'normal' : (px(g('line-height')) / (parseFloat(g('font-size')) || 16)).toFixed(2).replace(/\.?0+$/, '');
  const align = ['left', 'center', 'right'].includes(g('text-align')) ? g('text-align') : (g('text-align') === 'start' ? 'left' : '');
  box.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;padding:12px">
    ${S.state !== 'normal' ? `<p class="hint">Editing the ${S.state === 'hover' ? 'hovered' : 'pressed'} look.</p>` : ''}
    ${leaf ? `<label class="field">Words<textarea class="inp" id="chWords" rows="2">${esc(s.textContent)}</textarea></label>` : ''}
    ${styles.length ? `<label class="field">Text style<select class="inp" id="chStyle"><option value="">None</option>${styles.map(t => `<option value="${t.cls}" ${curStyle && curStyle.cls === t.cls ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
    <label class="field">Font<select class="inp" data-prop="font-family" data-label="font">${fonts.map(f => `<option value='${esc(fontStack(f))}' ${f === curFont ? 'selected' : ''}>${esc(f)}</option>`).join('')}${curFont && !fonts.includes(curFont) ? `<option selected value="">${esc(curFont)} (current)</option>` : ''}<option value="__add">+ Add a team font…</option></select></label>
    <div class="grid2">
      <label class="field">Size<input class="inp num" data-prop="font-size" data-label="text size" value="${px(g('font-size'))}"></label>
      <label class="field">Weight<select class="inp" data-prop="font-weight" data-label="text weight">${W.map(([v, l]) => `<option value="${v}" ${String(v) === g('font-weight') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">Letter spacing<input class="inp num" data-prop="letter-spacing" data-label="letter spacing" value="${ls}"></label>
      <label class="field">Line height<input class="inp num" data-prop="line-height" data-label="line height" value="${lh}"></label>
    </div>
    <div class="field">Align${seg('align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], align)}</div>
    <div class="field">Capitals${seg('caps', [['none', 'As typed'], ['uppercase', 'ALL CAPS']], g('text-transform') === 'uppercase' ? 'uppercase' : 'none')}</div>
    <div class="field">Text color${swatchRow('color', 'text color', g('color'))}</div></div>`;
  bindSeg(box, 'align', v => setStyle('text-align', v, 'alignment'));
  bindSeg(box, 'caps', v => setStyle('text-transform', v, 'capitals'));
  bindSwatches(box, (prop, val, label) => setStyle(prop, val, label));
  $$('[data-prop]', box).forEach(el => { if (el.tagName === 'INPUT' && el.type === 'color') return; el.onchange = () => { if (el.value === '__add') { addFontModal(); return; } if (el.value !== '') setStyle(el.dataset.prop, el.value, el.dataset.label); }; });
  const w = $('#chWords', box); if (w) w.onchange = () => act(`Changed the words in ${nameOf(s)}`, () => { s.textContent = w.value; }, { devLabel: false });
  const st = $('#chStyle', box); if (st) st.onchange = () => act(st.value ? `Gave ${nameOf(s)} the ${pretty(st.value.replace(/^type-/, ''))} text style` : `Removed the text style from ${nameOf(s)}`, () => {
    for (const t of styles) s.classList.remove(t.cls);
    if (st.value) s.classList.add(st.value);
    const r2 = rEl(S.sel); if (r2) { for (const t of styles) r2.classList.remove(t.cls); if (st.value) r2.classList.add(st.value); }
  }, { render: false, devLabel: false });
}

/* ============ Layers panel ============ */
const LSKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'BR', 'TEMPLATE']);
function layerIcon(el) {
  if (el.classList.contains('se-countdown')) return I.count;
  if (el.hasAttribute('data-se-popup')) return I.popup;
  if (el.tagName === 'DETAILS') return I.expand;
  if (el.classList.contains('se-embed')) return I.embed;
  if (el.tagName === 'IMG' || el.tagName === 'PICTURE') return I.image;
  if (el.tagName === 'A' || el.tagName === 'BUTTON') return I.btn;
  if (el.namespaceURI === 'http://www.w3.org/2000/svg') return I.ellipse;
  if (canEditText(el) || /^(P|H[1-6]|SPAN)$/.test(el.tagName)) return I.text;
  return el.children.length ? I.layers : I.rect;
}
function renderLayers(box) {
  if (!S.page) return;
  const doc = getDoc(S.page), selEl = sEl(S.sel);
  const rows = []; let count = 0;
  (function walk(el, depth) {
    const kids = [...el.children].filter(c => !LSKIP.has(c.tagName.toUpperCase()) && c.hasAttribute('data-se-id')).reverse();
    for (const c of kids) {
      if (count++ > 700) return;
      const id = c.getAttribute('data-se-id'), open = S.openLayers.has(id), hasKids = [...c.children].some(k => !LSKIP.has(k.tagName.toUpperCase()));
      const lock = c.getAttribute('data-se-lock'), hid = c.hasAttribute('data-se-hide'), van = c.hasAttribute('data-se-vanish');
      rows.push(`<div class="lrow ${c === selEl ? 'on' : ''} ${hid || van ? 'dim' : ''}" draggable="true" data-lid="${id}">
        <button class="lbtn ${hid ? 'on' : ''}" data-lact="hide" title="${hid ? 'Hidden everywhere. Click to show.' : 'Hide (also on the site)'}" aria-label="Hide">${icon(hid ? I.eyeOff : I.eye)}</button>
        <button class="lbtn ${van ? 'on' : ''}" data-lact="vanish" title="${van ? 'Vanished while editing. Click to bring back.' : 'Vanish while editing'}" aria-label="Vanish while editing">${icon(I.ghost)}</button>
        <span style="width:${depth * 14}px;flex:none"></span>
        ${hasKids ? `<button class="ltw ${open ? 'open' : ''}" data-lact="twist" aria-label="${open ? 'Collapse' : 'Expand'}">${icon(I.chev)}</button>` : '<span class="ltw"></span>'}
        <button class="lname" data-lact="sel" title="${esc(nameOf(c))}">${icon(layerIcon(c))}<span style="overflow:hidden;text-overflow:ellipsis">${esc(nameOf(c))}</span></button>
        ${c.hasAttribute('data-se-shared') ? '<span class="ltag">Shared</span>' : ''}
        <button class="lbtn ${lock ? 'on' : ''}" data-lact="lock" title="${lock === 'all' ? 'Locked. Click to unlock.' : lock === 'position' ? 'Position locked. Click to unlock.' : 'Lock'}" aria-label="Lock">${icon(lock === 'all' ? I.lock : lock === 'position' ? I.lockPos : I.unlock)}</button>
      </div>`);
      if (open && hasKids) walk(c, depth + 1);
    }
  })(doc.body, 0);
  box.innerHTML = `<div class="layers">${rows.join('') || '<p class="empty">This page is empty.</p>'}</div>
    <p class="panel-note">Higher in the list means in front. Drag rows to restack. Eye hides it on the site too; the ghost only hides it while you edit.</p>`;
  $$('.lrow', box).forEach(row => {
    const id = row.dataset.lid;
    $$('[data-lact]', row).forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const a = b.dataset.lact;
        if (a === 'sel') { select(id); const r = rEl(id); if (r && fwin()) { const rr = r.getBoundingClientRect(); if (rr.bottom < 0 || rr.top > fwin().innerHeight) r.scrollIntoView({ block: 'center' }); } }
        if (a === 'twist') { if (S.openLayers.has(id)) S.openLayers.delete(id); else S.openLayers.add(id); renderLayers(box); }
        if (a === 'hide') toggleHide(id);
        if (a === 'vanish') toggleVanish(id);
        if (a === 'lock') { const s = getDoc(S.page).querySelector(`[data-se-id="${id}"]`); const cur = s.getAttribute('data-se-lock') || ''; toggleLock(id, cur === '' ? 'all' : cur === 'all' ? 'position' : ''); }
      };
    });
    const nm = $('.lname', row);
    nm.ondblclick = () => {
      const s = getDoc(S.page).querySelector(`[data-se-id="${id}"]`);
      nm.innerHTML = `<input class="inp" value="${esc(nameOf(s))}" style="height:24px">`;
      const inp = $('input', nm); inp.focus(); inp.select();
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = nameOf(s); inp.blur(); } };
      inp.onblur = () => { const v = inp.value.trim(); if (v && v !== nameOf(s)) act('Renamed a layer', () => s.setAttribute('data-se-name', v), { render: false, devLabel: false }); else renderLayers(box); };
    };
    row.ondragstart = e => { e.dataTransfer.setData('text/se-layer', id); e.dataTransfer.effectAllowed = 'move'; };
    row.ondragover = e => {
      if (![...e.dataTransfer.types].includes('text/se-layer')) return;
      e.preventDefault();
      const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
      row.classList.remove('drop-before', 'drop-after', 'drop-into');
      const t = getDoc(S.page).querySelector(`[data-se-id="${id}"]`);
      row.classList.add(y < 0.3 ? 'drop-before' : y > 0.7 || !CONTAINERS.has(t.tagName) ? 'drop-after' : 'drop-into');
    };
    row.ondragleave = () => row.classList.remove('drop-before', 'drop-after', 'drop-into');
    row.ondrop = e => {
      e.preventDefault();
      const how = row.classList.contains('drop-before') ? 'front' : row.classList.contains('drop-into') ? 'into' : 'behind';
      row.classList.remove('drop-before', 'drop-after', 'drop-into');
      moveLayer(e.dataTransfer.getData('text/se-layer'), id, how);
    };
  });
  const on = $('.lrow.on', box); if (on) on.scrollIntoView({ block: 'nearest' });
}
/* Moves a layer in front of / behind / into another, keeping it where it is on the page */
function moveLayer(srcId, targetId, how) {
  if (!srcId || srcId === targetId) return;
  const doc = getDoc(S.page), s = doc.querySelector(`[data-se-id="${srcId}"]`), t = doc.querySelector(`[data-se-id="${targetId}"]`);
  if (!s || !t || s.contains(t)) return;
  if (s.closest('[data-se-lock]')) { toast('It’s locked. Unlock it first.'); return; }
  const rs = rEl(srcId), newParentR = how === 'into' ? rEl(targetId) : rEl(targetId) && rEl(targetId).parentElement;
  let keep = null;
  if (rs && newParentR && isFree(rs) && rpos(rs) !== 'fixed' && newParentR !== rs.parentElement) {
    const a = rs.getBoundingClientRect(), b = newParentR.getBoundingClientRect(), ps = fwin().getComputedStyle(newParentR);
    keep = { left: Math.round(a.left - b.left - parseFloat(ps.borderLeftWidth)) + 'px', top: Math.round(a.top - b.top - parseFloat(ps.borderTopWidth)) + 'px' };
    if (ps.position === 'static') keep.__parent = true;
  }
  act(how === 'into' ? `Moved ${nameOf(s)} into ${nameOf(t)}` : `Moved ${nameOf(s)} ${how === 'front' ? 'in front of' : 'behind'} ${nameOf(t)}`, () => {
    if (how === 'into') { t.appendChild(s); S.openLayers.add(targetId); }
    else if (how === 'front') t.after(s); else t.before(s);
    if (keep) { if (keep.__parent) applyOwn(how === 'into' ? t : t.parentElement, { position: 'relative' }, { device: 'desktop' }); delete keep.__parent; applyOwn(s, keep, { device: 'desktop' }); }
    return true;
  }, { devLabel: false });
}
function groupSel() {
  const s = sEl(S.sel), r = rEl(S.sel); if (!s || !r) return;
  const free = isFree(r);
  let gid;
  act(`Grouped ${nameOf(s)}`, () => {
    const doc = getDoc(S.page), g = doc.createElement('div');
    g.setAttribute('data-se-name', 'Group');
    s.before(g); g.appendChild(s); assignIds(doc); gid = g.getAttribute('data-se-id');
    if (free) {
      const cs = fwin().getComputedStyle(r), b = r.getBoundingClientRect();
      applyOwn(g, { position: cs.position, left: cs.left, top: cs.top, width: Math.round(b.width) + 'px', height: Math.round(b.height) + 'px', margin: '0' }, { device: 'desktop' });
      applyOwn(s, { left: '0px', top: '0px' }, { device: 'desktop' });
    }
    return true;
  }, { devLabel: false });
  setTimeout(() => select(gid), 120);
}

/* ============ Pages, tabs, history ============ */
function renderPagesPanel(box) {
  box.innerHTML = `<div class="list">${allPages().map(p => { const f = S.files.get(p); return `<button class="item ${p === S.page ? 'on' : ''}" data-page="${esc(p)}" title="${esc(p)}">${f.dirty || f.isNew ? '<span class="dot" title="Changed"></span>' : ''}${esc(pageName(p))}${p.includes('/') ? `<span class="muted">${esc(dirOf(p))}</span>` : ''}</button>`; }).join('')}
    <button class="item" id="newPageBtn">${icon(I.plus)}New page</button></div>`;
  $$('[data-page]', box).forEach(b => b.onclick = () => switchPage(b.dataset.page));
  $('#newPageBtn', box).onclick = newPage;
}
function renderTabs() {
  if (!S.tabs.includes(S.page)) S.tabs.push(S.page);
  $('#docTabs').innerHTML = S.tabs.map(p => { const f = S.files.get(p) || {}; return `<button class="${p === S.page ? 'on' : ''}" data-tab="${esc(p)}">${esc(pageName(p))} @ ${Math.round(S.z * 100)}%${f.dirty ? ' •' : ''}${S.tabs.length > 1 ? `<span class="x" data-close="${esc(p)}" aria-label="Close tab">×</span>` : ''}</button>`; }).join('');
  $$('[data-tab]', $('#docTabs')).forEach(b => b.onclick = e => {
    const c = e.target.closest('[data-close]');
    if (c) { S.tabs = S.tabs.filter(t => t !== c.dataset.close); if (S.page === c.dataset.close) switchPage(S.tabs[0]); else renderTabs(); return; }
    switchPage(b.dataset.tab);
  });
}
function switchPage(p) {
  if (S.editing) finishTextEdit();
  S.page = p; S.sel = null; S.scroll = 0; S.showPopup = null; S.state = 'normal';
  if (!S.tabs.includes(p)) S.tabs.push(p);
  renderAll(); renderFrame(false); scheduleSave();
}
function newPage() {
  modal('New page', `<label class="field">Page name<input class="inp" id="npName" placeholder="e.g. Outreach"></label><p class="hint">It starts as a copy of the ${esc(pageName(S.page))} page so shared parts like the menu bar come along. Change anything after.</p>`,
    [['Cancel'], ['Make page', true, () => {
      const name = $('#npName').value.trim(); if (!name) { toast('Give the page a name first'); return false; }
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
      let p = (dirOf(S.page) ? dirOf(S.page) + '/' : '') + slug + '.html', n = 2;
      while (S.files.has(p)) p = p.replace(/(-\d+)?\.html$/, `-${n++}.html`);
      const html = serializeDoc(getDoc(S.page)).replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(name)}</title>`);
      S.undo.push(snapshot(`Made a new page called ${name}`));
      S.files.set(p, { kind: 'text', text: html, type: 'text/html', dirty: true, isNew: true });
      logChange(`Made a new page called ${name}`, name);
      switchPage(p);
    }]]);
}
function renderHistory(box) {
  const items = [['Opened the site', -1], ...S.undo.map((s, i) => [s.label, i])];
  const fut = S.redo.slice().reverse().map(s => s.label);
  box.innerHTML = `<div class="list history-list">${items.map(([l, i]) => `<button class="item ${i === S.undo.length - 1 ? 'on' : ''}" data-h="${i}">${esc(l)}</button>`).join('')}
    ${fut.map((l, j) => `<button class="item future" data-f="${j}">${esc(l)}</button>`).join('')}</div>
    <p class="panel-note">Click any step to jump back to it. Steps after it stay greyed out until you do something new.</p>`;
  $$('[data-h]', box).forEach(b => b.onclick = () => { const target = +b.dataset.h; let n = S.undo.length - 1 - target; while (n-- > 0) undo(); });
  $$('[data-f]', box).forEach(b => b.onclick = () => { let n = +b.dataset.f + 1; while (n-- > 0) redo(); });
  const on = $('.item.on', box); if (on) on.scrollIntoView({ block: 'nearest' });
}

/* ============ Team Kit ============ */
function renderTeamKit(box) {
  const colors = teamColors(), fonts = teamFonts();
  box.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;padding:12px"><span class="h">Team colors</span>
    <div class="swatches">${colors.map((c, i) => `<button class="swatch" data-tc="${i}" title="${esc(c.name)}: click to change it everywhere" aria-label="${esc(c.name)}" style="background:${esc(c.value)}"></button>`).join('')}
      <button class="swatch add" id="tkAddColor" title="Add a team color" aria-label="Add a team color">+</button></div>
    ${colors.length ? '<span class="hint" style="margin-top:-6px">Click a color to change it everywhere.</span>' : ''}
    <span class="h">Team fonts</span>
    <div style="display:flex;flex-direction:column;gap:4px">${fonts.map(f => `<button class="font-btn" data-tf="${esc(f)}" title="Use ${esc(f)} on the selection"><span style='font-family:${esc(fontStack(f))};font-size:14px'>${esc(f)}</span><small>Use</small></button>`).join('')}
      <button class="btn btn-dashed" id="tkAddFont">${icon(I.plus)}Add a team font</button></div></div>`;
  $$('[data-tc]', box).forEach(b => b.onclick = () => editColorModal(colors[+b.dataset.tc]));
  $('#tkAddColor', box).onclick = addColorModal;
  $('#tkAddFont', box).onclick = addFontModal;
  $$('[data-tf]', box).forEach(b => b.onclick = () => { if (!S.sel) { toast('Select some text first, then pick a font'); return; } setStyle('font-family', fontStack(b.dataset.tf), 'font'); });
}
function editColorModal(c) {
  const hex = resolvedHex(c.value);
  modal(`Change ${c.name}`, `<p class="hint">Everything on the site that uses ${esc(c.name)} will update.</p>
    <div style="display:flex;align-items:center;gap:12px"><input type="color" id="ecVal" value="${hex === 'transparent' ? '#000000' : hex}" style="width:64px;height:44px;padding:0;border:1px solid var(--line);background:none"><input class="inp num" id="ecHex" value="${hex}" style="width:120px"></div>`,
    [['Cancel'], ['Update everywhere', true, () => { const v = $('#ecHex').value.trim(); act(`Changed the team color ${c.name}`, () => setDecl(c.path, ':root', c.prop, v), { where: 'Every page', pageDirty: false, devLabel: false }); }]]);
  $('#ecVal').oninput = e => { $('#ecHex').value = e.target.value.toUpperCase(); };
}
function addColorModal() {
  modal('Add a team color', `<label class="field">Name<input class="inp" id="acName" placeholder="e.g. Sunset orange"></label>
    <div style="display:flex;align-items:center;gap:12px"><input type="color" id="acVal" value="#F05A28" style="width:64px;height:44px;padding:0;border:1px solid var(--line);background:none"><span class="hint">Pick the color</span></div>`,
    [['Cancel'], ['Add color', true, () => {
      const name = $('#acName').value.trim(); if (!name) { toast('Give the color a name'); return false; }
      const prop = '--' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const path = (teamColors()[0] || {}).path || mainSheet(true);
      act(`Added the team color ${name}`, () => setDecl(path, ':root', prop, $('#acVal').value.toUpperCase()), { where: 'Every page', pageDirty: false, devLabel: false });
    }]]);
}
const POPULAR_FONTS = ['Inter', 'Space Mono', 'Space Grotesk', 'IBM Plex Sans', 'IBM Plex Mono', 'Roboto Mono', 'JetBrains Mono', 'Rajdhani', 'Orbitron', 'Exo 2', 'Oswald', 'Barlow', 'Barlow Condensed', 'Archivo', 'Manrope', 'DM Sans', 'Sora', 'Work Sans', 'Rubik', 'Montserrat', 'Bebas Neue', 'Chakra Petch', 'Saira', 'Titillium Web', 'Merriweather', 'Playfair Display', 'Lora'];
function addFontModal() {
  modal('Add a team font', `<label class="field">Font name<input class="inp" id="afName" list="afList" placeholder="Start typing, e.g. Rajdhani"></label><datalist id="afList">${POPULAR_FONTS.map(f => `<option value="${f}">`).join('')}</datalist><p class="hint">Any font from Google Fonts works. Type its name exactly as it appears there.</p>`,
    [['Cancel'], ['Add font', true, () => {
      const name = $('#afName').value.trim(); if (!name) { toast('Type a font name first'); return false; }
      if (teamFonts().includes(name)) { toast(`${name} is already a team font`); return; }
      const path = mainSheet(true), line = `@import url('https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap');\n`;
      act(`Added the team font ${name}`, () => { const css = fileText(path) || '', m = css.match(/^@charset[^;]*;\s*/i); setText(path, m ? m[0] + line + css.slice(m[0].length) : line + css); }, { where: 'Every page', pageDirty: false, devLabel: false });
    }]]);
}

/* ============ Data panel: lists in your scripts ============ */
function findLists() {
  const out = [];
  for (const [p, f] of S.files) {
    if (!/\.js$/i.test(p) || /se-widgets/.test(p) || f.kind !== 'text') continue;
    const src = f.text;
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g)) {
      const start = m.index + m[0].length - 1;
      let depth = 0, i = start, q = null;
      for (; i < src.length; i++) {
        const c = src[i];
        if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; continue; }
        if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
        if (c === '[') depth++; else if (c === ']') { depth--; if (!depth) break; }
      }
      const body = src.slice(start, i + 1);
      let rows;
      try {
        const json = body.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/'((?:[^'\\]|\\.)*)'/g, (x, s) => JSON.stringify(s)).replace(/,(\s*[}\]])/g, '$1');
        rows = JSON.parse(json);
      } catch (e) { continue; }
      if (!Array.isArray(rows) || !rows.length || !rows.every(r => r && typeof r === 'object' && !Array.isArray(r) && Object.values(r).every(v => ['string', 'number', 'boolean'].includes(typeof v)))) continue;
      const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
      const quoted = /\[\s*\{\s*["']/.test(body);
      const indent = (body.match(/\n(\s*)\{/) || [, '  '])[1];
      out.push({ path: p, name: m[1], start, end: i + 1, rows, keys, quoted, indent });
    }
  }
  return out;
}
const isDateish = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
function writeList(L, rows) {
  const key = k => L.quoted ? JSON.stringify(k) : k;
  const body = '[\n' + rows.map(r => L.indent + '{ ' + L.keys.filter(k => r[k] !== undefined).map(k => `${key(k)}: ${JSON.stringify(r[k])}`).join(', ') + ' }').join(',\n') + '\n]';
  const src = fileText(L.path);
  act(`Updated the ${pretty(L.name).toLowerCase()} list`, () => setText(L.path, src.slice(0, L.start) + body + src.slice(L.end)), { render: false, where: 'Every page', pageDirty: false, devLabel: false });
}
function renderData(box) {
  const lists = findLists();
  if (!lists.length) { box.innerHTML = '<p class="panel-note">No lists found in your site’s scripts. Lists like a competition schedule show up here so you can edit them without code.</p>'; return; }
  box.innerHTML = lists.map((L, li) => `<div class="sec open"><div class="sec-h">${esc(pretty(L.name))}<span class="hint" style="margin-left:auto;font-weight:400">${esc(L.path)}</span></div><div class="sec-b">
    ${L.rows.map((r, ri) => `<div class="box"><div class="row"><span class="h">Row ${ri + 1}</span><button class="icon-btn" style="border:0" data-del="${li}|${ri}" aria-label="Remove row ${ri + 1}">${icon(I.x)}</button></div>${L.keys.map(k => `<label class="field">${esc(pretty(k))}<input class="inp ${isDateish(r[k]) ? 'num' : ''}" ${isDateish(r[k]) ? 'type="datetime-local"' : ''} data-li="${li}" data-ri="${ri}" data-k="${esc(k)}" value="${esc(isDateish(r[k]) ? String(r[k]).slice(0, 16) : r[k] ?? '')}"></label>`).join('')}</div>`).join('')}
    <button class="btn btn-dashed" data-add="${li}">${icon(I.plus)}Add a row</button>
    <p class="hint">Your site’s own code reads this list, so changes show in Preview and on the live site.</p></div></div>`).join('');
  $$('[data-li]', box).forEach(inp => inp.onchange = () => {
    const L = lists[+inp.dataset.li], rows = JSON.parse(JSON.stringify(L.rows)), old = L.rows[+inp.dataset.ri][inp.dataset.k];
    let v = inp.value; if (isDateish(old) && v) v = v + String(old).slice(16); if (typeof old === 'number') v = parseFloat(v);
    rows[+inp.dataset.ri][inp.dataset.k] = v; writeList(L, rows);
  });
  $$('[data-del]', box).forEach(b => b.onclick = () => { const [li, ri] = b.dataset.del.split('|').map(Number); const L = lists[li], rows = L.rows.filter((_, i) => i !== ri); writeList(L, rows); });
  $$('[data-add]', box).forEach(b => b.onclick = () => { const L = lists[+b.dataset.add], rows = JSON.parse(JSON.stringify(L.rows)); rows.push(Object.assign({}, rows[rows.length - 1])); writeList(L, rows); });
}
