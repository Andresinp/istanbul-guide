/* City guide maps for the area / type / friend pages: same look as near.html (MapLibre + OpenFreeMap positron,
   white pins with one category-colour ring), no card sheet. Tap a pin for a small popup. Needs MapLibre GL. */
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
  function popup(p) {
    var c = CAT[p.cat] || {};
    return '<div class="pop"><b>' + esc(p.name) + '</b><span>' + (c.e || '') + ' ' + esc(c.label || '') +
      (p.price ? ' · ' + esc(p.price) : '') + (p.rating ? ' · ★ ' + esc(p.rating) : '') + '</span>' +
      (p.closed ? '<span class="warn">⏸ ' + esc(p.closed) + '</span>' : '') +
      '<span class="pl"><a href="' + esc(p.page) + '">Details</a><a target="_blank" rel="noopener" href="' + esc(p.link) + '">Google Maps ↗</a></span></div>';
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
      var m = new maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat([p.lon, p.lat])
        .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false, maxWidth: '240px' }).setHTML(popup(p))).addTo(map);
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
    function refresh() { markers.forEach(function (m) { m.getElement().style.display = visible(m._p) ? '' : 'none'; if (!visible(m._p)) m.getPopup().remove(); }); }
    if (bar) {
      var cats = {}; pts.forEach(function (p) { cats[p.cat] = 1; (p.also || []).forEach(function (c) { cats[c] = 1; }); });
      var html = '<div class="frow"><span class="flbl">Show</span><button class="on" data-all="1">All</button>';
      Object.keys(CAT).forEach(function (k) { if (cats[k]) html += '<button class="on" data-cat="' + k + '" style="--c:' + CAT[k].col + '">' + CAT[k].e + ' ' + CAT[k].short + '</button>'; });
      var WHO = ['all'].concat(window.ATH_WHO || []);
      html += '</div><div class="frow"><span class="flbl">' + (WHO.length > 2 ? 'From' : '') + '</span>';
      (WHO.length > 2 ? WHO : []).forEach(function (w) { html += '<button data-who="' + w + '" class="' + (w === 'all' ? 'on' : '') + '">' + (w === 'all' ? 'Everyone' : w) + '</button>'; });
      html += '<a class="near" href="near.html">📍 Near me</a></div>';
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
    return map;
  };
})();
