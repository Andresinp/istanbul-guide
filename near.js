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

  // ------------------------------------------------------------------ cards
  // Photos: our own (Wikimedia / venue site) first, then Google place photos up to 5 in total, owner's photos first.
  // Google images carry data-g and only get a src when that slide is shown (see loadG), so unseen photos cost nothing.
  var PIN = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="#EA4335" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>';
  function slidesOf(p) {
    var own = (p.photos || []).map(function (ph) { return { url: ph.url, credit: ph.credit }; });
    var g = own.length >= 3 ? [] : (p.gp || []).slice(0, 5 - own.length);
    return own.concat(g.map(function (ph) { return { g: ph.name, credit: 'Photo: ' + (ph.author || 'Google user') + ' · Google Maps' }; }));
  }
  function photosHTML(p) {
    var c = state.cats[p.cat] || {}, s = slidesOf(p);
    var tag = '<div class="tags"><span class="tag" style="--c:' + (c.col || '#444') + '">' + (c.e || '') + ' ' + esc(c.short || '') + '</span>' +
      (p.also || []).map(function (a) { var k = state.cats[a] || {}; return '<span class="also">' + (k.e || '') + ' ' + esc((k.short || '').toLowerCase()) + '</span>'; }).join('') + '</div>';
    var close = '<button class="x" type="button" aria-label="Hide cards">✕</button>';
    if (!s.length) {
      return '<div class="ph empty" style="--c:' + (c.col || '#444') + '">' + tag + close + '<span class="big">' + (c.e || '📍') + '</span>' +
        '<a class="gph" href="' + esc(p.link) + '" target="_blank" rel="noopener">Photos on Google Maps ↗</a></div>';
    }
    p.gl = p.gl || {};
    var slides = s.map(function (ph, i) {
      var src = ph.g ? (p.gl[i] ? ' src="' + gURL(ph.g) + '"' : '') + ' data-g="' + esc(ph.g) + '"' : ' src="' + esc(ph.url) + '"' + (i ? ' loading="lazy"' : '');
      return '<figure class="slide"><img decoding="async"' + src + ' alt="' + esc(p.name) + '" onerror="this.closest(\'.slide\').classList.add(\'broken\')">' +
        '<figcaption>' + esc(ph.credit) + '</figcaption></figure>';
    }).join('');
    var dots = s.length > 1 ? '<div class="dots">' + s.map(function (_, i) { return '<i class="' + (i ? '' : 'on') + '"></i>'; }).join('') + '</div>' : '';
    return '<div class="ph">' + tag + close + '<div class="slides" data-n="' + p.n + '">' + slides + '</div>' + dots + '</div>';
  }
  function cardHTML(p) {
    var by = p.by.join(' & ');
    var chips = p.vibe ? '<span class="chip v-' + p.vibe + '">● ' + esc(p.vibeLabel) + '</span>' : '';   // secondary types sit on the photo
    var alerts = (p.status ? '<div class="alert">⏸ ' + esc(p.status) + ' on Google (checked 7 Oct 2026)</div>' : '') +
      (p.warning ? '<div class="alert">⚠ ' + esc(p.warning) + '</div>' : '');
    var prices = (p.prices || []).map(function (x) { return '<span>' + esc(x[0]) + ' <b>' + esc(x[1]) + '</b></span>'; }).join('');
    var det = (p.tips || []).map(function (t) { return '<p class="tip">💬 ' + esc(t) + '</p>'; }).join('') +
      (p.what_it_is ? '<p><b>In practice:</b> ' + esc(p.what_it_is) + '</p>' : '') +
      (p.topics && p.topics.length ? '<p class="mut">Reviewers mention: ' + esc(p.topics.join(', ')) + '.</p>' : '') +
      (p.pp || prices ? '<p class="prices">💶 ' + esc([p.price_level, p.pp ? p.pp + ' per person (Google)' : ''].filter(Boolean).join(' · ')) + (prices ? '<br>' + prices : '') + '</p>' : '') +
      '<p>' + esc(p.background) + '</p><p class="mut">📍 ' + esc(p.address) + ' · ' + esc(p.zoneName) + '</p>' +
      (p.website ? '<p><a href="' + esc(p.website) + '" target="_blank" rel="noopener">Website / Instagram ↗</a></p>' : '');
    var meta = [p.price_level, p.rating ? '★ ' + p.rating : ''].filter(Boolean).join(' · ');
    return '<article class="card" data-n="' + p.n + '" aria-label="' + esc(p.name) + '">' + photosHTML(p) +
      '<div class="body"><div class="row1"><h2>' + esc(p.name) + '</h2><span class="price">' + esc(meta) + '</span></div>' +
      '<div class="by"><span class="dist" data-d="' + p.n + '"></span>' + ((state.whoAll || []).length > 1 ? ' · by <b>' + esc(by) + '</b>' : '') + '</div>' +
      '<div class="row3"><div class="chips">' + chips + '</div>' +
      '<a class="gmb" target="_blank" rel="noopener" href="' + esc(p.link) + '">' + PIN + 'Google Maps</a>' +
      '<button type="button" class="mb" aria-expanded="false">Info ▾</button></div>' + alerts +
      '<div class="more" hidden>' + det + '</div></div></article>';
  }

  var track = $('#cards');
  function visible(p) {
    var catOk = !state.off[p.cat] || (p.also || []).some(function (c) { return !state.off[c]; });
    return catOk && (state.who === 'all' || p.by.indexOf(state.who) >= 0);
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
  function wirePhotos() {}   // carousels are handled by the capture listener below
  track.addEventListener('scroll', function (e) {
    var s = e.target;
    if (!s.classList || !s.classList.contains('slides')) return;
    var x = s.scrollLeft / s.clientWidth, i = Math.round(x);
    s.parentNode.querySelectorAll('.dots i').forEach(function (d, k) { d.classList.toggle('on', k === i); });
    loadG(s, Math.floor(x)); loadG(s, Math.ceil(x));   // the slide coming into view starts loading as the swipe begins
  }, { capture: true, passive: true });
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

  // ------------------------------------------------------------------ Google place photos
  // Key in places-key.js (window.ATH_GKEY), locked to this site and to Places API (New). A place's photo list is free
  // (Place Details "IDs only"); each image shown counts towards the free monthly allowance. An image is requested only
  // when its slide is on screen; G_DAY caps images per day on this device; the real ceiling is the daily quota in Google Cloud.
  var gT, G_DAY = 150, G_W = 720;
  function gURL(name) { return 'https://places.googleapis.com/v1/' + name + '/media?maxWidthPx=' + G_W + '&key=' + window.ATH_GKEY; }
  function gBudget(take) {
    var k = 'gph-' + new Date().toISOString().slice(0, 10), n = G_DAY;
    try { n = +localStorage.getItem(k) || 0; if (take && n < G_DAY) localStorage.setItem(k, n + 1); } catch (e) {}   // no storage: no Google photos
    return n < G_DAY;
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9α-ω]+/g, ' ').trim(); }
  function isOwner(p, author) {   // the venue's own uploads carry the venue's name as author
    var a = norm(author), w = norm(p.name).split(' ').filter(function (t) { return t.length >= 4; });
    return !!a && w.some(function (t) { return a.indexOf(t) >= 0; });
  }
  function gList(p) {
    if (!window.ATH_GKEY || !p.gid || p.gp || p._gq || (p.photos || []).length >= 3) return;
    p._gq = 1;
    fetch('https://places.googleapis.com/v1/places/' + p.gid + '?fields=photos&key=' + window.ATH_GKEY)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var ph = (d && d.photos || []).map(function (x) { var a = (x.authorAttributions || [])[0] || {}; return { name: x.name, author: a.displayName || '' }; });
        ph.forEach(function (x, i) { x.o = isOwner(p, x.author) ? 0 : 1; x.i = i; });
        p.gp = ph.sort(function (a, b) { return a.o - b.o || a.i - b.i; });   // owner's photos first, then Google's own order
        var box = track.querySelector('.card[data-n="' + p.n + '"] .ph');
        if (box && p.gp.length) {
          box.outerHTML = photosHTML(p);
          if (state.list[state.active] === p) { var s = track.querySelector('.slides[data-n="' + p.n + '"]'); if (s) loadG(s, 0); }
        }
      }).catch(function () { p._gq = 0; });
  }
  function loadG(s, i) {
    var img = s.querySelectorAll('img')[i];
    if (!img || !img.dataset.g || img.getAttribute('src') || !gBudget(true)) return;
    var p = state.all.find(function (q) { return q.n === +s.dataset.n; });
    img.src = gURL(img.dataset.g); if (p) p.gl[i] = 1;
    state.gShown = (state.gShown || 0) + 1;
  }

  var scrollT;
  track.addEventListener('scroll', function () {
    clearTimeout(scrollT);
    scrollT = setTimeout(function () { setActive(cardIndexInView(), true); }, 90);   // fires once the snap settles
  }, { passive: true });
  track.addEventListener('click', function (e) {
    if (e.target.closest('.x')) { openSheet(false); return; }
    var mb = e.target.closest('.mb');
    if (mb) { var more = mb.closest('.body').querySelector('.more'), op = more.hidden; more.hidden = !op;
      mb.setAttribute('aria-expanded', op); mb.textContent = op ? 'Less ▴' : 'Info ▾'; if (op) more.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
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
    var who = ['all'].concat(state.whoAll || []);
    $('#fwhobox').hidden = who.length < 3;   // one person's list: nothing to filter
    $('#fwho').innerHTML = who.map(function (w) {
      return '<button type="button" data-who="' + w + '" class="' + (state.who === w ? 'on' : '') + '">' + (w === 'all' ? 'Everyone' : w) + '</button>';
    }).join('');
  }
  $('#filters').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cat) state.off[b.dataset.cat] = !state.off[b.dataset.cat];
    else if (b.dataset.who) state.who = b.dataset.who;
    else if (b.dataset.reset != null) { state.off = {}; state.who = 'all'; }
    else if (b.dataset.close != null) { $('#filters').hidden = true; return; }
    renderFilters();
    var keep = state.list[state.active] ? state.list[state.active].n : null;
    rebuild(keep);
    $('#fbtn').classList.toggle('dot', state.who !== 'all' || Object.keys(state.off).some(function (k) { return state.off[k]; }));
  });
  $('#fbtn').addEventListener('click', function () { $('#list').hidden = true; $('#filters').hidden = !$('#filters').hidden; });

  function renderList() {
    $('#lbody').innerHTML = state.list.map(function (p) {
      var c = state.cats[p.cat] || {};
      return '<li><button type="button" data-n="' + p.n + '"><span class="le" style="--c:' + c.col + '">' + c.e + '</span><span class="lt"><b>' + esc(p.name) + '</b>' +
        '<small>' + esc([p.price_level, fmtDist(p._d), (state.whoAll || []).length > 1 ? p.by.join(' & ') : ''].filter(Boolean).join(' · ')) + (p.status ? ' · ⏸' : '') + '</small></span></button></li>';
    }).join('');
  }
  $('#lbtn').addEventListener('click', function () { $('#filters').hidden = true; var l = $('#list'); l.hidden = !l.hidden; if (!l.hidden) renderList(); });
  $('#list').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.close != null) { $('#list').hidden = true; return; }
    if (b.dataset.n) { $('#list').hidden = true; select(+b.dataset.n); }
  });

  // ------------------------------------------------------------------ boot
  fetch('data.json?v=9aa317c7').then(function (r) { return r.json(); }).then(function (d) {
    state.cats = d.cats; state.all = d.places; state.whoAll = d.who || [];
    state.all.forEach(function (p) { state.markers[p.n] = new maplibregl.Marker({ element: pinEl(p), anchor: 'center' }).setLngLat([p.lon, p.lat]).addTo(map); });
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
