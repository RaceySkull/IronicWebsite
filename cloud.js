/* Orbyt Designs: team sites in the cloud.
   editor.html?site=<id> loads a team's site from Supabase instead of from the
   computer, saves every change back to the team, shows who's on which page,
   and keeps one editor per page (the Base plan rule).
   The database rules in supabase.sql enforce who may change what; the checks
   here only explain it in the editor so nobody is surprised. */
'use strict';
(function () {
  const params = new URLSearchParams(location.search);
  const siteId = params.get('site');
  if (!siteId) return;                                      // local mode: nothing changes
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) { location.replace('app.html'); return; }
  const sb = Orbyt.sb;
  const C = S.cloud = { siteId, teamId: null, user: null, name: '', color: '#CA374D', member: null, presence: {}, channel: null,
    since: Date.now(), yielded: false, lastAct: Date.now(), saving: false, again: false, sent: 0, styDirty: new Set(), dismissed: null };
  const BUCKET = 'sites';
  const objKey = p => `${C.teamId}/${C.siteId}/${p}`;

  /* ---------- Permissions (mirrors can() in supabase.sql) ---------- */
  function can(perm) {
    const m = C.member; if (!m) return false;
    if (m.role === 'owner') return true;
    if (m.role === 'admin') return perm !== 'delete_team';
    if (m.role === 'editor') {
      if (['view', 'comment', 'edit', 'media'].includes(perm)) return true;
      if (['kit', 'data', 'download'].includes(perm)) return (m.perms || {})[perm] !== false;
      return false;
    }
    return m.role === 'viewer' && ['view', 'comment'].includes(perm);
  }
  C.can = can;
  function holderOf(page) {
    const here = Object.values(C.presence).filter(p => p.page === page && !p.yielded);
    here.sort((a, b) => a.since - b.since || String(a.uid).localeCompare(String(b.uid)));
    return here[0] || null;
  }
  /* Why this page can't be edited right now, or null if it can */
  function roReason() {
    if (!C.member) return { kind: 'loading', text: 'Still opening the site…' };
    if (!can('edit')) return { kind: 'viewer', text: 'You’re a Viewer on this team, so you can look around but not change anything.' };
    const pages = C.member.pages;
    if (pages && pages.length && S.page && !pages.includes(S.page)) return { kind: 'pages', text: `You can look at this page, but your team set you to edit only ${pages.length === 1 ? '1 page' : pages.length + ' pages'}.` };
    if (C.channel && C.presenceReady) {
      const h = holderOf(S.page);
      if (h && h.uid !== C.user.id) return { kind: 'locked', text: `${h.name} is editing this page.`, holder: h };
      if (C.yielded) return { kind: 'yielded', text: 'You handed this page over. Take it back when nobody else is editing it.' };
    }
    return null;
  }
  C.roReason = roReason;
  function blocked(quiet) { const r = roReason(); if (r && !quiet) toast(r.kind === 'locked' ? `${r.text} Ask to take over, or edit a different page.` : r.text, 4000); return r; }

  /* ---------- Wrap the editor so nothing changes while read-only ---------- */
  const _act = act;
  act = function (label, fn, opts) { if (blocked()) { renderBanner(); return; } C.lastAct = Date.now(); return _act(label, fn, opts); };
  const _onDown = onCanvasDown;
  onCanvasDown = function (e) {
    if (!roReason()) { C.lastAct = Date.now(); return _onDown(e); }
    if (e.button !== 0) return;
    e.preventDefault(); hideCtx();
    if (S.tool === 'hand' || S.spaceHand) { startPan(e); return; }
    const t = pickAt(e.clientX, e.clientY);
    select(t ? t.getAttribute('data-se-id') : null);
  };
  for (const name of ['startTextEdit', 'insertAt', 'undo', 'redo', 'duplicateSel', 'deleteSel', 'deleteMulti', 'nudge', 'turnInto', 'restack', 'freeWholePage', 'linkImageFromComputer', 'importUpload', 'alignSel', 'groupSel', 'groupMulti', 'makeShared', 'toggleLock']) {
    const orig = window[name]; if (typeof orig !== 'function') continue;
    window[name] = function (...a) { if (blocked()) return; return orig.apply(this, a); };
  }
  /* Team colors and fonts, the Data panel, and downloading each have their own switch */
  for (const [name, perm, msg] of [['editColorModal', 'kit', 'team colors'], ['addColorModal', 'kit', 'team colors'], ['addFontModal', 'kit', 'team fonts'], ['writeList', 'data', 'lists like the schedule'], ['openDownload', 'download', 'downloading']]) {
    const orig = window[name]; if (typeof orig !== 'function') continue;
    window[name] = function (...a) { if (!can(perm)) { toast(`Your team hasn’t turned on ${msg} for you. Ask an admin.`, 4000); return; } return orig.apply(this, a); };
  }
  /* Menus and panels kept references to the original functions; point them at the checked versions */
  Object.assign(CMD, { undo: () => undo(), redo: () => redo(), duplicate: () => duplicateSel(), delete: () => deleteSel(), download: () => openDownload(),
    front: () => restack('front'), forward: () => restack('forward'), backward: () => restack('backward'), back: () => restack('back'),
    lockAll: () => toggleLock(S.sel, 'all'), lockPos: () => toggleLock(S.sel, 'position'), unlock: () => toggleLock(S.sel, ''), share: () => makeShared(),
    linkImage: () => linkImageFromComputer(S.sel ? rEl(S.sel) : null, S.ctxAt) });
  PANELS.pages.render = b => renderPagesPanel(b);
  const _setTool = setTool;
  setTool = function (t) { if (!['select', 'direct', 'hand', 'zoom'].includes(t) && blocked()) return; return _setTool(t); };
  const _switchPage = switchPage;
  switchPage = function (p) {
    C.since = Date.now(); C.yielded = false; C.dismissed = null;
    _switchPage(p); track(); renderBanner();
  };
  const _openAnother = openAnother;
  openAnother = function () { location.href = 'app.html'; };
  const _forget = forgetSite;
  forgetSite = function () { toast('This site is saved to your team. Remove it from the team page instead.'); };
  const _doDownload = doDownload;
  doDownload = async function (all) {
    await _doDownload(all);
    const { error } = await sb.rpc('mark_downloaded', { s: C.siteId });
    if (error) toast(Orbyt.errText(error), 5000);
    scheduleSave();
  };
  /* se-styles.css is shared by every page. Remember which rules we changed, so a teammate's
     save on another page can be merged in instead of one of us losing work. */
  const _putSty = putSty;
  putSty = function (sel, props, dev = S.device) { C.styDirty.add(dev + '|' + sel); return _putSty(sel, props, dev); };

  /* ---------- Banner ---------- */
  function renderBanner() {
    const b = document.getElementById('roBanner'); if (!b) return;
    const r = roReason();
    if (!r || r.kind === 'loading' || C.dismissed === S.page + '|' + r.kind) { b.hidden = true; document.body.classList.remove('se-readonly'); return; }
    document.body.classList.add('se-readonly');
    const h = r.holder;
    b.innerHTML = `${h ? `<span class="who"><span style="background:${h.color}">${esc(Orbyt.initials(h.name))}</span></span>` : ''}<strong>${esc(r.text)}</strong><span>Look only.</span><span class="spacer"></span>
      ${r.kind === 'locked' ? '<button class="btn btn-primary" id="roAsk">Ask to take over</button>' : ''}
      ${r.kind === 'yielded' ? '<button class="btn btn-primary" id="roTake">Take it back</button>' : ''}
      ${r.kind !== 'viewer' ? '<button class="btn" id="roOther">Edit a different page</button>' : ''}
      <button class="btn" id="roHide">Hide this</button>`;
    b.hidden = false;
    const ask = document.getElementById('roAsk');
    if (ask) ask.onclick = () => { send('ask', { page: S.page, to: h.uid, from: C.user.id, fromName: C.name }); toast(`Asked ${h.name}. You’ll get the page if they hand it over.`, 4000); ask.disabled = true; };
    const take = document.getElementById('roTake');
    if (take) take.onclick = () => { const hh = holderOf(S.page); if (hh && hh.uid !== C.user.id) { toast(`${hh.name} is editing it now. Ask them instead.`); return; } C.yielded = false; C.since = Date.now(); track(); renderBanner(); };
    const other = document.getElementById('roOther');
    if (other) other.onclick = () => showPanel('pages');
    document.getElementById('roHide').onclick = () => { C.dismissed = S.page + '|' + r.kind; renderBanner(); };
  }
  C.renderBanner = renderBanner;

  /* ---------- Presence: who is where ---------- */
  function track() {
    if (!C.channel) return;
    C.channel.track({ uid: C.user.id, name: C.name, color: C.color, page: S.page, since: C.since, yielded: C.yielded }).catch(() => {});
  }
  function send(event, payload) { if (C.channel) C.channel.send({ type: 'broadcast', event, payload }).catch(() => {}); }
  function onPresence() {
    const st = C.channel.presenceState(), out = {};
    for (const [key, metas] of Object.entries(st)) { const m = metas[metas.length - 1]; if (m && m.uid) out[key] = m; }
    C.presence = out; C.presenceReady = true;
    renderWho(); renderBanner(); renderPanels();
  }
  function renderWho() {
    const box = document.getElementById('who'); if (!box) return;
    const people = Object.values(C.presence);
    box.innerHTML = people.map(p => `<span title="${esc(p.name)}${p.uid === C.user.id ? ' (you)' : ''} · ${esc(pageName(p.page || ''))}${holderOf(p.page) && holderOf(p.page).uid === p.uid ? ' · editing' : ' · looking'}" style="background:${p.color};${p.color === '#CA374D' ? 'color:#fff' : ''}">${esc(Orbyt.initials(p.name))}</span>`).join('');
  }
  /* Pages panel shows who's on each page */
  const _renderPages = renderPagesPanel;
  renderPagesPanel = function (box) {
    _renderPages(box);
    for (const b of box.querySelectorAll('[data-page]')) {
      const h = holderOf(b.dataset.page);
      if (h && h.uid !== C.user.id) b.insertAdjacentHTML('beforeend', `<span class="muted" style="margin-left:auto">${esc(h.name.split(' ')[0])} is editing</span>`);
    }
  };
  /* After 10 quiet minutes, let someone else have the page */
  setInterval(() => {
    const h = holderOf(S.page);
    if (h && h.uid === C.user.id && !C.yielded && Date.now() - C.lastAct > 10 * 60 * 1000) { C.yielded = true; track(); renderBanner(); }
  }, 30000);
  ['mousedown', 'keydown'].forEach(ev => document.addEventListener(ev, () => {
    C.lastAct = Date.now();
    if (C.yielded && C.presenceReady) { const h = holderOf(S.page); if (!h) { C.yielded = false; C.since = Date.now(); track(); } }
  }, true));

  function onAsk({ payload }) {
    if (!payload || payload.to !== C.user.id || payload.page !== S.page) return;
    modal('Hand over this page?', `<p><strong>${esc(payload.fromName || 'A teammate')}</strong> wants to edit the ${esc(pageName(S.page))} page.</p><p class="hint">Your changes so far are saved. You can still look around after handing it over.</p>`,
      [['Keep editing'], ['Hand it over', true, () => { C.yielded = true; track(); send('handover', { page: S.page, to: payload.from }); renderBanner(); }]]);
  }
  function onHandover({ payload }) { if (payload && payload.to === C.user.id && payload.page === S.page) toast('It’s yours. You can edit this page now.', 4000); }

  /* ---------- Teammates' saves ---------- */
  async function download(path) {
    const { data, error } = await sb.storage.from(BUCKET).download(objKey(path));
    if (error) throw error;
    return data;
  }
  async function onSaved({ payload }) {
    if (!payload || payload.by === C.user.id || !Array.isArray(payload.paths)) return;
    let rerender = false, cssTouched = [];
    for (const path of payload.paths.slice(0, 500)) {
      if (typeof path !== 'string' || !cleanPath(path)) continue;
      try {
        if (payload.removed && payload.removed.includes(path)) { S.files.delete(path); S.docs.delete(path); continue; }
        const blob = await download(path), f = S.files.get(path), mine = f && f.v !== f.cv;
        if (path === SE_CSS) {
          const remote = parseSty(await blob.text());
          for (const k of C.styDirty) { const [dev, ...rest] = k.split('|'); const sel = rest.join('|'); if (S.sty[dev][sel]) remote[dev][sel] = S.sty[dev][sel]; else delete remote[dev][sel]; }
          S.sty = remote; const text = genSty();
          if (f) { f.text = text; } else S.files.set(path, { kind: 'text', text, type: 'text/css', dirty: true, isNew: false });
          const nf = S.files.get(path); nf.v = (nf.v || 0) + 1; if (!C.styDirty.size) nf.cv = nf.v;
          S.cssVer.set(path, (S.cssVer.get(path) || 0) + 1); S.fv++; cssTouched.push(path); continue;
        }
        if (mine && !isPage(path)) { toast(`${payload.name || 'A teammate'} also changed ${path}. Your version will be saved over theirs.`, 6000); continue; }
        if (mine && isPage(path)) continue;   // the page lock means this shouldn't happen; keep ours
        const isText = TEXT_EXT.test(path);
        const nf = { kind: isText ? 'text' : 'blob', type: mimeOf(path), dirty: true, isNew: !f };
        if (isText) nf.text = await blob.text(); else nf.blob = blob;
        nf.v = (f ? f.v || 0 : 0) + 1; nf.cv = nf.v;
        S.files.set(path, nf); S.assetCache.delete(path); S.fv++;
        if (isCss(path)) { S.cssVer.set(path, (S.cssVer.get(path) || 0) + 1); cssTouched.push(path); }
        if (isPage(path)) { S.docs.delete(path); if (path === S.page) rerender = true; }
      } catch (e) { /* skip files that fail; the next save event brings them */ }
    }
    if (rerender) { S.sel = null; renderFrame(); }
    else cssTouched.forEach(p => refreshCss(p));
    renderAll();
  }

  /* ---------- Saving to the team ---------- */
  const _saveNow = saveNow;
  saveNow = async function () {
    if (!C.member) return;
    if (C.saving) { C.again = true; return; }
    C.saving = true;
    const state = document.getElementById('saveState');
    try {
      for (const p of S.docDirty) { const d = S.docs.get(p), f = S.files.get(p); if (d && f) { const html = serializeDoc(d); if (html !== f.text) { f.text = html; f.v = (f.v || 0) + 1; } } }
      S.docDirty.clear();
      const changed = [...S.files].filter(([, f]) => f.v !== f.cv);
      const removed = (S.removedKeys || []).filter(k => k.startsWith('f:')).map(k => k.slice(2)).filter(p => !S.files.has(p));
      S.removedKeys = [];
      const newChanges = S.changes.slice(Math.min(C.sent, S.changes.length));
      if (!changed.length && !removed.length && !newChanges.length) { state.textContent = 'Saved to your team'; return; }
      if (!can('edit')) { state.textContent = 'Look only'; return; }
      state.textContent = 'Saving to your team…';
      const rows = [];
      for (const [path, f] of changed) {
        const v = f.v;
        const body = f.kind === 'text' ? new Blob([f.text], { type: mimeOf(path) }) : f.blob;
        const { error } = await sb.storage.from(BUCKET).upload(objKey(path), body, { upsert: true, contentType: mimeOf(path) });
        if (error) throw error;
        f.cv = v;
        if (path === SE_CSS) C.styDirty.clear();
        rows.push({ site_id: C.siteId, path, size: body.size, changed: true, updated_at: new Date().toISOString(), updated_by: C.user.id });
      }
      if (rows.length) { const { error } = await sb.from('site_files').upsert(rows); if (error) throw error; }
      if (removed.length) {
        await sb.storage.from(BUCKET).remove(removed.map(objKey));
        await sb.from('site_files').delete().eq('site_id', C.siteId).in('path', removed);
      }
      if (newChanges.length) {
        const { error } = await sb.from('site_changes').insert(newChanges.map(c => ({ site_id: C.siteId, user_id: C.user.id, text: String(c.text).slice(0, 300), place: String(c.where || '').slice(0, 120) })));
        if (error) throw error;
      }
      C.sent = S.changes.length;
      await sb.from('sites').update({ updated_at: new Date().toISOString() }).eq('id', C.siteId);
      send('saved', { by: C.user.id, name: C.name, paths: rows.map(r => r.path).concat(removed), removed });
      state.textContent = 'Saved to your team';
    } catch (e) {
      state.textContent = 'Couldn’t save. Trying again…';
      console.warn('Orbyt save failed', e);
      setTimeout(() => scheduleSave(), 5000);
      if (/permission|row-level/i.test((e && e.message) || '')) toast(Orbyt.errText(e), 5000);
    } finally {
      C.saving = false;
      if (C.again) { C.again = false; scheduleSave(); }
    }
  };
  window.addEventListener('beforeunload', e => {
    const pending = [...S.files.values()].some(f => f.v !== f.cv) || S.docDirty.size || C.saving;
    if (pending) { saveNow(); e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- Opening the site ---------- */
  async function open() {
    $('#welcome').hidden = false;
    $('.welcome-card').innerHTML = `<div class="loading-card"><div class="brand"><span class="logo" style="width:32px;height:32px"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="4.2" fill="none" stroke="#fff" stroke-width="1.8" transform="rotate(-28 12 12)"/><circle cx="12" cy="12" r="3.6" fill="#fff"/></svg></span><span class="brand-name" style="font-size:20px">ORBYT<small>DESIGNS</small></span></div>
      <h1 id="ldTitle">Opening your site…</h1><div class="progress"><span id="ldBar"></span></div><p id="ldText">Signing you in</p><p id="ldErr" class="error" role="alert" hidden></p></div>`;
    const fail = msg => { $('#ldErr').innerHTML = `${esc(msg)} <a href="app.html">Back to your team</a>`; $('#ldErr').hidden = false; };
    try {
      const s = await Orbyt.requireSession(); if (!s) return;
      C.user = s.user;
      const { data: site, error: e1 } = await sb.from('sites').select('id, name, team_id, teams(name)').eq('id', C.siteId).maybeSingle();
      if (e1) throw e1;
      if (!site) { fail('This site doesn’t exist, or you’re not on its team.'); return; }
      C.teamId = site.team_id;
      $('#ldTitle').textContent = `Opening ${site.name}…`;
      const [{ data: mem, error: e2 }, { data: prof }] = await Promise.all([
        sb.from('team_members').select('role, perms, pages').eq('team_id', C.teamId).eq('user_id', C.user.id).maybeSingle(),
        sb.from('profiles').select('display_name').eq('id', C.user.id).maybeSingle()]);
      if (e2) throw e2;
      if (!mem) { fail('You’re not on this site’s team.'); return; }
      C.name = (prof && prof.display_name) || (C.user.email || 'Teammate').split('@')[0];
      C.color = Orbyt.colorFor(C.user.id);
      const { data: files, error: e3 } = await sb.from('site_files').select('path, size, changed').eq('site_id', C.siteId);
      if (e3) throw e3;
      if (!files.length) { fail('This site has no files yet.'); return; }
      let done = 0;
      const flags = new Map(files.map(f => [f.path, f.changed]));
      const entries = files.filter(f => cleanPath(f.path)).map(f => ({ path: f.path, size: f.size, read: async asText => {
        const blob = await download(f.path);
        done++; $('#ldBar').style.width = Math.round(done / files.length * 100) + '%'; $('#ldText').textContent = `Loading ${done} of ${files.length} files`;
        return asText ? { text: await blob.text() } : { blob: new Blob([blob], { type: mimeOf(f.path) }) };
      } }));
      /* Download in parallel, then hand the files to the editor in order */
      const cache = new Map(), queue = entries.slice();
      await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) { const e = queue.shift(); cache.set(e.path, await e.read(TEXT_EXT.test(e.path))); } }));
      const ready = entries.map(e => ({ path: e.path, size: e.size, read: async () => cache.get(e.path) }));
      const { data: ch } = await sb.from('site_changes').select('text, place, at').eq('site_id', C.siteId).eq('downloaded', false).order('at').limit(500);
      C.member = mem;
      await loadEntries(ready, { name: site.name, quiet: true, beforeOpen: () => {
        for (const [p, f] of S.files) { f.cv = f.v; f.sv = f.v; f.dirty = !!flags.get(p); f.isNew = false; }
        S.changes = (ch || []).map(c => ({ text: c.text, where: c.place, at: Date.parse(c.at) }));
        C.sent = S.changes.length;
      } });
      const chip = document.getElementById('siteChip');
      chip.hidden = false; chip.textContent = `${(site.teams && site.teams.name) || 'Team'} · ${site.name}`; chip.title = 'Back to your team';
      document.title = `${site.name} · Orbyt Designs`;
      $('#saveState').textContent = 'Saved to your team';
      if (!can('edit')) document.querySelectorAll('[data-cmd="download"]').forEach(b => { if (!can('download')) b.hidden = true; });
      if (!can('download')) document.querySelectorAll('[data-cmd="download"]').forEach(b => { b.hidden = true; });
      connect();
      renderBanner();
    } catch (e) { fail(Orbyt.errText(e)); }
  }
  function connect() {
    try {
      C.channel = sb.channel('site:' + C.siteId, { config: { private: true, presence: { key: C.user.id } } });
      C.channel.on('presence', { event: 'sync' }, onPresence)
        .on('broadcast', { event: 'ask' }, onAsk)
        .on('broadcast', { event: 'handover' }, onHandover)
        .on('broadcast', { event: 'saved' }, onSaved)
        .subscribe(status => {
          if (status === 'SUBSCRIBED') track();
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { C.channel = null; renderBanner(); toast('Couldn’t connect live, so you won’t see teammates on pages right now. Your changes still save.', 6000); }
        });
    } catch (e) { C.channel = null; }
  }
  open();
})();
