/* near.html: full-screen map + swipeable place cards, live distance while walking.
   Map: MapLibre GL + OpenFreeMap "positron" vector style (crisp on retina, free, no key).
   Cards and photo carousels: native CSS scroll-snap (no carousel library). Data: data.json. */
(function () {
  'use strict';
  var EMBED = /[?&]embed=1/.test(location.search);   // small version inside the start page: no location prompt, two-finger map
  var CENTRE = [28.9830, 41.0315];          // Cihangir, used when there is no GPS fix
  var WALK = 80 / 1.3;                       // metres of straight line covered per minute on foot (80 m/min, x1.3 for street detours)
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var state = { all: [], list: [], cats: {}, me: null, watch: null, active: -1, who: 'all', off: {}, markers: {}, open: true, following: false };

  function dist(a, b) { // metres, haversine; a,b = [lon,lat]
    var r = Math.PI / 180, x = Math.sin((b[1] - a[1]) * r / 2), y = Math.sin((b[0] - a[0]) * r / 2);
    return 12742000 * Math.asin(Math.sqrt(x * x + Math.cos(a[1] * r) * Math.cos(b[1] * r) * y * y));
  }
  function fmtDist(m) {
    var min = Math.max(1, Math.round(m / WALK));
    var d = m < 1000 ? (Math.round(m / 10) * 10) + ' m' : (m / 1000).toFixed(1) + ' km';
    return min > 60 ? d + ' · metro/taxi' : d + ' · ' + min + ' min walk';
  }
  function origin() { return state.me || CENTRE; }

  // ------------------------------------------------------------------ toast
  var toastT;
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); if (ms !== 0) toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 4000);
  }

  // ------------------------------------------------------------------ map
  var map = new maplibregl.Map({
    container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: CENTRE, zoom: 14.2,
    attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false, touchPitch: false, cooperativeGestures: EMBED
  });
  if (EMBED) { var tl = $('.top a'); tl.href = 'near.html'; tl.target = '_top'; tl.setAttribute('aria-label', 'Open full screen'); tl.innerHTML = '⛶ Full screen <span class="n"><span id="count"></span></span>'; }
  map.touchZoomRotate.disableRotation();

  function pinEl(p) {
    var c = state.cats[p.cat] || {}, wrap = document.createElement('div'), el = document.createElement('button');
    wrap.className = 'mk'; wrap.appendChild(el);   // MapLibre owns the wrapper's position/transform; style only the inner pin
    el.className = 'pin' + (p.status ? ' pin-off' : ''); el.type = 'button';
    el.style.setProperty('--c', c.col || '#444');
    el.setAttribute('aria-label', p.n + '. ' + p.name);
    el.innerHTML = '<span class="pe">' + (c.e || '•') + '</span><span class="pb">' + esc(p.name) + (p.price_level ? ' · ' + p.price_level : '') + '</span>';
    el.addEventListener('click', function (e) { e.stopPropagation(); select(p.n, true); });
    return wrap;
  }
  var meMarker = null;
  function showMe() {
    if (!state.me) return;
    if (!meMarker) {
      var el = document.createElement('div'); el.className = 'me';
      meMarker = new maplibregl.Marker({ element: el }).setLngLat(state.me).addTo(map);
    } else meMarker.setLngLat(state.me);
  }

  // ------------------------------------------------------------------ cards (cards.js, shared with the area / type / friend maps)
  var GC = window.GuideCards, cardHTML = GC.cardHTML;
  Object.defineProperty(state, 'gShown', { get: function () { return GC.shown; } });

  var track = $('#cards');
  function visible(p) {
    var catOk = !state.off[p.cat] || (p.also || []).some(function (c) { return !state.off[c]; });
    return catOk && (state.who === 'all' || p.by.indexOf(state.who) >= 0) && (!state.zone || p.zone === state.zone);
  }
  function rebuild(keepN) {
    var o = origin();
    state.list = state.all.filter(visible).map(function (p) { p._d = dist(o, [p.lon, p.lat]); return p; })
      .sort(function (a, b) { return a._d - b._d; });
    track.innerHTML = state.list.map(cardHTML).join('');
    state.all.forEach(function (p) { state.markers[p.n].getElement().style.display = visible(p) ? '' : 'none'; });
    $('#count').textContent = state.list.length + (state.list.length === 1 ? ' place' : ' places');
    updateDistances();
    wirePhotos();
    if (!state.list.length) { state.active = -1; return; }
    var idx = Math.max(0, state.list.findIndex(function (p) { return p.n === keepN; }));
    state.active = -1;
    scrollToIndex(idx, false); setActive(idx, false);
  }
  function updateDistances() {
    var o = origin(), have = !!state.me;
    state.list.forEach(function (p) {
      p._d = dist(o, [p.lon, p.lat]);
      var el = track.querySelector('[data-d="' + p.n + '"]');
      if (el) el.textContent = have ? fmtDist(p._d) : fmtDist(p._d) + ' from centre';
    });
    if (!$('#list').hidden) renderList();
  }
  function wirePhotos() {}   // carousels are handled by GC.wireCarousels
  GC.wireCarousels(track);
  function cardIndexInView() {
    var mid = track.scrollLeft + track.clientWidth / 2, best = 0, bd = 1e9;
    Array.prototype.forEach.call(track.children, function (c, i) {
      var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function scrollToIndex(i, smooth) {
    var c = track.children[i]; if (!c) return;
    track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
  }
  function sheetH() { return state.open ? $('#sheet').offsetHeight : 0; }
  function setActive(i, fly) {
    if (i === state.active || !state.list[i]) return;
    var prev = state.list[state.active];
    if (prev) { var pe = state.markers[prev.n].getElement(); pe.classList.remove('on'); pe.firstChild.classList.remove('on'); }
    state.active = i;
    var p = state.list[i], m = state.markers[p.n];
    m.getElement().classList.add('on'); m.getElement().firstChild.classList.add('on');
    if (fly !== false) map.easeTo({ center: [p.lon, p.lat], offset: [0, -sheetH() / 2 + 20], duration: 600 });
    for (var k = i - 1; k <= i + 3; k++) if (state.list[k]) gList(state.list[k]);   // photo lists are free: fetch ahead
    clearTimeout(gT); gT = setTimeout(function () { var s = track.querySelector('.slides[data-n="' + p.n + '"]'); if (s) loadG(s, 0); }, 250);
  }

  var gT;
  function gList(p) {
    GC.gList(p, track, function () {
      if (state.list[state.active] === p) { var s = track.querySelector('.slides[data-n="' + p.n + '"]'); if (s) loadG(s, 0); }
    });
  }
  var loadG = GC.loadG;

  var scrollT;
  track.addEventListener('scroll', function () {
    clearTimeout(scrollT);
    scrollT = setTimeout(function () { setActive(cardIndexInView(), true); }, 90);   // fires once the snap settles
  }, { passive: true });
  track.addEventListener('click', function (e) {
    if (e.target.closest('.x')) { openSheet(false); return; }
    GC.toggleInfo(e);
  });

  function select(n, fromPin) {
    var i = state.list.findIndex(function (p) { return p.n === n; });
    if (i < 0) return;
    openSheet(true);
    scrollToIndex(i, true); setActive(i, true);
  }
  function openSheet(on) {
    state.open = on;
    document.body.classList.toggle('sheet-closed', !on);
  }
  $('#reopen').addEventListener('click', function () { openSheet(true); var p = state.list[state.active]; if (p) map.easeTo({ center: [p.lon, p.lat], offset: [0, -sheetH() / 2 + 20] }); });

  // ------------------------------------------------------------------ geolocation
  function gotFix(pos, recenter) {
    var first = !state.me;
    state.me = [pos.coords.longitude, pos.coords.latitude];
    showMe();
    $('#loc').classList.remove('busy');
    if (first || recenter) {
      var keep = state.list[state.active] ? state.list[state.active].n : null;
      rebuild(null);                                    // nearest first
      map.easeTo({ center: state.me, zoom: Math.max(map.getZoom(), 15), offset: [0, -sheetH() / 2 + 20], duration: 700 });
    } else updateDistances();
  }
  function geoErr(err) {
    $('#loc').classList.remove('busy');
    if (!state.me) toast(err && err.code === 1 ? 'Turn on location to sort places by distance' : 'No GPS signal yet. Showing distances from the centre', 6000);
  }
  function startWatch() {
    if (!('geolocation' in navigator)) { geoErr(); return; }
    if (state.watch != null) navigator.geolocation.clearWatch(state.watch);
    state.watch = navigator.geolocation.watchPosition(function (pos) { gotFix(pos, false); }, geoErr,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  $('#loc').addEventListener('click', function () {
    var b = this; b.classList.add('busy'); state.following = true; b.classList.add('on');
    if (!('geolocation' in navigator)) { geoErr(); return; }
    // re-sort from the latest watched position at once; a fresh fix (if it comes) refines it
    if (state.me) gotFix({ coords: { longitude: state.me[0], latitude: state.me[1] } }, true);
    b.classList.add('busy');
    navigator.geolocation.getCurrentPosition(function (pos) { gotFix(pos, true); startWatch(); }, geoErr,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  });

  // ------------------------------------------------------------------ filters + list
  function renderFilters() {
    var counts = {};
    state.all.forEach(function (p) { [p.cat].concat(p.also || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
    var cats = Object.keys(state.cats).filter(function (k) { return counts[k]; });
    $('#fcats').innerHTML = cats.map(function (k) {
      var c = state.cats[k];
      return '<button type="button" data-cat="' + k + '" class="' + (state.off[k] ? '' : 'on') + '" style="--c:' + c.col + '">' + c.e + ' ' + esc(c.short) + '</button>';
    }).join('');
    $('#fwhobox').hidden = state.who_list.length < 2;   // one person's list: nothing to filter
    $('#fwho').innerHTML = ['all'].concat(state.who_list).map(function (w) {
      return '<button type="button" data-who="' + w + '" class="' + (state.who === w ? 'on' : '') + '">' + (w === 'all' ? 'Everyone' : w) + '</button>';
    }).join('');
  }
  $('#filters').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cat) state.off[b.dataset.cat] = !state.off[b.dataset.cat];
    else if (b.dataset.who) state.who = b.dataset.who;
    else if (b.dataset.reset != null) { state.off = {}; state.who = 'all'; state.zone = null; }
    else if (b.dataset.close != null) { $('#filters').hidden = true; return; }
    renderFilters();
    var keep = state.list[state.active] ? state.list[state.active].n : null;
    rebuild(keep);
    markFilters();
  });
  function markFilters() { $('#fbtn').classList.toggle('dot', state.who !== 'all' || !!state.zone || Object.keys(state.off).some(function (k) { return state.off[k]; })); }
  // the "⛶ Full screen" buttons on the area / type / friend maps open this page with the same filter: ?zone= / ?cat= / ?who=
  function urlFilters() {
    var q = new URLSearchParams(location.search), cat = q.get('cat'), who = q.get('who'), zone = q.get('zone');
    if (cat && state.cats[cat]) Object.keys(state.cats).forEach(function (k) { state.off[k] = k !== cat; });
    if (who && state.who_list.indexOf(who) >= 0) state.who = who;
    if (zone && state.all.some(function (p) { return p.zone === zone; })) state.zone = zone;
    markFilters();
  }
  $('#fbtn').addEventListener('click', function () { $('#list').hidden = true; $('#filters').hidden = !$('#filters').hidden; });

  function renderList() {
    $('#lbody').innerHTML = state.list.map(function (p) {
      var c = state.cats[p.cat] || {};
      return '<li><button type="button" data-n="' + p.n + '"><span class="le" style="--c:' + c.col + '">' + c.e + '</span><span class="lt"><b>' + esc(p.name) + '</b>' +
        '<small>' + esc([p.price_level, fmtDist(p._d), p.by.join(' & ')].filter(Boolean).join(' · ')) + (p.status ? ' · ⏸' : '') + '</small></span></button></li>';
    }).join('');
  }
  $('#lbtn').addEventListener('click', function () { $('#filters').hidden = true; var l = $('#list'); l.hidden = !l.hidden; if (!l.hidden) renderList(); });
  $('#list').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.close != null) { $('#list').hidden = true; return; }
    if (b.dataset.n) { $('#list').hidden = true; select(+b.dataset.n); }
  });

  // ------------------------------------------------------------------ boot
  fetch('data.json?v=237e799f').then(function (r) { return r.json(); }).then(function (d) {
    state.cats = GC.cats = d.cats; state.all = d.places; d.places.forEach(function (p) { GC.byN[p.n] = p; }); state.who_list = GC.who = d.who || [];
    state.all.forEach(function (p) { state.markers[p.n] = new maplibregl.Marker({ element: pinEl(p), anchor: 'center' }).setLngLat([p.lon, p.lat]).addTo(map); });
    urlFilters();
    renderFilters();
    rebuild(null);
    // ask for location straight away; the page keeps working (centre + toast) if it is refused
    if (EMBED) return;   // embedded: distances from the centre until ⌖ is pressed
    if ('geolocation' in navigator) {
      $('#loc').classList.add('busy');
      navigator.geolocation.getCurrentPosition(function (pos) { gotFix(pos, true); startWatch(); }, geoErr,
        { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 });
    } else geoErr();
  }).catch(function (e) { toast('Could not load places (' + e.message + ')', 0); });
  map.on('click', function () { if (state.open && window.innerWidth < 700) openSheet(false); });
  window.__near = state; state.map = map;   // handy for debugging in the console
})();
