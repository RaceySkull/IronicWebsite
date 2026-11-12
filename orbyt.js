/* Orbyt Designs: shared helpers for the welcome, sign-in, team and editor pages */
'use strict';
const Orbyt = (() => {
  const cfg = window.ORBYT_CONFIG || {};
  const sb = window.__ORBYT_TEST_CLIENT || (window.supabase && cfg.supabaseUrl ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }) : null);
  /* Explains exactly why sign-in can't start, or returns '' when everything loaded */
  function setupProblem() {
    if (!window.ORBYT_CONFIG) return 'config.js didn’t load. Make sure config.js is uploaded next to this page.';
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return 'config.js is missing the Supabase address or key.';
    if (!window.supabase || !window.supabase.createClient) return 'The sign-in library didn’t load. Make sure supabase.js is uploaded to the same place as this page.';
    return '';
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MARK = (size = 30) => `<span class="mark" style="width:${size}px;height:${size}px"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="4.2" fill="none" stroke="#fff" stroke-width="1.8" transform="rotate(-28 12 12)"/><circle cx="12" cy="12" r="3.6" fill="#fff"/></svg></span>`;
  const LOCKUP = (size = 26) => `<span class="lockup" style="--s:${size}px">${MARK(Math.round(size * 1.35))}<span class="words"><span class="w1">ORBYT</span><span class="w2">DESIGNS</span></span></span>`;
  /* Where people land after signing in. Only same-site pages are allowed, so a
     link can't bounce someone to another website after they sign in. */
  function safeNext(n) {
    if (!n || typeof n !== 'string') return 'app.html';
    if (!/^[a-z0-9_-]+\.html(\?[\w=&%.-]*)?$/i.test(n)) return 'app.html';
    return n;
  }
  async function session() { if (!sb) return null; const { data } = await sb.auth.getSession(); return data.session; }
  async function requireSession() {
    const s = await session();
    if (!s) { location.href = 'signin.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); return null; }
    return s;
  }
  function toast(msg, ms = 3200) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
  }
  /* Friendly words for database errors */
  function errText(e) {
    const m = (e && (e.message || e.error_description || e.msg)) || String(e || 'Something went wrong');
    if (/JWT|session|not authenticated/i.test(m)) return 'Your sign-in expired. Sign in again.';
    if (/row-level security|permission denied/i.test(m)) return 'You don’t have permission to do that on this team.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Couldn’t reach the server. Check your internet connection.';
    if (/relation .* does not exist|function .* does not exist/i.test(m)) return 'The database isn’t set up yet. Run supabase.sql in your Supabase project (see the README).';
    return m;
  }
  const COLORS = ['#CA374D', '#3FB27F', '#4C8DFF', '#E8A33D', '#B48CFF', '#2EC4C4', '#F07A8C', '#9BC53D'];
  const colorFor = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const initials = n => (String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase();
  return { sb, setupProblem, esc, MARK, LOCKUP, safeNext, session, requireSession, toast, errText, colorFor, initials };
})();
