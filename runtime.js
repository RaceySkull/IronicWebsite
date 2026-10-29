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
  var BASE = { fade: 700, slide: 700, grow: 600, spin: 4000, float: 3000, pulse: 1600, flow: 8000 };
  var SPEED = { slow: 1.6, normal: 1, fast: 0.6 };
  function frames(effect, c) {
    switch (effect) {
      case 'flow': return [{ backgroundPosition: '0% 50%' }, { backgroundPosition: '300% 50%' }];
      case 'fade': return [{ opacity: 0 }, { opacity: 1 }];
      case 'slide': return [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }];
      case 'grow': return [{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'scale(1)' }];
      case 'spin': return [{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + (c && c.dir === 'ccw' ? -360 : 360) + 'deg)' }];
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
    var f = frames(c.effect, c);
    if (!f || !el.animate) return null;
    prepSvg(el);
    if (c.effect === 'flow' && !el.style.backgroundSize) el.style.backgroundSize = '300% 100%';
    return el.animate(f, {
      duration: c.secs ? c.secs * 1000 : (BASE[c.effect] || 700) * (SPEED[c.speed] || 1),
      iterations: c.repeat === 'forever' ? Infinity : 1,
      easing: c.effect === 'spin' || c.effect === 'flow' ? 'linear' : 'ease-in-out',
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


  /* ---------- Pop-ups ---------- */
  var backdrop = null, openPop = null;
  function closePopup() {
    if (openPop) openPop.classList.remove('se-open');
    if (backdrop) backdrop.classList.remove('se-open');
    openPop = null;
  }
  function openPopup(name) {
    var el = document.querySelector('[data-se-popup="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]');
    if (!el) return;
    closePopup();
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'se-backdrop';
      backdrop.addEventListener('click', closePopup);
      document.body.appendChild(backdrop);
    }
    backdrop.classList.add('se-open');
    el.classList.add('se-open');
    openPop = el;
    var f = el.querySelector('a,button,input,select,textarea,[tabindex]'); if (f) f.focus();
  }
  function setupPopups() {
    document.addEventListener('click', function (e) {
      if (EDITOR) return;
      var o = e.target.closest && e.target.closest('[data-se-open]');
      if (o) { e.preventDefault(); openPopup(o.getAttribute('data-se-open')); return; }
      if (e.target.closest && e.target.closest('[data-se-close]')) { e.preventDefault(); closePopup(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePopup(); });
  }

  /* ---------- Expanding rows with documents ---------- */
  function loadDoc(d) {
    var src = d.getAttribute('data-se-doc');
    if (!src || !d.open || d.querySelector('iframe.se-doc')) return;
    var f = document.createElement('iframe');
    f.className = 'se-doc'; f.src = src; f.title = (d.querySelector('summary') || {}).textContent || 'Document';
    (d.querySelector('.se-expand-body') || d).appendChild(f);
  }
  function setupExpanders() {
    var list = document.querySelectorAll('details[data-se-doc]');
    for (var i = 0; i < list.length; i++) {
      (function (d) { d.addEventListener('toggle', function () { loadDoc(d); }); loadDoc(d); })(list[i]);
    }
  }

  /* ---------- Section tabs that follow scrolling ---------- */
  function setupTabs() {
    var navs = document.querySelectorAll('[data-se-tabs]');
    if (!navs.length || !('IntersectionObserver' in window)) return;
    for (var n = 0; n < navs.length; n++) {
      (function (nav) {
        var links = nav.querySelectorAll('a[href^="#"]');
        var map = {};
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            for (var i = 0; i < links.length; i++) links[i].classList.toggle('se-active', links[i].getAttribute('href') === '#' + e.target.id);
          });
        }, { rootMargin: '-40% 0px -55% 0px' });
        for (var i = 0; i < links.length; i++) {
          var id = links[i].getAttribute('href').slice(1);
          var t = document.getElementById(id);
          if (t) { map[id] = t; io.observe(t); }
          links[i].addEventListener('click', function (ev) {
            var t2 = document.getElementById(this.getAttribute('href').slice(1));
            if (!t2) return;
            ev.preventDefault();
            t2.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
          });
        }
      })(navs[n]);
    }
  }

  function init() {
    renderAllCountdowns();
    setInterval(renderAllCountdowns, 1000);
    if (EDITOR) return;
    setupPopups(); setupExpanders(); setupTabs();
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
    setNowOffset: function (ms) { offset = ms; renderAllCountdowns(); },
    openPopup: openPopup, closePopup: closePopup
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
  '[data-se-hide]{display:none!important}',
  '[data-se-popup]:not(.se-open){display:none!important}',
  '[data-se-popup].se-open{position:fixed!important;left:50%!important;top:50%!important;right:auto!important;bottom:auto!important;transform:translate(-50%,-50%)!important;z-index:1001!important;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto}',
  '.se-backdrop{display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.6)}',
  '.se-backdrop.se-open{display:block}',
  'details.se-expand>summary{cursor:pointer}',
  'iframe.se-doc{display:block;width:100%;height:70vh;border:0;margin-top:12px}',
  '[data-se-tabs]{display:flex;flex-direction:column;gap:8px}',
  '[data-se-tabs] a{text-decoration:none;color:inherit;opacity:.6}',
  '[data-se-tabs] a.se-active{opacity:1;font-weight:700}',
  '.se-embed{min-height:40px}',
  '@media (prefers-reduced-motion: reduce){[data-se-motion],[data-se-timeline]{animation:none!important}}'
].join('\n');
