/* Orbyt Designs: team page.
   Every read and write here is also checked by the database rules in supabase.sql,
   so hiding a button is only for clarity; it isn't what keeps things safe. */
'use strict';
const { sb, esc, toast, errText } = Orbyt;
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));
const A = { user: null, profile: null, teams: [], team: null, tab: 'sites', base: location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '') };

/* Mirrors can() in supabase.sql so the page only shows what you can actually do */
function can(m, perm) {
  if (!m) return false;
  if (m.role === 'owner') return true;
  if (m.role === 'admin') return perm !== 'delete_team';
  if (m.role === 'editor') {
    if (['view', 'comment', 'edit', 'media'].includes(perm)) return true;
    if (['kit', 'data', 'download'].includes(perm)) return (m.perms || {})[perm] !== false;
    return false;
  }
  return m.role === 'viewer' && ['view', 'comment'].includes(perm);
}
const ROLE_WORDS = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
const ROLE_A = { owner: 'the Owner', admin: 'an Admin', editor: 'an Editor', viewer: 'a Viewer' };
const ROLE_HELP = { admin: 'Edits, downloads, invites people and changes roles', editor: 'Edits pages and photos', viewer: 'Can look around but not change anything' };
const avatar = (name, id, size = 32) => { const c = Orbyt.colorFor(id); return `<span class="avatar" style="width:${size}px;height:${size}px;background:${c};${c === '#CA374D' ? 'color:#fff' : ''}" aria-hidden="true">${esc(Orbyt.initials(name))}</span>`; };
const when = t => { const d = new Date(t), s = (Date.now() - d) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' hr ago'; if (s < 604800) return Math.round(s / 86400) + ' days ago'; return d.toLocaleDateString(); };

function modal(title, html, buttons = [['Close']]) {
  const w = $('#modal'), c = $('.modal-card', w);
  c.innerHTML = `<h2 id="modalTitle">${esc(title)}</h2>${html}<div class="modal-foot">${buttons.map(([l, p], i) => `<button class="btn ${p ? 'btn-primary' : ''}" data-mb="${i}">${esc(l)}</button>`).join('')}</div>`;
  w.hidden = false;
  const close = () => { w.hidden = true; c.innerHTML = ''; };
  $$('[data-mb]', c).forEach(b => b.onclick = async () => {
    const fn = buttons[+b.dataset.mb][2];
    if (!fn) return close();
    b.disabled = true;
    try { if ((await fn(c)) !== false) close(); } catch (e) { toast(errText(e), 5000); } finally { b.disabled = false; }
  });
  w.onclick = e => { if (e.target === w) close(); };
  document.onkeydown = e => { if (e.key === 'Escape' && !w.hidden) close(); };
  const f = $('input, select, textarea', c); if (f) setTimeout(() => f.focus(), 30);
  return { card: c, close };
}

/* ---------- Boot ---------- */
(async function boot() {
  $('#logo').innerHTML = Orbyt.LOCKUP(22).replace(/^<span class="lockup"[^>]*>|<\/span>$/g, '');
  if (!sb) { $('#main').innerHTML = `<p class="error">${esc(Orbyt.setupProblem() || 'Sign-in couldn’t start. Refresh the page to try again.')}</p>`; return; }
  const s = await Orbyt.requireSession(); if (!s) return;
  A.user = s.user;
  sb.auth.onAuthStateChange((ev, sess) => { if (ev === 'SIGNED_OUT' || !sess) location.href = 'index.html'; });
  try {
    const { data: prof } = await sb.from('profiles').select('id, display_name').eq('id', A.user.id).maybeSingle();
    A.profile = prof || { id: A.user.id, display_name: (A.user.email || '').split('@')[0] };
    renderAccount();
    const params = new URLSearchParams(location.search);
    const invite = params.get('invite');
    if (invite && /^[a-f0-9]{16,64}$/i.test(invite)) { await showInvite(invite); return; }
    await loadTeams(params.get('team'));
  } catch (e) { $('#main').innerHTML = `<p class="error">${esc(errText(e))}</p>`; }
})();

function renderAccount() {
  const name = A.profile.display_name || A.user.email;
  $('#account').innerHTML = `<div class="acct"><button id="acctBtn" aria-haspopup="true" aria-expanded="false">${avatar(name, A.user.id)}<span>${esc(name)}</span></button>
    <div class="menu" id="acctMenu" hidden><button id="mName">Change my name</button><button id="mOut">Sign out</button></div></div>`;
  const btn = $('#acctBtn'), menu = $('#acctMenu');
  btn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); };
  document.addEventListener('click', () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
  $('#mOut').onclick = async () => { await sb.auth.signOut(); location.href = 'index.html'; };
  $('#mName').onclick = () => editName();
}
function editName(firstTime) {
  modal(firstTime ? 'What should teammates call you?' : 'Change my name', `<label class="field">Your name<input class="inp" id="nm" maxlength="60" value="${esc(A.profile.display_name || '')}" placeholder="e.g. Chase M."></label><p class="muted" style="margin:0;font-size:14px">Shown next to your changes and your cursor.</p>`,
    [['Cancel'], ['Save', true, async c => {
      const v = $('#nm', c).value.trim(); if (!v) { toast('Type a name first'); return false; }
      const { error } = await sb.from('profiles').upsert({ id: A.user.id, display_name: v }); if (error) throw error;
      A.profile.display_name = v; renderAccount(); toast('Saved');
    }]]);
}

/* ---------- Invites ---------- */
async function showInvite(token) {
  const { data, error } = await sb.rpc('invite_info', { invite_token: token });
  const info = data && data[0];
  const main = $('#main');
  if (error || !info) { main.innerHTML = `<div class="card" style="max-width:560px"><h1>Invite not found</h1><p class="muted">This invite link isn’t valid. Ask whoever sent it for a new one.</p><a class="btn" href="app.html">Go to your teams</a></div>`; return; }
  if (info.used || info.expired) { main.innerHTML = `<div class="card" style="max-width:560px"><h1>${info.used ? 'This invite was already used' : 'This invite has expired'}</h1><p class="muted">Ask someone on ${esc(info.team_name)} for a new link.</p><a class="btn" href="app.html">Go to your teams</a></div>`; return; }
  main.innerHTML = `<div class="card" style="max-width:560px;display:flex;flex-direction:column;gap:16px">
    <span class="label">You’re invited</span><h1>Join ${esc(info.team_name)}${info.team_number ? ' <span class="muted">' + esc(info.team_number) + '</span>' : ''}</h1>
    <p style="margin:0">${info.invited_by ? `<strong>${esc(info.invited_by)}</strong> invited you as ` : 'You’re invited as '}<strong>${ROLE_WORDS[info.role]}</strong>. ${esc(ROLE_HELP[info.role] || '')}.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="acc">Join the team</button><a class="btn" href="app.html">Not now</a></div>
    <p class="error" id="accErr" hidden></p></div>`;
  $('#acc').onclick = async () => {
    $('#acc').disabled = true;
    const { data: tid, error: e2 } = await sb.rpc('accept_invite', { invite_token: token });
    if (e2) { $('#accErr').textContent = errText(e2); $('#accErr').hidden = false; $('#acc').disabled = false; return; }
    history.replaceState(null, '', 'app.html');
    toast(`Welcome to ${info.team_name}!`);
    await loadTeams(tid);
    if (!A.profile.display_name || A.profile.display_name === (A.user.email || '').split('@')[0]) editName(true);
  };
}

/* ---------- Teams home ---------- */
const TEAM_FORM = (name = '', tag = '') => `<label class="field">Team name<input class="inp" id="tn" maxlength="80" value="${esc(name)}" placeholder="e.g. Marketing, Robotics Club, Smith Family"></label>
  <label class="field">Short tag (optional)<input class="inp" id="tnum" maxlength="20" value="${esc(tag)}" placeholder="e.g. 14226, Spring 2027, HQ"></label>`;
async function loadTeams(open) {
  const { data, error } = await sb.from('team_members').select('team_id, role, perms, pages, pinned, archived, last_opened, teams(id, name, number)').eq('user_id', A.user.id);
  if (error) throw error;
  A.teams = (data || []).filter(m => m.teams).map(m => ({ ...m, name: m.teams.name, number: m.teams.number }));
  const ids = A.teams.map(t => t.team_id);
  A.counts = {};
  if (ids.length) {
    const [{ data: mem }, { data: sites }] = await Promise.all([
      sb.from('team_members').select('team_id').in('team_id', ids),
      sb.from('sites').select('team_id').in('team_id', ids)]);
    for (const t of ids) A.counts[t] = { members: (mem || []).filter(r => r.team_id === t).length, sites: (sites || []).filter(r => r.team_id === t).length };
  }
  const t = open && A.teams.find(x => x.team_id === open);
  if (t) openTeam(t); else renderHome();
}
function setUrl(team) { history.replaceState(null, '', team ? 'app.html?team=' + team : 'app.html'); }
function renderHome() {
  A.team = null; setUrl(null); $('#teamSwitch').hidden = true;
  let sort = 'recent', showArch = false;
  try { sort = localStorage.getItem('orbyt-sort') || 'recent'; } catch (e) { /* ignore */ }
  const draw = () => {
    const list = A.teams.filter(t => !!t.archived === showArch);
    const by = { recent: (a, b) => String(b.last_opened || '').localeCompare(String(a.last_opened || '')), name: (a, b) => a.name.localeCompare(b.name), role: (a, b) => ['owner', 'admin', 'editor', 'viewer'].indexOf(a.role) - ['owner', 'admin', 'editor', 'viewer'].indexOf(b.role) }[sort];
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || by(a, b));
    const nArch = A.teams.filter(t => t.archived).length;
    $('#main').innerHTML = `<div class="head"><div><span class="label">Home</span><h1>${showArch ? 'Archived teams' : 'Your teams'}</h1></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="join">Join a team</button><button class="btn btn-primary" id="mkTeam">New team</button></div></div>
      ${A.teams.length ? `<div class="toolbar"><label class="field" style="flex-direction:row;align-items:center;gap:8px">Sort<select class="inp" id="sortSel" style="width:auto;min-height:36px">
        <option value="recent" ${sort === 'recent' ? 'selected' : ''}>Recently opened</option><option value="name" ${sort === 'name' ? 'selected' : ''}>Name</option><option value="role" ${sort === 'role' ? 'selected' : ''}>My role</option></select></label>
        ${nArch || showArch ? `<button class="btn btn-small" id="archToggle">${showArch ? 'Back to your teams' : `Archived (${nArch})`}</button>` : ''}</div>` : ''}
      ${list.length ? `<div class="grid">${list.map(t => { const c = A.counts[t.team_id] || { members: 0, sites: 0 }; return `<div class="card team-card" data-open="${t.team_id}" tabindex="0" role="button" aria-label="Open ${esc(t.name)}">
        <div style="display:flex;align-items:flex-start;gap:12px">${avatar(t.name, t.team_id, 44)}<div style="flex:1;min-width:0"><strong class="tname">${esc(t.name)}</strong>${t.number ? `<div class="muted" style="font-size:14px">${esc(t.number)}</div>` : ''}</div>
        <button class="icon-btn ${t.pinned ? 'on' : ''}" data-pin="${t.team_id}" aria-label="${t.pinned ? 'Unpin' : 'Pin to top'}" title="${t.pinned ? 'Unpin' : 'Pin to top'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4z M12 13v8"/></svg></button></div>
        <div class="muted" style="font-size:14px">${c.sites} site${c.sites === 1 ? '' : 's'} · ${c.members} member${c.members === 1 ? '' : 's'} · ${t.last_opened ? 'opened ' + when(t.last_opened) : 'not opened yet'}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="tag ${t.role === 'owner' ? 'owner' : ''}">${ROLE_WORDS[t.role]}</span><button class="btn btn-small" data-arch="${t.team_id}">${t.archived ? 'Unarchive' : 'Archive'}</button></div></div>`; }).join('')}</div>`
      : `<div class="empty">${showArch ? 'Nothing archived.' : `<strong style="color:var(--text)">You’re not on any teams yet.</strong>Make one for your group’s website, or join one with an invite link someone sent you.<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="mkTeam2">Create a team</button><button class="btn" id="join2">Join with an invite link</button></div>`}</div>`}`;
    for (const id of ['mkTeam', 'mkTeam2']) { const b = $('#' + id); if (b) b.onclick = newTeam; }
    for (const id of ['join', 'join2']) { const b = $('#' + id); if (b) b.onclick = joinTeam; }
    const ss = $('#sortSel'); if (ss) ss.onchange = () => { sort = ss.value; try { localStorage.setItem('orbyt-sort', sort); } catch (e) { /* ignore */ } draw(); };
    const at = $('#archToggle'); if (at) at.onclick = () => { showArch = !showArch; draw(); };
    $$('[data-open]').forEach(c => { const go = () => openTeam(A.teams.find(t => t.team_id === c.dataset.open)); c.onclick = go; c.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    $$('[data-pin]').forEach(b => b.onclick = async e => { e.stopPropagation(); const t = A.teams.find(x => x.team_id === b.dataset.pin); if (await savePref(t, { pinned: !t.pinned })) draw(); });
    $$('[data-arch]').forEach(b => b.onclick = async e => { e.stopPropagation(); const t = A.teams.find(x => x.team_id === b.dataset.arch); if (await savePref(t, { archived: !t.archived, pinned: t.archived ? t.pinned : false })) { toast(t.archived ? `${t.name} archived. Find it under Archived.` : `${t.name} is back`); draw(); } });
  };
  draw();
}
/* Pin, archive and last-opened are your own view; they don't change the team for anyone else */
async function savePref(t, patch) {
  const next = { pinned: t.pinned, archived: t.archived, ...patch };
  const { error } = await sb.rpc('set_team_view', { t: t.team_id, pin: !!next.pinned, arch: !!next.archived, opened: !!patch.opened });
  if (error) { toast(errText(error), 5000); return false; }
  t.pinned = !!next.pinned; t.archived = !!next.archived; if (patch.opened) t.last_opened = new Date().toISOString();
  return true;
}
function openTeam(t) {
  A.team = t; A.tab = 'sites'; setUrl(t.team_id);
  savePref(t, { opened: true });
  renderSwitch(); renderTeam();
}
function renderSwitch() {
  const box = $('#teamSwitch'); box.hidden = false;
  const live = A.teams.filter(t => !t.archived || t === A.team);
  box.innerHTML = `<a class="btn btn-small" href="app.html" id="homeBtn">← All teams</a><select id="teamSel" aria-label="Switch team">${live.map(t => `<option value="${t.team_id}" ${t === A.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
  $('#homeBtn').onclick = e => { e.preventDefault(); loadTeams(); };
  $('#teamSel').onchange = e => openTeam(A.teams.find(t => t.team_id === e.target.value));
}
function newTeam() {
  modal('New team', TEAM_FORM() + '<p class="muted" style="margin:0;font-size:14px">You’ll be the owner. Next, add your site and invite people.</p>',
    [['Cancel'], ['Create team', true, async c => {
      const name = $('#tn', c).value.trim(); if (!name) { toast('Give your team a name'); return false; }
      const { data: tid, error } = await sb.rpc('create_team', { team_name: name, team_number: $('#tnum', c).value.trim() || null });
      if (error) throw error;
      await loadTeams(tid);
      if (!A.profile.display_name || A.profile.display_name === (A.user.email || '').split('@')[0]) editName(true);
    }]]);
}
function joinTeam() {
  modal('Join a team', `<label class="field">Paste the invite link someone sent you<input class="inp" id="jl" placeholder="…/app.html?invite=…"></label><p class="muted" style="margin:0;font-size:14px">Don’t have one? Ask someone on the team to send you an invite from their Members tab.</p>`,
    [['Cancel'], ['Continue', true, async c => {
      const m = $('#jl', c).value.trim().match(/([a-f0-9]{16,64})\s*$/i);
      if (!m) { toast('That doesn’t look like an invite link'); return false; }
      await showInvite(m[1]);
    }]]);
}
function renderTeam() {
  try { localStorage.setItem('orbyt-team', A.team.team_id); } catch (e) { /* ignore */ }
  const t = A.team;
  const tabs = [['sites', 'Sites'], ['members', 'Members'], ['settings', 'Settings']];
  $('#main').innerHTML = `<div class="head"><div><span class="label">Team</span><h1>${esc(t.name)}${t.number ? ' <span class="muted">' + esc(t.number) + '</span>' : ''}</h1></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag ${t.role === 'owner' ? 'owner' : ''}">You’re ${ROLE_A[t.role]}</span>${can(t, 'invite') ? '<button class="btn btn-primary btn-small" id="invTop">Invite people</button>' : ''}</div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${A.tab === k}" class="${A.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="tabBody"><div class="loading"><span class="spin" aria-hidden="true"></span>Loading…</div></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { A.tab = b.dataset.tab; renderTeam(); });
  const it = $('#invTop'); if (it) it.onclick = () => { A.tab = 'members'; renderTeam(); setTimeout(() => { const f = $('#ie'); if (f) f.focus(); }, 400); };
  ({ sites: renderSites, members: renderMembers, settings: renderSettings })[A.tab]().catch(e => { $('#tabBody').innerHTML = `<p class="error">${esc(errText(e))}</p>`; });
}

/* ---------- Sites ---------- */
async function renderSites() {
  const t = A.team;
  const { data: sites, error } = await sb.from('sites').select('id, name, updated_at, created_at').eq('team_id', t.team_id).order('updated_at', { ascending: false });
  if (error) throw error;
  const counts = {};
  await Promise.all((sites || []).map(async s => {
    const { count } = await sb.from('site_changes').select('id', { count: 'exact', head: true }).eq('site_id', s.id).eq('downloaded', false);
    counts[s.id] = count || 0;
  }));
  const body = $('#tabBody');
  body.innerHTML = `<div style="display:flex;flex-direction:column;gap:24px">
    <div class="head"><h2>Sites</h2>${can(t, 'edit') ? '<button class="btn btn-primary" id="addSite">Add a site</button>' : ''}</div>
    ${sites && sites.length ? `<div class="grid">${sites.map(s => `<div class="card site"><div class="thumb">${esc(s.name.toUpperCase())}</div>
      <div><strong style="font-size:18px">${esc(s.name)}</strong><div class="muted" style="font-size:14px">Updated ${when(s.updated_at)}${counts[s.id] ? ` · ${counts[s.id]} change${counts[s.id] === 1 ? '' : 's'} not downloaded` : ''}</div></div>
      <div class="row"><a class="btn btn-primary btn-small" href="editor.html?site=${s.id}">${can(t, 'edit') ? 'Open editor' : 'Look around'}</a>${can(t, 'delete_site') ? `<button class="btn btn-small btn-danger" data-del="${s.id}" data-name="${esc(s.name)}">Delete</button>` : ''}</div></div>`).join('')}</div>`
      : `<div class="empty"><strong style="color:var(--text)">No sites yet.</strong>${can(t, 'edit') ? 'Bring in your team’s website: upload its folder or a ZIP of it.' : 'An editor or admin on your team can add one.'}${can(t, 'edit') ? '<button class="btn btn-primary" id="addSite2">Add a site</button>' : ''}</div>`}</div>`;
  for (const id of ['addSite', 'addSite2']) { const b = $('#' + id); if (b) b.onclick = addSite; }
  $$('[data-del]').forEach(b => b.onclick = () => deleteSite(b.dataset.del, b.dataset.name));
}
const TEXT_EXT = /\.(html?|css|js|mjs|json|md|txt|svg|xml|webmanifest)$/i;
const MIME = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', pdf: 'application/pdf', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', txt: 'text/plain', md: 'text/markdown', xml: 'application/xml' };
const mimeOf = p => MIME[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
function cleanPath(p) { p = String(p).replace(/\\/g, '/').replace(/^\/+/, ''); return !p || p.split('/').some(s => s === '..' || s === '.' || s === '') ? null : p; }
const LIMITS = { file: 50 * 1024 * 1024, total: 400 * 1024 * 1024, count: 6000 };
function addSite() {
  modal('Add a site', `<label class="field">Name<input class="inp" id="sn" maxlength="80" placeholder="e.g. Team website"></label>
    <div class="field">Your site’s files<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn">Choose folder<input type="file" id="sf" webkitdirectory multiple hidden></label><label class="btn">Choose a ZIP<input type="file" id="sz" accept=".zip" hidden></label></div><span id="picked" class="muted" style="font-size:14px">Pick the folder that has your index.html in it.</span></div>
    <div class="progress" hidden id="prog"><span></span></div><p class="muted" id="progText" style="margin:0;font-size:14px" hidden></p>`,
    [['Cancel'], ['Upload and open', true, async c => {
      const name = $('#sn', c).value.trim(); if (!name) { toast('Give the site a name'); return false; }
      if (!c._entries) { toast('Choose your site’s folder or ZIP first'); return false; }
      await uploadSite(name, c._entries, c); return false;
    }]]);
  const c = $('.modal-card');
  const take = (entries, label) => {
    entries = entries.filter(e => !/(^|\/)(\.git|node_modules|__MACOSX)(\/|$)|\.DS_Store$|Thumbs\.db$/.test(e.path));
    const firsts = new Set(entries.map(e => e.path.split('/')[0]));
    const strip = firsts.size === 1 && entries.every(e => e.path.includes('/')) ? [...firsts][0] + '/' : '';
    let skipped = 0;
    entries = entries.map(e => ({ ...e, path: cleanPath(strip ? e.path.slice(strip.length) : e.path) })).filter(e => { if (!e.path || e.size > LIMITS.file) { skipped++; return false; } return true; });
    const total = entries.reduce((n, e) => n + (e.size || 0), 0);
    if (!entries.some(e => /\.html?$/i.test(e.path))) { $('#picked', c).textContent = 'No web pages found there. Pick the folder that has your index.html in it.'; c._entries = null; return; }
    if (entries.length > LIMITS.count || total > LIMITS.total) { $('#picked', c).textContent = `That’s too big to upload (${entries.length} files, ${Math.round(total / 1048576)} MB). Leave out videos or old files.`; c._entries = null; return; }
    c._entries = entries;
    $('#picked', c).textContent = `${label}: ${entries.length} files, ${Math.max(1, Math.round(total / 1048576))} MB${skipped ? ` (${skipped} left out)` : ''}`;
    if (!$('#sn', c).value) $('#sn', c).value = strip ? strip.slice(0, -1) : 'Website';
  };
  $('#sf', c).onchange = e => take([...e.target.files].map(f => ({ path: f.webkitRelativePath || f.name, size: f.size, blob: f })), 'Folder');
  $('#sz', c).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const zip = await JSZip.loadAsync(f), list = [];
      zip.forEach((path, z) => { if (!z.dir) list.push({ path, size: (z._data && z._data.uncompressedSize) || 0, zip: z }); });
      take(list, 'ZIP');
    } catch (er) { $('#picked', c).textContent = 'That ZIP couldn’t be opened.'; }
  };
}
async function uploadSite(name, entries, c) {
  const t = A.team, prog = $('#prog', c), txt = $('#progText', c);
  prog.hidden = false; txt.hidden = false; $$('.modal-foot button', c).forEach(b => { b.disabled = true; });
  const { data: site, error } = await sb.from('sites').insert({ team_id: t.team_id, name, created_by: A.user.id }).select('id').single();
  if (error) throw error;
  let done = 0, failed = 0;
  const rows = [];
  const queue = entries.slice();
  async function worker() {
    while (queue.length) {
      const e = queue.shift();
      try {
        const blob = e.blob || new Blob([await e.zip.async('arraybuffer')], { type: mimeOf(e.path) });
        const { error: upErr } = await sb.storage.from('sites').upload(`${t.team_id}/${site.id}/${e.path}`, blob, { upsert: true, contentType: mimeOf(e.path) });
        if (upErr) throw upErr;
        rows.push({ site_id: site.id, path: e.path, size: blob.size, changed: false, updated_by: A.user.id });
      } catch (er) { failed++; }
      done++;
      $('span', prog).style.width = Math.round(done / entries.length * 100) + '%';
      txt.textContent = `Uploading ${done} of ${entries.length}…`;
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  for (let i = 0; i < rows.length; i += 500) { const { error: e2 } = await sb.from('site_files').upsert(rows.slice(i, i + 500)); if (e2) throw e2; }
  if (failed) toast(`${failed} file${failed === 1 ? '' : 's'} didn’t upload. You can add them later from the editor’s site check.`, 6000);
  location.href = 'editor.html?site=' + site.id;
}
function deleteSite(id, name) {
  modal('Delete this site?', `<p style="margin:0">This deletes <strong>${esc(name)}</strong> and all its files from Orbyt for everyone on the team. Your live website isn’t touched.</p><label class="field">Type the site’s name to confirm<input class="inp" id="cf"></label>`,
    [['Cancel'], ['Delete site', true, async c => {
      if ($('#cf', c).value.trim() !== name) { toast('The name doesn’t match'); return false; }
      const { data: files } = await sb.from('site_files').select('path').eq('site_id', id);
      const paths = (files || []).map(f => `${A.team.team_id}/${id}/${f.path}`);
      for (let i = 0; i < paths.length; i += 100) await sb.storage.from('sites').remove(paths.slice(i, i + 100));
      const { error } = await sb.from('sites').delete().eq('id', id); if (error) throw error;
      toast('Site deleted'); renderSites();
    }]]);
}

/* ---------- Members ---------- */
async function renderMembers() {
  const t = A.team;
  const { data: mem, error } = await sb.from('team_members').select('user_id, role, perms, pages, joined_at').eq('team_id', t.team_id).order('joined_at');
  if (error) throw error;
  const ids = mem.map(m => m.user_id);
  const { data: profs } = await sb.from('profiles').select('id, display_name').in('id', ids);
  const nameOf = id => ((profs || []).find(p => p.id === id) || {}).display_name || 'Teammate';
  let invites = [];
  if (can(t, 'invite')) { const r = await sb.from('invites').select('id, email, role, token, expires_at, created_at').eq('team_id', t.team_id).is('accepted_at', null).order('created_at', { ascending: false }); invites = r.data || []; }
  const iCanRoles = can(t, 'roles'), iAmOwner = t.role === 'owner';
  const roleOpts = m => ['admin', 'editor', 'viewer'].filter(r => r !== 'admin' || iAmOwner || m.role === 'admin').map(r => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${ROLE_WORDS[r]}</option>`).join('');
  const body = $('#tabBody');
  body.innerHTML = `<div style="display:flex;flex-direction:column;gap:32px">
    ${can(t, 'invite') ? `<div class="card" style="display:flex;flex-direction:column;gap:16px"><h2>Invite someone</h2>
      <div class="invite-row"><label class="field">Their email (optional)<input class="inp" id="ie" type="email" placeholder="name@school.org"></label>
      <label class="field" style="flex:0 1 180px">Role<select class="inp" id="ir">${['editor', 'viewer'].concat(iAmOwner ? ['admin'] : []).map(r => `<option value="${r}">${ROLE_WORDS[r]}</option>`).join('')}</select></label>
      <button class="btn btn-primary" id="mkInv">Make invite link</button></div>
      <p class="muted" style="margin:0;font-size:14px">Send them the link. If you add their email, only that email can use it. Links work once and expire after 14 days.</p>
      <div id="newLink"></div></div>` : ''}
    <div><h2 style="margin-bottom:8px">Members (${mem.length})</h2><div class="members">${mem.map(m => {
      const me = m.user_id === A.user.id, editable = iCanRoles && !me && m.role !== 'owner' && (m.role !== 'admin' || iAmOwner);
      const perms = m.perms || {};
      return `<div class="member" data-uid="${m.user_id}">${avatar(nameOf(m.user_id), m.user_id)}
        <div class="who"><strong>${esc(nameOf(m.user_id))}${me ? ' (you)' : ''}</strong><small>${m.role === 'owner' ? 'Owner: can do everything' : esc(ROLE_HELP[m.role])}${m.pages && m.pages.length ? ` · only ${m.pages.length} page${m.pages.length === 1 ? '' : 's'}` : ''}</small></div>
        <div class="ctl">${editable ? `<select data-role aria-label="Role for ${esc(nameOf(m.user_id))}">${roleOpts(m)}</select><button class="btn btn-small" data-pages>Pages…</button><button class="btn btn-small btn-danger" data-remove>Remove</button>` : `<span class="tag ${m.role === 'owner' ? 'owner' : ''}">${ROLE_WORDS[m.role]}</span>`}</div>
        ${editable && m.role === 'editor' ? `<div class="switches"><label><input type="checkbox" data-perm="kit" ${perms.kit !== false ? 'checked' : ''}>Can change team colors and fonts</label><label><input type="checkbox" data-perm="data" ${perms.data !== false ? 'checked' : ''}>Can edit the schedule and lists</label><label><input type="checkbox" data-perm="download" ${perms.download !== false ? 'checked' : ''}>Can download the site</label></div>` : ''}
      </div>`; }).join('')}</div></div>
    ${invites.length ? `<div><h2 style="margin-bottom:8px">Waiting to join</h2><div class="list">${invites.map(i => `<div class="item"><span>${i.email ? esc(i.email) : 'Anyone with the link'} · ${ROLE_WORDS[i.role]}${new Date(i.expires_at) < new Date() ? ' · <span class="error">expired</span>' : ` · expires ${new Date(i.expires_at).toLocaleDateString()}`}</span><span style="display:flex;gap:8px"><button class="btn btn-small" data-copy="${esc(A.base + 'app.html?invite=' + i.token)}">Copy link</button><button class="btn btn-small btn-danger" data-cancel="${i.id}">Cancel</button></span></div>`).join('')}</div></div>` : ''}
  </div>`;
  const mk = $('#mkInv');
  if (mk) mk.onclick = async () => {
    const email = $('#ie').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('That email doesn’t look right'); return; }
    mk.disabled = true;
    const { data, error: e } = await sb.from('invites').insert({ team_id: t.team_id, email: email || null, role: $('#ir').value, created_by: A.user.id }).select('token').single();
    mk.disabled = false;
    if (e) { toast(errText(e), 5000); return; }
    const link = A.base + 'app.html?invite=' + data.token;
    $('#newLink').innerHTML = `<div class="linkbox"><span style="flex:1">${esc(link)}</span><button class="btn btn-small btn-primary" data-copy="${esc(link)}">Copy</button></div>`;
    bindCopy(); setTimeout(() => renderMembers(), 1500);
  };
  bindCopy();
  $$('[data-cancel]').forEach(b => b.onclick = async () => { const { error: e } = await sb.from('invites').delete().eq('id', b.dataset.cancel); if (e) toast(errText(e)); else renderMembers(); });
  $$('.member').forEach(row => {
    const uid = row.dataset.uid, m = mem.find(x => x.user_id === uid);
    const save = async (patch, msg) => {
      const next = { role: m.role, perms: m.perms || {}, pages: m.pages, ...patch };
      const { error: e } = await sb.rpc('set_member', { t: t.team_id, member: uid, new_role: next.role, new_perms: next.perms, new_pages: next.pages && next.pages.length ? next.pages : null });
      if (e) { toast(errText(e), 5000); renderMembers(); return; }
      toast(msg); renderMembers();
    };
    const rs = $('[data-role]', row); if (rs) rs.onchange = () => save({ role: rs.value }, `${nameOf(uid)} is now ${ROLE_A[rs.value]}`);
    $$('[data-perm]', row).forEach(cb => cb.onchange = () => save({ perms: { ...(m.perms || {}), [cb.dataset.perm]: cb.checked } }, 'Saved'));
    const rm = $('[data-remove]', row); if (rm) rm.onclick = () => modal(`Remove ${nameOf(uid)}?`, `<p style="margin:0">They’ll lose access to this team’s sites right away. You can invite them again later.</p>`, [['Cancel'], ['Remove', true, async () => {
      const { error: e } = await sb.rpc('remove_member', { t: t.team_id, member: uid }); if (e) throw e; toast('Removed'); renderMembers();
    }]]);
    const pg = $('[data-pages]', row); if (pg) pg.onclick = () => pickPages(m, nameOf(uid), pages => save({ pages }, pages && pages.length ? `${nameOf(uid)} can now edit ${pages.length} page${pages.length === 1 ? '' : 's'}` : `${nameOf(uid)} can edit every page`));
  });
}
function bindCopy() {
  $$('[data-copy]').forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Link copied'); } catch (e) { toast('Couldn’t copy. Select the link and copy it yourself.'); }
  });
}
async function pickPages(m, name, done) {
  const { data: sites } = await sb.from('sites').select('id, name').eq('team_id', A.team.team_id);
  const ids = (sites || []).map(s => s.id);
  const { data: files } = ids.length ? await sb.from('site_files').select('site_id, path').in('site_id', ids) : { data: [] };
  const pages = [...new Set((files || []).filter(f => /\.html?$/i.test(f.path)).map(f => f.path))].sort();
  const have = new Set(m.pages || []);
  modal(`Pages ${name} can edit`, `<div class="field"><label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="radio" name="pm" value="all" ${have.size ? '' : 'checked'} style="accent-color:var(--comet)">Every page</label><label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="radio" name="pm" value="some" ${have.size ? 'checked' : ''} style="accent-color:var(--comet)">Only these pages</label></div>
    <div class="pagelist">${pages.length ? pages.map(p => `<label><input type="checkbox" value="${esc(p)}" ${have.has(p) ? 'checked' : ''}>${esc(p)}</label>`).join('') : '<span class="muted">Add a site first.</span>'}</div>
    <p class="muted" style="margin:0;font-size:14px">They can still look at every page. They just can’t change the others.</p>`,
    [['Cancel'], ['Save', true, async c => {
      const all = $('input[name="pm"]:checked', c).value === 'all';
      const picked = $$('.pagelist input:checked', c).map(i => i.value);
      if (!all && !picked.length) { toast('Pick at least one page, or choose Every page'); return false; }
      done(all ? null : picked);
    }]]);
}

/* ---------- Settings ---------- */
async function renderSettings() {
  const t = A.team;
  $('#tabBody').innerHTML = `<div style="display:flex;flex-direction:column;gap:24px;max-width:640px">
    ${can(t, 'roles') ? `<div class="card" style="display:flex;flex-direction:column;gap:16px"><h2>Team details</h2>
      <label class="field">Team name<input class="inp" id="stn" maxlength="80" value="${esc(t.name)}"></label>
      <label class="field">Short tag<input class="inp" id="stnum" maxlength="20" value="${esc(t.number || '')}"></label>
      <button class="btn btn-primary" id="saveTeam" style="align-self:flex-start">Save</button></div>` : ''}
    ${t.role !== 'owner' ? `<div class="card" style="display:flex;flex-direction:column;gap:12px"><h2>Leave this team</h2><p class="muted" style="margin:0">You’ll lose access to its sites. Someone can invite you back later.</p><button class="btn btn-danger" id="leave" style="align-self:flex-start">Leave ${esc(t.name)}</button></div>` : ''}
    ${can(t, 'delete_team') ? `<div class="card danger-zone" style="display:flex;flex-direction:column;gap:12px"><h2>Delete this team</h2><p class="muted" style="margin:0">Deletes the team, its sites and files from Orbyt for everyone. Your live websites aren’t touched.</p><button class="btn btn-danger" id="delTeam" style="align-self:flex-start">Delete ${esc(t.name)}</button></div>` : ''}
  </div>`;
  const st = $('#saveTeam'); if (st) st.onclick = async () => {
    const name = $('#stn').value.trim(); if (!name) { toast('The team needs a name'); return; }
    const { error } = await sb.from('teams').update({ name, number: $('#stnum').value.trim() || null }).eq('id', t.team_id);
    if (error) { toast(errText(error)); return; }
    toast('Saved'); t.name = name; t.number = $('#stnum').value.trim() || null; renderSwitch(); renderTeam();
  };
  const lv = $('#leave'); if (lv) lv.onclick = () => modal(`Leave ${t.name}?`, '<p style="margin:0">You’ll lose access right away.</p>', [['Cancel'], ['Leave', true, async () => {
    const { error } = await sb.rpc('remove_member', { t: t.team_id, member: A.user.id }); if (error) throw error;
    try { localStorage.removeItem('orbyt-team'); } catch (e) { /* ignore */ }
    A.tab = 'sites'; await loadTeams(null);
  }]]);
  const dt = $('#delTeam'); if (dt) dt.onclick = () => modal('Delete this team?', `<p style="margin:0">This can’t be undone.</p><label class="field">Type <strong>${esc(t.name)}</strong> to confirm<input class="inp" id="cf"></label>`, [['Cancel'], ['Delete team', true, async c => {
    if ($('#cf', c).value.trim() !== t.name) { toast('The name doesn’t match'); return false; }
    const { data: sites } = await sb.from('sites').select('id').eq('team_id', t.team_id);
    for (const s of sites || []) {
      const { data: files } = await sb.from('site_files').select('path').eq('site_id', s.id);
      const paths = (files || []).map(f => `${t.team_id}/${s.id}/${f.path}`);
      for (let i = 0; i < paths.length; i += 100) await sb.storage.from('sites').remove(paths.slice(i, i + 100));
    }
    const { error } = await sb.from('teams').delete().eq('id', t.team_id); if (error) throw error;
    try { localStorage.removeItem('orbyt-team'); } catch (e) { /* ignore */ }
    A.tab = 'sites'; toast('Team deleted'); await loadTeams();
  }]]);
}
