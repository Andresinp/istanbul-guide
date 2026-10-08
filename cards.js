/* Place cards, shared by near.html (the swipeable sheet) and the area / type / friend maps (one card when a pin is tapped).
   Photos: our own (Wikimedia / venue site) first, then Google place photos up to 5 in total, owner's photos first.
   Google images carry data-g and only get a src when that slide is shown (see loadG), so unseen photos cost nothing. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var GC = window.GuideCards = { cats: {}, byN: {}, shown: 0, esc: esc };   // cats and byN are filled in by the page
  var PIN = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="#EA4335" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>';

  function slidesOf(p) {
    var own = (p.photos || []).map(function (ph) { return { url: ph.url, credit: ph.credit }; });
    var g = own.length >= 3 ? [] : (p.gp || []).slice(0, 5 - own.length);
    return own.concat(g.map(function (ph) { return { g: ph.name, credit: 'Photo: ' + (ph.author || 'Google user') + ' · Google Maps' }; }));
  }
  GC.photosHTML = function (p) {
    var c = GC.cats[p.cat] || {}, s = slidesOf(p);
    var tag = '<div class="tags"><span class="tag" style="--c:' + (c.col || '#444') + '">' + (c.e || '') + ' ' + esc(c.short || '') + '</span>' +
      (p.also || []).map(function (a) { var k = GC.cats[a] || {}; return '<span class="also">' + (k.e || '') + ' ' + esc((k.short || '').toLowerCase()) + '</span>'; }).join('') + '</div>';
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
  };
  GC.cardHTML = function (p) {
    var by = p.by.join(' & ');
    var chips = p.vibe ? '<span class="chip v-' + p.vibe + '">● ' + esc(p.vibeLabel) + '</span>' : '';   // secondary types sit on the photo
    var alerts = (p.status ? '<div class="alert">⏸ ' + esc(p.status) + ' on Google (checked 7 Oct 2026)</div>' : '') +
      (p.warning ? '<div class="alert">⚠ ' + esc(p.warning) + '</div>' : '');
    var prices = (p.prices || []).map(function (x) { return '<span>' + esc(x[0]) + ' <b>' + esc(x[1]) + '</b></span>'; }).join('');
    var det = (p.tips || []).map(function (t) { return '<p class="tip">💬 ' + esc(t) + '</p>'; }).join('') +
      '<p>' + esc(p.background) + '</p>' +
      (p.topics && p.topics.length ? '<p class="mut">Reviewers mention: ' + esc(p.topics.join(', ')) + '.</p>' : '') +
      (p.pp || prices ? '<p class="prices">💶 ' + esc([p.price_level, p.pp ? p.pp + ' per person (' + (p.ppSrc || 'Google') + ')' : ''].filter(Boolean).join(' · ')) + (prices ? '<br>' + prices : '') + '</p>' : '') +
      '<p class="mut">📍 ' + esc(p.address) + ' · ' + esc(p.zoneName) + '</p>' +
      (p.website ? '<p><a href="' + esc(p.website) + '" target="_blank" rel="noopener">Website / Instagram ↗</a></p>' : '');
    var meta = [p.price_level, p.rating ? '★ ' + p.rating : ''].filter(Boolean).join(' · ');
    return '<article class="card" data-n="' + p.n + '" aria-label="' + esc(p.name) + '">' + GC.photosHTML(p) +
      '<div class="body"><div class="row1"><h2>' + esc(p.name) + '</h2><span class="price">' + esc(meta) + '</span></div>' +
      '<div class="by"><span class="dist" data-d="' + p.n + '"></span>' + ((GC.who || []).length > 1 ? (GC.noDist ? '' : ' · ') + 'by <b>' + esc(by) + '</b>' : '') + '</div>' +
      '<div class="row3"><div class="chips">' + chips + '</div>' +
      '<a class="gmb" target="_blank" rel="noopener" href="' + esc(p.link) + '">' + PIN + 'Google Maps</a>' +
      '<button type="button" class="mb" aria-expanded="false">Info ▾</button></div>' + alerts +
      '<div class="more" hidden>' + det + '</div></div></article>';
  };
  // "Info ▾" toggle; returns true when the click was handled
  GC.toggleInfo = function (e) {
    var mb = e.target.closest('.mb'); if (!mb) return false;
    var more = mb.closest('.body').querySelector('.more'), op = more.hidden; more.hidden = !op;
    mb.setAttribute('aria-expanded', op); mb.textContent = op ? 'Less ▴' : 'Info ▾'; if (op) more.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return true;
  };
  // photo carousels inside root: dots follow the swipe, and the slide coming into view starts loading as the swipe begins
  GC.wireCarousels = function (root) {
    root.addEventListener('scroll', function (e) {
      var s = e.target;
      if (!s.classList || !s.classList.contains('slides')) return;
      var x = s.scrollLeft / s.clientWidth, i = Math.round(x);
      s.parentNode.querySelectorAll('.dots i').forEach(function (d, k) { d.classList.toggle('on', k === i); });
      GC.loadG(s, Math.floor(x)); GC.loadG(s, Math.ceil(x));
    }, { capture: true, passive: true });
  };

  // ------------------------------------------------------------------ Google place photos
  // Key in places-key.js (window.ATH_GKEY), locked to this site and to Places API (New). A place's photo list is free
  // (Place Details "IDs only"); each image shown counts towards the free monthly allowance. An image is requested only
  // when its slide is on screen; G_DAY caps images per day on this device; the real ceiling is the daily quota in Google Cloud.
  var G_DAY = 150, G_W = 720;
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
  // fetch a place's photo list (free); when it arrives, redraw that card's photo box inside root and call done(p)
  GC.gList = function (p, root, done) {
    if (!window.ATH_GKEY || !p.gid || p.gp || p._gq || (p.photos || []).length >= 3) return;
    p._gq = 1;
    fetch('https://places.googleapis.com/v1/places/' + p.gid + '?fields=photos&key=' + window.ATH_GKEY)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var ph = (d && d.photos || []).map(function (x) { var a = (x.authorAttributions || [])[0] || {}; return { name: x.name, author: a.displayName || '' }; });
        ph.forEach(function (x, i) { x.o = isOwner(p, x.author) ? 0 : 1; x.i = i; });
        p.gp = ph.sort(function (a, b) { return a.o - b.o || a.i - b.i; });   // owner's photos first, then Google's own order
        var box = root.querySelector('.card[data-n="' + p.n + '"] .ph');
        if (box && p.gp.length) { box.outerHTML = GC.photosHTML(p); if (done) done(p); }
      }).catch(function () { p._gq = 0; });
  };
  GC.loadG = function (s, i) {
    var img = s.querySelectorAll('img')[i];
    if (!img || !img.dataset.g || img.getAttribute('src') || !gBudget(true)) return;
    var p = GC.byN[+s.dataset.n];
    img.src = gURL(img.dataset.g); if (p) p.gl[i] = 1;
    GC.shown++;
  };
})();
