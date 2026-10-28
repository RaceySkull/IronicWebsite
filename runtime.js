/* Site Editor runtime — powers countdowns, motion effects and timeline
   animations on the published site. The editor copies this file into
   your site as se-widgets.js whenever a page uses one of those features. */
function seRuntime() {
  if (window.SEWidgets) { window.SEWidgets.refresh(); return; }
  var offset = 0;
  var EDITOR = !!window.__SE_EDITOR;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function now() { return Date.now() + offset; }
  function cfg(el, attr) { try { return JSON.parse(el.getAttribute(attr) || '{}'); } catch (e) { return {}; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function shortDate(t) {
    var d = new Date(t);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ---------- Countdown ---------- */
  function cdState(c) {
    var q = (c.queue || []).filter(function (x) { return x.date; }).map(function (x) {
      return { name: x.name || '', t: new Date(x.date).getTime() };
    });
    if (c.auto === false) q = q.slice(0, 1);
    var n = now();
    var hold = c.zero === 'none' ? 0 : 86400000;
    for (var i = 0; i < q.length; i++) {
      var it = q[i];
      if (n < it.t) return { mode: 'count', item: it, next: q[i + 1] };
      if (n < it.t + hold && (!q[i + 1] || n < q[i + 1].t)) return { mode: 'now', item: it, next: q[i + 1] };
    }
    return { mode: 'after', item: q[q.length - 1] };
  }
  function units(ms, show) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (show === 'd') return [[Math.ceil(ms / 86400000) || 0, 'Days']];
    if (show === 'dh') return [[d, 'Days'], [pad(h), 'Hrs']];
    return [[d, 'Days'], [pad(h), 'Hrs'], [pad(m), 'Min'], [pad(sec), 'Sec']];
  }
  function unitHtml(list) {
    return '<div class="se-cd-units">' + list.map(function (u) {
      return '<div class="se-cd-unit"><span class="se-cd-num">' + u[0] + '</span><span class="se-cd-cap">' + u[1] + '</span></div>';
    }).join('') + '</div>';
  }
  function renderCountdown(el) {
    var c = cfg(el, 'data-se-countdown');
    var st = cdState(c);
    var label = c.label == null ? 'Counting down to' : c.label;
    var html = '';
    el.hidden = false;
    el.style.opacity = '';
    if (st.mode === 'count') {
      html = (label ? '<div class="se-cd-label">' + esc(label) + '</div>' : '') +
        '<div class="se-cd-name">' + esc(st.item.name) + '</div>' + unitHtml(units(st.item.t - now(), c.show || 'd'));
    } else if (st.mode === 'now') {
      html = '<div class="se-cd-name">' + esc(st.item.name) + '</div><div class="se-cd-now">' + esc(c.zeroText || 'Happening now!') + '</div>';
    } else {
      if (c.after === 'message') {
        html = '<div class="se-cd-now">' + esc(c.afterText || 'See you next season') + '</div>';
      } else if (c.after === 'zeros') {
        html = '<div class="se-cd-name">' + esc(st.item ? st.item.name : '') + '</div>' + unitHtml(units(0, c.show || 'd'));
      } else if (EDITOR) {
        html = '<div class="se-cd-now">All dates are done</div><div class="se-cd-next">This countdown is hidden on the live site now. Add a new date to bring it back.</div>';
        el.style.opacity = '0.6';
      } else {
        el.hidden = true;
      }
    }
    if (st.next && c.upnext !== false && st.mode !== 'after') {
      html += '<div class="se-cd-next">Up next: ' + esc(st.next.name) + ' · ' + shortDate(st.next.t) + '</div>';
    }
    if (el.__seLast !== html) { el.innerHTML = html; el.__seLast = html; }
  }
  function renderAllCountdowns() {
    var list = document.querySelectorAll('.se-countdown');
    for (var i = 0; i < list.length; i++) renderCountdown(list[i]);
  }

  /* ---------- Motion effects ---------- */
  var BASE = { fade: 700, slide: 700, grow: 600, spin: 4000, float: 3000, pulse: 1600 };
  var SPEED = { slow: 1.6, normal: 1, fast: 0.6 };
  function frames(effect) {
    switch (effect) {
      case 'fade': return [{ opacity: 0 }, { opacity: 1 }];
      case 'slide': return [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }];
      case 'grow': return [{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'scale(1)' }];
      case 'spin': return [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }];
      case 'float': return [{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }];
      case 'pulse': return [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }];
    }
    return null;
  }
  function prepSvg(el) {
    if (typeof SVGElement !== 'undefined' && el instanceof SVGElement) {
      el.style.transformBox = 'fill-box';
      if (!el.style.transformOrigin) el.style.transformOrigin = 'center';
    }
  }
  function makeMotion(el, c, fill) {
    var f = frames(c.effect);
    if (!f || !el.animate) return null;
    prepSvg(el);
    return el.animate(f, {
      duration: (BASE[c.effect] || 700) * (SPEED[c.speed] || 1),
      iterations: c.repeat === 'forever' ? Infinity : 1,
      easing: c.effect === 'spin' ? 'linear' : 'ease-in-out',
      fill: fill
    });
  }
  function playMotion(el) {
    var c = cfg(el, 'data-se-motion');
    if (el.__seMotion) el.__seMotion.cancel();
    el.__seMotion = makeMotion(el, c, 'none');
    return el.__seMotion;
  }
  function setupMotion(el) {
    var c = cfg(el, 'data-se-motion');
    if (!c.effect || c.effect === 'none') return;
    if (reduce && c.calm !== false) return;
    var trig = c.trigger || 'load';
    if (trig === 'hover') { el.addEventListener('mouseenter', function () { playMotion(el); }); return; }
    if (trig === 'click') { el.addEventListener('click', function () { playMotion(el); }); return; }
    var a = makeMotion(el, c, 'both');
    if (!a) return;
    el.__seMotion = a;
    if (trig === 'view' && 'IntersectionObserver' in window) {
      a.pause(); a.currentTime = 0;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { a.play(); io.disconnect(); } });
      }, { threshold: 0.2 });
      io.observe(el);
    }
  }

  /* ---------- Timeline animations ---------- */
  function tlFrames(c) {
    var dur = c.duration || 4;
    var steps = (c.steps || []).slice().sort(function (a, b) { return a.t - b.t; });
    if (steps.length < 2) return null;
    var kf = steps.map(function (s) {
      return {
        offset: Math.min(1, Math.max(0, s.t / dur)),
        transform: 'translate(' + (s.x || 0) + 'px,' + (s.y || 0) + 'px) rotate(' + (s.rotate || 0) + 'deg) scale(' + (s.scale == null ? 1 : s.scale) + ')',
        opacity: s.opacity == null ? 1 : s.opacity,
        easing: c.smooth === false ? 'linear' : 'ease-in-out'
      };
    });
    if (kf[0].offset > 0) kf.unshift(Object.assign({}, kf[0], { offset: 0 }));
    if (kf[kf.length - 1].offset < 1) kf.push(Object.assign({}, kf[kf.length - 1], { offset: 1 }));
    return kf;
  }
  function timeline(el, opt) {
    opt = opt || {};
    var c = cfg(el, 'data-se-timeline');
    if (el.__seTl) { el.__seTl.cancel(); el.__seTl = null; }
    var kf = tlFrames(c);
    if (!kf || !el.animate) return null;
    if (typeof SVGElement !== 'undefined' && el instanceof SVGElement) el.style.transformBox = 'fill-box';
    el.style.transformOrigin = c.pivot || '50% 50%';
    var total = (c.duration || 4) * 1000 * (SPEED[c.speed] || 1);
    var a = el.animate(kf, { duration: total, iterations: opt.once ? 1 : (c.loop === false ? 1 : Infinity), fill: 'both' });
    el.__seTl = a;
    if (opt.paused) { a.pause(); a.currentTime = Math.min(total, (opt.time || 0) * 1000 * (SPEED[c.speed] || 1)); }
    return a;
  }
  function stopTimeline(el) { if (el.__seTl) { el.__seTl.cancel(); el.__seTl = null; } }

  function init() {
    renderAllCountdowns();
    setInterval(renderAllCountdowns, 1000);
    if (EDITOR) return;
    var m = document.querySelectorAll('[data-se-motion]');
    for (var i = 0; i < m.length; i++) setupMotion(m[i]);
    var t = document.querySelectorAll('[data-se-timeline]');
    for (var j = 0; j < t.length; j++) {
      if (reduce && cfg(t[j], 'data-se-timeline').calm !== false) continue;
      timeline(t[j]);
    }
  }

  window.SEWidgets = {
    refresh: renderAllCountdowns,
    playMotion: playMotion,
    timeline: timeline,
    stopTimeline: stopTimeline,
    setNowOffset: function (ms) { offset = ms; renderAllCountdowns(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}

var SE_RUNTIME_CSS = [
  '.se-countdown{display:flex;flex-direction:column;gap:12px}',
  '.se-cd-label{font-size:.75em;letter-spacing:.08em;opacity:.75}',
  '.se-cd-name{font-size:1.15em;font-weight:600}',
  '.se-cd-units{display:flex;flex-wrap:wrap;gap:16px}',
  '.se-cd-unit{display:flex;flex-direction:column;align-items:center;min-width:3.5em}',
  '.se-cd-num{font-size:2.5em;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}',
  '.se-cd-cap{font-size:.7em;letter-spacing:.08em;opacity:.75}',
  '.se-cd-now{font-size:1.5em;font-weight:700}',
  '.se-cd-next{font-size:.8em;opacity:.75}',
  '.se-button{text-decoration:none;cursor:pointer}',
  '@media (prefers-reduced-motion: reduce){[data-se-motion],[data-se-timeline]{animation:none!important}}'
].join('\n');
