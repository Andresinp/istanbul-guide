/* City guide maps for the area / type / friend pages: same look as near.html (MapLibre + OpenFreeMap positron,
   white pins with one category-colour ring). Tapping a pin opens the same place card as near.html (cards.js), over the map.
   Needs MapLibre GL and cards.js; the card data (data.json) is fetched on the first tap. */
(function () {
  'use strict';
  var CAT = window.ATH_CATS || {};
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  // pastel fills in the spirit of the neighbourhood picture on the start page
  var PASTEL = { 'cihangir': '#f6b98a', 'beyoglu': '#ecc6e3', 'karakoy': '#cfc6ec', 'besiktas': '#f2d78f', 'nisantasi': '#dfe3a6',
    'bosphorus': '#f3b0a0', 'oldcity': '#b9d7e8', 'asian': '#c6dfb0' };
  function km(a, b, c, d) {
    var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
  }
  // ---- place card over the map (same card as near.html)
  var GC = window.GuideCards, dataP = null;
  function data() {
    if (!dataP) dataP = fetch(window.ATH_DATA || 'data.json').then(function (r) { return r.json(); }).then(function (d) {
      GC.cats = d.cats; GC.noDist = true; GC.who = d.who || []; d.places.forEach(function (p) { GC.byN[p.n] = p; }); return d;
    });
    return dataP;
  }
  function cardBox(el, map) {
    if (el._card) return el._card;
    var box = document.createElement('div'); box.className = 'gc mapcard'; box.hidden = true;
    el.parentNode.appendChild(box); el._card = box;
    GC.wireCarousels(box);
    box.addEventListener('click', function (e) {
      if (e.target.closest('.x')) { closeCard(el); return; }
      GC.toggleInfo(e);
    });
    map.on('click', function () { closeCard(el); });
    return box;
  }
  function closeCard(el) {
    if (!el._card || el._card.hidden) return;
    el._card.hidden = true; el._card.innerHTML = '';
    el.querySelectorAll('.pin.on').forEach(function (x) { x.classList.remove('on'); });
  }
  function openCard(el, map, n, pin) {
    var box = cardBox(el, map);
    data().then(function () {
      var p = GC.byN[n]; if (!p) return;
      box.innerHTML = GC.cardHTML(p).replace('aria-label="Hide cards"', 'aria-label="Close card"'); box.hidden = false;
      el.querySelectorAll('.pin.on').forEach(function (x) { x.classList.remove('on'); }); pin.classList.add('on');
      var first = function () { var s = box.querySelector('.slides'); if (s) GC.loadG(s, 0); };
      GC.gList(p, box, first); setTimeout(first, 250);
    }).catch(function () { location.href = pin.dataset.page; });   // no data: fall back to the place's entry in its area page
  }
  window.AthensMap = function (id, pts, opt) {
    opt = opt || {};
    var el = document.getElementById(id); if (!el || !window.maplibregl) return;
    var map = new maplibregl.Map({ container: id, style: 'https://tiles.openfreemap.org/styles/positron', center: [28.9830, 41.0315], zoom: 13,
      cooperativeGestures: true, dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: { compact: true } });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', function () { var at = el.querySelector('.maplibregl-ctrl-attrib'); if (at) at.classList.remove('maplibregl-compact-show'); });   // credits start as a small ⓘ

    // fit to the dense core: places within 2.4 km of the median point (outliers stay on the map, just off-screen)
    var b = new maplibregl.LngLatBounds();
    if (pts.length) {
      var la = pts.map(function (p) { return p.lat; }).sort(), lo = pts.map(function (p) { return p.lon; }).sort();
      var cLa = la[Math.floor(la.length / 2)], cLo = lo[Math.floor(lo.length / 2)];
      pts.forEach(function (p) { if (pts.length < 4 || km(cLa, cLo, p.lat, p.lon) < 2.4) b.extend([p.lon, p.lat]); });
    }
    (opt.areas || []).forEach(function (a) { a.shape.forEach(function (ll) { b.extend([ll[1], ll[0]]); }); });
    if (!b.isEmpty()) map.fitBounds(b, { padding: 36, maxZoom: 16, duration: 0 });

    if (opt.areas && opt.areas.length) {
      map.on('load', function () {
        var fc = { type: 'FeatureCollection', features: opt.areas.map(function (a) {
          var ring = a.shape.map(function (ll) { return [ll[1], ll[0]]; }); ring.push(ring[0]);
          return { type: 'Feature', properties: { col: PASTEL[a.z] || a.col }, geometry: { type: 'Polygon', coordinates: [ring] } };
        }) };
        map.addSource('areas', { type: 'geojson', data: fc });
        var first = (map.getStyle().layers.find(function (l) { return l.type === 'symbol'; }) || {}).id;   // under street names
        map.addLayer({ id: 'area-fill', type: 'fill', source: 'areas', paint: { 'fill-color': ['get', 'col'], 'fill-opacity': 0.5 } }, first);
        map.addLayer({ id: 'area-line', type: 'line', source: 'areas', paint: { 'line-color': '#ffffff', 'line-width': 2 } }, first);
      });
    }

    var markers = [];
    pts.forEach(function (p) {
      var c = CAT[p.cat] || {}, wrap = document.createElement('div'), btn = document.createElement('button');
      wrap.className = 'mk'; wrap.appendChild(btn);    // MapLibre positions the wrapper; only the inner pin is styled
      btn.type = 'button'; btn.className = 'pin' + (p.closed ? ' pin-off' : ''); btn.style.setProperty('--c', c.col || '#555');
      btn.setAttribute('aria-label', p.n + '. ' + p.name);
      btn.innerHTML = '<span class="pe">' + (c.e || '📍') + '</span><b class="pn">' + p.n + '</b>';
      btn.dataset.page = p.page;
      btn.addEventListener('click', function (e) { e.stopPropagation(); openCard(el, map, p.n, btn); });
      var m = new maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat([p.lon, p.lat]).addTo(map);
      m._p = p; markers.push(m);
    });

    // ---- filters (type + friend); "Near me" opens the full-screen page
    var bar = opt.filters && document.getElementById(id + '-f');
    var activeCats = {}, who = 'all';
    Object.keys(CAT).forEach(function (k) { activeCats[k] = true; });
    function visible(p) {
      var catOk = activeCats[p.cat] || (p.also || []).some(function (c) { return activeCats[c]; });
      return catOk && (who === 'all' || p.by.indexOf(who) >= 0);
    }
    function refresh() { closeCard(el); markers.forEach(function (m) { m.getElement().style.display = visible(m._p) ? '' : 'none'; }); }
    if (bar) {
      var cats = {}; pts.forEach(function (p) { cats[p.cat] = 1; (p.also || []).forEach(function (c) { cats[c] = 1; }); });
      var html = '<div class="frow"><span class="flbl">Show</span><button class="on" data-all="1">All</button>';
      Object.keys(CAT).forEach(function (k) { if (cats[k]) html += '<button class="on" data-cat="' + k + '" style="--c:' + CAT[k].col + '">' + CAT[k].e + ' ' + CAT[k].short + '</button>'; });
      var WHO = window.ATH_WHO || [];
      if (WHO.length > 1) html += '</div><div class="frow"><span class="flbl">From</span>';   // one person's list: no friend row
      (WHO.length > 1 ? ['all'].concat(WHO) : []).forEach(function (w) { html += '<button data-who="' + w + '" class="' + (w === 'all' ? 'on' : '') + '">' + (w === 'all' ? 'Everyone' : w) + '</button>'; });
      html += '</div>';   // "⛶ Full screen" sits on the map itself
      bar.innerHTML = html;
      bar.addEventListener('click', function (e) {
        var t = e.target.closest('button'); if (!t) return;
        if (t.dataset.all) { var allOn = Object.keys(activeCats).every(function (k) { return activeCats[k]; });
          Object.keys(activeCats).forEach(function (k) { activeCats[k] = !allOn; });
          bar.querySelectorAll('[data-cat]').forEach(function (x) { x.classList.toggle('on', !allOn); }); t.classList.toggle('on', !allOn); }
        else if (t.dataset.cat) { activeCats[t.dataset.cat] = !activeCats[t.dataset.cat]; t.classList.toggle('on'); }
        else if (t.dataset.who) { who = t.dataset.who; bar.querySelectorAll('[data-who]').forEach(function (x) { x.classList.toggle('on', x === t); }); }
        refresh();
      });
    }
    // ---- "locate me" on the map (blue dot that follows you) + "Nearest to me" sort for the list under the map
    var geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true, timeout: 15000 }, trackUserLocation: true, showAccuracyCircle: false });
    map.addControl(geo, 'top-right');
    var me = null, wantSort = false, sortOut = opt.sort && document.getElementById(id + '-near'), list = null, near = null;   // the list comes after this script: looked up on first use
    geo.on('geolocate', function (pos) {
      me = [pos.coords.latitude, pos.coords.longitude];
      if (wantSort) { wantSort = false; sortNear(); } else if (near && !near.hidden) distances();
    });
    geo.on('error', function () { if (wantSort) { wantSort = false; setMode(false); msg('Turn on location to sort by distance.'); } });
    function walk(m) {   // same estimate as near.html: straight line × 1.3, 80 m a minute
      var min = Math.max(1, Math.round(m * 1.3 / 80)), d = m < 1000 ? (Math.round(m / 10) * 10) + ' m' : (m / 1000).toFixed(1) + ' km';
      return min > 60 ? d + ' · metro/taxi' : d + ' · ' + min + ' min walk';
    }
    function ll(c) { return c.dataset.ll.split(',').map(Number); }
    function msg(t) { var m = sortOut.querySelector('.smsg'); if (m) m.textContent = t || ''; }
    function setMode(isNear) {
      if (!list) return;
      sortOut.querySelectorAll('[data-sort]').forEach(function (b) { b.classList.toggle('on', (b.dataset.sort === 'near') === isNear); });
      list.hidden = isNear; if (near) near.hidden = !isNear;
    }
    function distances() {
      near.querySelectorAll('.card').forEach(function (c) { var q = ll(c); c.querySelector('.dist-b').textContent = '📍 ' + walk(km(me[0], me[1], q[0], q[1]) * 1000); });
    }
    function sortNear() {   // a copy of the list, one card per place, nearest first; the original grouped list stays as it was
      var seen = {}, cards = [].filter.call(list.querySelectorAll('.card[data-ll]'), function (c) { return seen[c.id] ? false : (seen[c.id] = 1); });
      cards.sort(function (a, b) { var p = ll(a), q = ll(b); return km(me[0], me[1], p[0], p[1]) - km(me[0], me[1], q[0], q[1]); });
      if (!near) { near = document.createElement('div'); near.className = 'plist-near'; list.parentNode.insertBefore(near, list.nextSibling); }
      near.innerHTML = '';
      cards.forEach(function (c) {
        var k = c.cloneNode(true); k.removeAttribute('id');
        var d = document.createElement('div'); d.className = 'dist-b'; k.querySelector('h3').after(d); near.appendChild(k);
      });
      distances(); setMode(true); msg('Nearest first from where you are.');
    }
    if (sortOut) {
      sortOut.innerHTML = '<div class="filters-bar sortbar"><span class="flbl">Sort</span><button type="button" class="on" data-sort="list">' + esc(opt.sort) +
        '</button><button type="button" data-sort="near">📍 Nearest to me</button><span class="smsg"></span></div>';
      sortOut.addEventListener('click', function (e) {
        var b = e.target.closest('[data-sort]'); if (!b) return;
        list = list || document.querySelector('.plist'); if (!list) return;
        if (b.dataset.sort === 'list') { setMode(false); msg(''); return; }
        if (me) { sortNear(); return; }
        if (!('geolocation' in navigator)) { msg('Location is not available on this device.'); return; }
        wantSort = true; msg('Finding you…'); geo.trigger();   // also shows you on the map
      });
    }
    return map;
  };
})();
