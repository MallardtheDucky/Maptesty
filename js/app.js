
(function(){
  "use strict";

  const DATA = window.RIFTFALL_DATA;
  const COUNTRY_MAP = window.RIFTFALL_COUNTRY_MAP;

    // Restrained, low-saturation palette. Amber and red are deliberately
  // excluded here — those two are reserved elsewhere in the UI for
  // "approximate" and "classified" meaning, so reusing them per-faction
  // would blur signal with noise. A short cycling set reads as one
  // coherent filing system instead of a wall of distinct hues.
  const FACTION_COLORS = [
    "#5fd4c4","#7c93b0","#9b8fc9","#7fae8a",
    "#a98fae","#7ea3ae","#a99b7c","#6f8fa3"
  ];
  DATA.factions.forEach((f,i)=>{ f.color = FACTION_COLORS[i % FACTION_COLORS.length]; });
  const factionByName = {};
  DATA.factions.forEach(f=> factionByName[f.name] = f);

  const PRECISION_LABEL = {
    confirmed: "CONFIRMED", approx: "APPROXIMATE", classified: "CLASSIFIED", orbital: "NON-TERRESTRIAL"
  };

    const bootLines = [
    "CONTINUANCE NETWORK // TERMINAL AUTH — REQUESTING UPLINK",
    "VERIFYING ARCHIVE INTEGRITY ................. OK",
    "DECRYPTING FACTION HOLDINGS REGISTER ......... OK",
    "LOADING CARTOGRAPHIC SURVEY (CUSTOM.GEO) ..... OK",
    "CROSS-REFERENCING 25 KNOWN ENTITIES .......... OK",
    "CLEARANCE LEVEL: OBSERVER — READ ONLY",
    "",
    "WELCOME TO THE RIFTFALL SURVEILLANCE ARCHIVE"
  ];
  function runBoot(){
    const boot = document.getElementById('boot');
    const wrap = document.getElementById('boot-lines');
    let i = 0;
    function next(){
      if(i >= bootLines.length){
        const skip = document.createElement('div');
        skip.className = 'boot-skip';
        skip.innerHTML = 'CLICK TO CONTINUE <span class="cursor"></span>';
        wrap.appendChild(skip);
        return;
      }
      const div = document.createElement('div');
      div.className = 'boot-line';
      div.textContent = bootLines[i];
      wrap.appendChild(div);
      requestAnimationFrame(()=> div.classList.add('show'));
      i++;
      setTimeout(next, bootLines[i-1] === "" ? 120 : 220);
    }
    next();
    boot.addEventListener('click', ()=>{
      boot.classList.add('hidden');
    }, { once:false });
  }

    const map = L.map('map', {
    center: [20, 10],
    zoom: 2,
    minZoom: 2,
    maxZoom: 9,
    worldCopyJump: true,
    zoomControl: false, // added manually below, bottom-left — top-left is the breadcrumb bar's spot
    attributionControl: true
  });
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  map.attributionControl.setPrefix('Boundaries: Natural Earth / amCharts geodata (free-licensed) — Rendered with Leaflet');

  let worldLayer = null;
  let factionLayerGroup = L.layerGroup().addTo(map);
  let zoneLayerGroup = L.layerGroup().addTo(map);
  let incidentLayerGroup = L.layerGroup().addTo(map);
  let selectedLayer = null;
  const geoCache = {};

  function scanFlash(){
    const el = document.getElementById('scan-flash');
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
  }

    fetch('geodata/world.json').then(r=>r.json()).then(world=>{

    const makeWorld = (offset)=> L.geoJSON(world, {
      coordsToLatLng: coords => L.latLng(coords[1], coords[0] + offset),
      style: baseCountryStyle,
      onEachFeature: (feature, layer)=>{
        layer.on('mouseover', ()=>{ if(layer !== selectedLayer) layer.setStyle(hoverCountryStyle()); });
        layer.on('mouseout', ()=>{ if(layer !== selectedLayer) layer.setStyle(baseCountryStyle()); });
        layer.on('click', ()=> openRegionalWindow(feature, layer));
      }
    });

    worldLayer = L.layerGroup([
      makeWorld(-360),
      makeWorld(0),
      makeWorld(360)
    ]).addTo(map);

    setStatus('cartography-status', 'WORLD SURVEY LOADED');
  }).catch(err=>{
    console.error(err);
    setStatus('cartography-status', 'WORLD SURVEY LOAD FAILED');
  });

  function baseCountryStyle(){
    return { color:'#4f6f6a', weight:1, fillColor:'#0e2b26', fillOpacity:0.42 };
  }
  function hoverCountryStyle(){
    return { color:'#8fe8da', weight:1.6, fillColor:'#163f38', fillOpacity:0.62 };
  }
  function selectedCountryStyle(){
    return { color:'#e0a53f', weight:2, fillColor:'#2a2313', fillOpacity:0.5 };
  }

    let regionalMap = null;
  let regionalCountryLayer = L.layerGroup();
  let regionalMarkerLayer = L.layerGroup();

  function ensureRegionalMap(){
    if(regionalMap) return regionalMap;
    regionalMap = L.map('regional-map', {
      center: [0,0], zoom: 2, worldCopyJump:false,
      attributionControl:false, zoomControl:true
    });
    regionalCountryLayer.addTo(regionalMap);
    regionalMarkerLayer.addTo(regionalMap);
    return regionalMap;
  }

  function openRegionalWindow(feature, layer){
    const name = feature.properties.name;
    const iso3 = COUNTRY_MAP[name];
    currentRegionalCountryName = name;

    if(selectedLayer && selectedLayer !== layer) worldLayer.resetStyle(selectedLayer);
    selectedLayer = layer;
    layer.setStyle(selectedCountryStyle());
    layer.bringToFront();

    scanFlash();
    document.getElementById('regional-title').textContent = name.toUpperCase();
    document.getElementById('regional-panel').classList.add('open');

    const rmap = ensureRegionalMap();
    regionalCountryLayer.clearLayers();
    regionalMarkerLayer.clearLayers();
    document.getElementById('regional-note').textContent = 'LOADING REGIONAL SURVEY…';

    setTimeout(()=> rmap.invalidateSize(), 30);

    function finish(geojsonOrNull){
      if(geojsonOrNull){
        const sub = L.geoJSON(geojsonOrNull, {
          style: ()=> ({ color:'#5c7b74', weight:1.1, fillColor:'#12211f', fillOpacity:0.55 }),
          onEachFeature: (f, l)=>{
            const nm = (f.properties && f.properties.name) || 'Unknown Division';
            l.bindTooltip(nm, { className:'subdiv-label', sticky:true, direction:'top' });
            l.on('mouseover', ()=> l.setStyle({ color:'#8fe8da', weight:1.8, fillColor:'#1c3d38', fillOpacity:0.7 }));
            l.on('mouseout', ()=> l.setStyle({ color:'#5c7b74', weight:1.1, fillColor:'#12211f', fillOpacity:0.55 }));
          }
        }).addTo(regionalCountryLayer);
        document.getElementById('regional-note').textContent =
          sub.getLayers().length + ' INTERNAL DIVISION' + (sub.getLayers().length===1?'':'S') + ' ON RECORD';
        if(iso3 === 'RUS'){
          // Russia crosses the antimeridian; getBounds() would treat the
          // Chukotka pieces at +/-180 as a nearly world-wide extent.
          rmap.fitBounds([[41, 19], [82, 180]], { padding:[20,20], duration:0.4, maxZoom:4 });
        } else {
          rmap.flyToBounds(sub.getBounds(), { padding:[20,20], duration:0.4 });
        }
      } else {
        const outline = L.geoJSON(feature, {
          style: ()=> ({ color:'#5c7b74', weight:1.4, fillColor:'#12211f', fillOpacity:0.55 })
        }).addTo(regionalCountryLayer);
        document.getElementById('regional-note').textContent =
          'NO REGIONAL SUBDIVISION SURVEY ON FILE — NATIONAL BOUNDARY ONLY';
        if(iso3 === 'RUS'){
          rmap.fitBounds([[41, 19], [82, 180]], { padding:[20,20], duration:0.4, maxZoom:4 });
        } else {
          rmap.flyToBounds(outline.getBounds(), { padding:[20,20], duration:0.4 });
        }
      }
      plotRegionalMarkers(name);
    }

    if(!iso3){ finish(null); return; }
    if(geoCache[iso3]){ finish(geoCache[iso3]); return; }
    fetch('geodata/countries/' + iso3 + '.json').then(r=>{
      if(!r.ok) throw new Error('not found');
      return r.json();
    }).then(gj=>{ geoCache[iso3] = gj; finish(gj); }).catch(()=> finish(null));
  }

  let currentRegionalCountryName = null;

  function plotRegionalMarkers(countryName){
    regionalMarkerLayer.clearLayers();
    DATA.factions.forEach(faction=>{
      if(activeFactionFilter && faction !== activeFactionFilter) return;
      faction.holdings.forEach(h=>{
        if(h.country !== countryName || h.precision === 'orbital') return;
        const m = L.circleMarker([h.lat, h.lon], {
          radius: 6, color: precisionStrokeColor(h.precision), weight: h.precision==='confirmed'?1:2,
          dashArray: h.precision === 'classified' ? '2,2' : null,
          fillColor: faction.color, fillOpacity: 0.92
        });
        m.bindPopup(buildHoldingPopup(faction, h));
        m.addTo(regionalMarkerLayer);
      });
    });
    DATA.exclusionZones.forEach(z=>{
      if(!z.loc.includes(countryName)) return;
      const icon = L.divIcon({
        className: '', html: '<div style="width:10px;height:10px;background:#e0a53f;border:1px solid #0b0f10;transform:rotate(45deg);"></div>',
        iconSize: [10,10], iconAnchor: [5,5]
      });
      const m = L.marker([z.lat, z.lon], { icon });
      m.bindPopup(
        '<div class="popup-faction">EXCLUSION ZONE</div>' +
        '<div class="popup-title">' + escapeHtml(z.name) + '</div>' +
        '<div class="popup-coords" style="margin-top:6px; color:#7d8c8f;">' + escapeHtml(z.note) + '</div>'
      );
      m.addTo(regionalMarkerLayer);
    });
    DATA.incidents.forEach(inc=>{
      if(inc.lat === null || !inc.loc.includes(countryName)) return;
      const icon = L.divIcon({
        className: '', html: '<div style="width:9px;height:9px;background:#c1453f;border:1px solid #0b0f10;border-radius:50%;"></div>',
        iconSize: [9,9], iconAnchor: [4,4]
      });
      const m = L.marker([inc.lat, inc.lon], { icon });
      m.bindPopup(
        '<div class="popup-faction">' + inc.year + ' — HISTORICAL RECORD</div>' +
        '<div class="popup-title">' + escapeHtml(inc.name) + '</div>' +
        '<div class="popup-coords" style="margin-top:6px; color:#7d8c8f;">' + escapeHtml(inc.note) + '</div>'
      );
      m.addTo(regionalMarkerLayer);
    });
  }

  function closeRegionalWindow(){
    document.getElementById('regional-panel').classList.remove('open');
    if(selectedLayer){ worldLayer.resetStyle(selectedLayer); selectedLayer = null; }
    currentRegionalCountryName = null;
  }
  document.getElementById('regional-close').addEventListener('click', closeRegionalWindow);

    // The regional survey box can be dragged around by its header, so
  // analysts can reposition it instead of it always sitting over the
  // same patch of map.
  (function enableRegionalDrag(){
    const panel = document.getElementById('regional-panel');
    const handle = document.getElementById('regional-header');
    let dragging = false, offsetX = 0, offsetY = 0;

    function pointOf(e){ return e.touches ? e.touches[0] : e; }

    function onDown(e){
      if(e.target.closest('#regional-close')) return;
      const rect = panel.getBoundingClientRect();
      // Switch from right/bottom-anchored to explicit left/top so the
      // panel can be freely repositioned, locking its current size.
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.width = rect.width + 'px';
      panel.style.height = rect.height + 'px';
      const p = pointOf(e);
      offsetX = p.clientX - rect.left;
      offsetY = p.clientY - rect.top;
      dragging = true;
      panel.classList.add('dragging');
      e.preventDefault();
    }

    function onMove(e){
      if(!dragging) return;
      const p = pointOf(e);
      const wrap = document.getElementById('map-wrap').getBoundingClientRect();
      const rect = panel.getBoundingClientRect();
      let x = p.clientX - offsetX;
      let y = p.clientY - offsetY;
      x = Math.max(wrap.left, Math.min(x, wrap.right - rect.width));
      y = Math.max(wrap.top, Math.min(y, wrap.bottom - rect.height));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      e.preventDefault();
    }

    function onUp(){
      if(!dragging) return;
      dragging = false;
      panel.classList.remove('dragging');
    }

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive:false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive:false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  })();

    const holdingMarkers = [];

  function precisionStrokeColor(p){
    switch(p){
      case 'confirmed': return '#0b0f10';
      case 'approx': return '#e0a53f';
      case 'classified': return '#c1453f';
      case 'orbital': return '#7d8c8f';
      default: return '#0b0f10';
    }
  }

  DATA.factions.forEach(faction=>{
    faction.holdings.forEach(h=>{
      const marker = L.circleMarker([h.lat, h.lon], {
        radius: 5.5,
        color: precisionStrokeColor(h.precision),
        weight: h.precision === 'confirmed' ? 1 : 2,
        dashArray: h.precision === 'classified' ? '2,2' : (h.precision === 'orbital' ? '1,3' : null),
        fillColor: faction.color,
        fillOpacity: 0.9
      });
      marker.bindPopup(buildHoldingPopup(faction, h));
      marker.addTo(factionLayerGroup);
      holdingMarkers.push({ marker, faction, holding: h });
    });
  });

  let activeFactionFilter = null;
  const resetFilterBtn = document.getElementById('reset-faction-filter');

  function applyFactionFilter(faction){
    activeFactionFilter = faction;
    holdingMarkers.forEach(entry=>{
      const show = !faction || entry.faction === faction;
      if(show) factionLayerGroup.addLayer(entry.marker);
      else factionLayerGroup.removeLayer(entry.marker);
    });

    // If a regional survey window is open, its marker set was drawn
    // against whatever filter was active at the time — refresh it so
    // it stays in sync rather than showing a stale subset.
    if(currentRegionalCountryName){
      plotRegionalMarkers(currentRegionalCountryName);
    }

    if(faction){
      resetFilterBtn.textContent = '\u2715 CLEAR FILTER: ' + faction.tag + ' \u2014 SHOW ALL';
      resetFilterBtn.classList.add('show');
    } else {
      resetFilterBtn.classList.remove('show');
    }
  }
  resetFilterBtn.addEventListener('click', closeDossier);

  function buildHoldingPopup(faction, h){
    const flag = '<span class="precision-flag precision-' + h.precision + '">' + PRECISION_LABEL[h.precision] + '</span>';
    return '<div class="popup-faction">' + escapeHtml(faction.name) + '</div>' +
      '<div class="popup-title">' + escapeHtml(h.name) + '</div>' +
      '<div class="popup-loc">' + escapeHtml(h.loc) + '</div>' +
      (h.precision === 'orbital'
        ? '<div class="popup-coords">POSITION NOT MAPPABLE TO SURFACE COORDINATES</div>'
        : '<div class="popup-coords">' + h.lat.toFixed(3) + ', ' + h.lon.toFixed(3) + '</div>') +
      '<div style="margin-top:6px;">' + flag + '</div>';
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

    DATA.exclusionZones.forEach(z=>{
    const icon = L.divIcon({
      className: '', html: '<div style="width:10px;height:10px;background:#e0a53f;border:1px solid #0b0f10;transform:rotate(45deg);"></div>',
      iconSize: [10,10], iconAnchor: [5,5]
    });
    const marker = L.marker([z.lat, z.lon], { icon });
    marker.bindPopup(
      '<div class="popup-faction">EXCLUSION ZONE</div>' +
      '<div class="popup-title">' + escapeHtml(z.name) + '</div>' +
      '<div class="popup-loc">' + escapeHtml(z.loc) + '</div>' +
      '<div class="popup-coords" style="margin-top:6px; color:#7d8c8f;">' + escapeHtml(z.note) + '</div>'
    );
    marker.addTo(zoneLayerGroup);
    z._marker = marker;
  });

    DATA.incidents.forEach(inc=>{
    if(inc.lat === null || inc.lon === null) return;
    const icon = L.divIcon({
      className: '', html: '<div style="width:9px;height:9px;background:#c1453f;border:1px solid #0b0f10;border-radius:50%;"></div>',
      iconSize: [9,9], iconAnchor: [4,4]
    });
    const marker = L.marker([inc.lat, inc.lon], { icon });
    marker.bindPopup(
      '<div class="popup-faction">' + inc.year + ' — HISTORICAL RECORD</div>' +
      '<div class="popup-title">' + escapeHtml(inc.name) + '</div>' +
      '<div class="popup-loc">' + escapeHtml(inc.loc) + '</div>' +
      '<div class="popup-coords" style="margin-top:6px; color:#7d8c8f;">' + escapeHtml(inc.note) + '</div>'
    );
    marker.addTo(incidentLayerGroup);
    inc._marker = marker;
  });

    document.getElementById('toggle-factions').addEventListener('change', e=>{
    if(e.target.checked) map.addLayer(factionLayerGroup); else map.removeLayer(factionLayerGroup);
  });
  document.getElementById('toggle-zones').addEventListener('change', e=>{
    if(e.target.checked) map.addLayer(zoneLayerGroup); else map.removeLayer(zoneLayerGroup);
  });
  document.getElementById('toggle-incidents').addEventListener('change', e=>{
    if(e.target.checked) map.addLayer(incidentLayerGroup); else map.removeLayer(incidentLayerGroup);
  });

    document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

    const factionListEl = document.getElementById('faction-list');
  const dossierDetailEl = document.getElementById('dossier-detail');
  const factionSearchEl = document.getElementById('faction-search');

  function renderFactionList(filter){
    factionListEl.innerHTML = '';
    const q = (filter || '').trim().toLowerCase();
    const visible = DATA.factions.filter(f=>
      !q || f.name.toLowerCase().includes(q) || f.tag.toLowerCase().includes(q)
    );

    const count = document.createElement('div');
    count.className = 'list-count';
    count.textContent = visible.length + (q ? ' MATCHING' : ' ON FILE');
    factionListEl.appendChild(count);

    visible.forEach(faction=>{
      const row = document.createElement('div');
      row.className = 'faction-row';
      row.dataset.tag = faction.tag;
      row.style.setProperty('--accent', faction.color);
      if(activeFactionFilter === faction) row.classList.add('active');
      row.innerHTML =
        '<span class="faction-row-text">' +
          '<div class="faction-row-name">' + escapeHtml(faction.name) + '</div>' +
          '<div class="faction-row-meta"><span class="faction-row-tag">' + faction.tag + '</span> · ' + faction.holdings.length + ' KNOWN SITE' + (faction.holdings.length===1?'':'S') + '</div>' +
        '</span>';
      row.addEventListener('click', ()=> openDossier(faction));
      factionListEl.appendChild(row);
    });
    if(visible.length === 0){
      factionListEl.innerHTML = '<div class="panel-note">NO MATCHING RECORDS IN ARCHIVE</div>';
    }
  }
  renderFactionList();
  factionSearchEl.addEventListener('input', ()=> renderFactionList(factionSearchEl.value));

  function openDossier(faction){
    applyFactionFilter(faction);
    document.querySelectorAll('.faction-row').forEach(r=>{
      r.classList.toggle('active', r.dataset.tag === faction.tag);
    });
    document.getElementById('faction-list-wrap').classList.remove('active');
    dossierDetailEl.classList.add('active');
    dossierDetailEl.innerHTML =
      '<div class="dossier-header">' +
        '<button class="dossier-back" id="dossier-back">&larr; BACK TO REGISTER</button>' +
        '<div class="dossier-title">' + escapeHtml(faction.name) + '</div>' +
        '<div class="dossier-tag" style="color:' + faction.color + '">' + faction.tag + '</div>' +
        '<div class="dossier-count">' + faction.holdings.length + ' KNOWN SITE' + (faction.holdings.length===1?'':'S') + ' ON RECORD</div>' +
      '</div>' +
      '<div class="list-scroll" id="holding-list"></div>';
    document.getElementById('dossier-back').addEventListener('click', closeDossier);

    const holdingList = document.getElementById('holding-list');
    const bounds = [];
    faction.holdings.forEach(h=>{
      const item = document.createElement('div');
      item.className = 'holding-item';
      item.innerHTML =
        '<div class="holding-name">' + escapeHtml(h.name) + '</div>' +
        '<div class="holding-loc">' + escapeHtml(h.loc) + '</div>' +
        '<span class="precision-flag precision-' + h.precision + '">' + PRECISION_LABEL[h.precision] + '</span>';
      item.addEventListener('click', ()=> focusHolding(faction, h));
      holdingList.appendChild(item);
      if(h.precision !== 'orbital') bounds.push([h.lat, h.lon]);
    });

    if(bounds.length){
      scanFlash();
      map.flyToBounds(bounds, { padding:[60,60], duration:0.85, maxZoom:6 });
    }
  }

  function closeDossier(){
    applyFactionFilter(null);
    document.querySelectorAll('.faction-row').forEach(r=> r.classList.remove('active'));
    dossierDetailEl.classList.remove('active');
    dossierDetailEl.innerHTML = '';
    document.getElementById('faction-list-wrap').classList.add('active');
  }

  function focusHolding(faction, h){
    if(h.precision === 'orbital'){
      const m = holdingMarkers.find(x=>x.holding===h);
      if(m) m.marker.openPopup();
      return;
    }
    scanFlash();
    map.flyTo([h.lat, h.lon], 7, { duration: 0.85 });
    const m = holdingMarkers.find(x=>x.holding===h);
    setTimeout(()=>{ if(m) m.marker.openPopup(); }, 900);
  }

    const zoneListEl = document.getElementById('zone-list');
  { const c = document.createElement('div'); c.className='list-count'; c.textContent = DATA.exclusionZones.length + ' ON FILE'; zoneListEl.appendChild(c); }
  DATA.exclusionZones.forEach(z=>{
    const item = document.createElement('div');
    item.className = 'zone-item';
    item.innerHTML =
      '<div class="zone-name">' + escapeHtml(z.name) + '</div>' +
      '<div class="zone-loc">' + escapeHtml(z.loc) + '</div>' +
      '<div class="zone-note">' + escapeHtml(z.note) + '</div>';
    item.addEventListener('click', ()=>{
      scanFlash();
      map.flyTo([z.lat, z.lon], 6, { duration:0.85 });
      setTimeout(()=> z._marker.openPopup(), 900);
    });
    zoneListEl.appendChild(item);
  });

    const incidentListEl = document.getElementById('incident-list');
  { const c = document.createElement('div'); c.className='list-count'; c.textContent = DATA.incidents.length + ' RECORDS ON FILE'; incidentListEl.appendChild(c); }
  DATA.incidents.forEach(inc=>{
    const item = document.createElement('div');
    item.className = 'incident-item';
    item.innerHTML =
      '<div class="incident-year">' + inc.year + '</div>' +
      '<div class="incident-name">' + escapeHtml(inc.name) + '</div>' +
      '<div class="incident-loc">' + escapeHtml(inc.loc) + '</div>' +
      '<div class="incident-note">' + escapeHtml(inc.note) + '</div>';
    if(inc.lat !== null){
      item.addEventListener('click', ()=>{
        scanFlash();
        map.flyTo([inc.lat, inc.lon], 6, { duration:0.85 });
        setTimeout(()=> inc._marker.openPopup(), 900);
      });
    } else {
      item.style.cursor = 'default';
    }
    incidentListEl.appendChild(item);
  });

    document.getElementById('legend').innerHTML =
    '<span class="leg-item"><span class="leg-key">Amber ring</span> — approximate</span>' +
    '<span class="leg-item"><span class="leg-key">Red dashed</span> — classified</span>';

    function setStatus(id, text){
    const el = document.getElementById(id);
    if(el) el.textContent = text;
  }
  document.getElementById('entity-count').textContent =
    DATA.factions.length + ' FACTIONS · ' +
    DATA.factions.reduce((n,f)=>n+f.holdings.length,0) + ' SITES · ' +
    DATA.exclusionZones.length + ' ZONES · ' +
    DATA.incidents.length + ' RECORDS';

  map.on('mousemove', e=>{
    setStatus('coord-readout', 'LAT ' + e.latlng.lat.toFixed(2) + '  LON ' + e.latlng.lng.toFixed(2));
  });

  function tickClock(){
    const d = new Date();
    setStatus('clock', d.toUTCString().slice(17,25) + ' UTC');
  }
  tickClock();
  setInterval(tickClock, 1000);

    const modal = document.getElementById('about-modal');
  document.getElementById('about-btn').addEventListener('click', ()=> modal.classList.add('open'));
  document.getElementById('about-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.addEventListener('click', e=>{ if(e.target === modal) modal.classList.remove('open'); });

    // ---- Breadcrumb bar hide/show ----
  (function setupBreadcrumbToggle(){
    const bar = document.getElementById('breadcrumb');
    const showBtn = document.getElementById('breadcrumb-show');
    document.getElementById('breadcrumb-toggle').addEventListener('click', ()=>{
      bar.classList.add('collapsed');
      showBtn.classList.add('show');
    });
    showBtn.addEventListener('click', ()=>{
      bar.classList.remove('collapsed');
      showBtn.classList.remove('show');
    });
  })();

    // ---- Mobile sidebar (Dossiers/Zones/Timeline) as a slide-up panel ----
  const MOBILE_BREAKPOINT = 880;
  function isMobileLayout(){ return window.innerWidth <= MOBILE_BREAKPOINT; }

  const sidebarEl = document.getElementById('sidebar');
  const sidebarFab = document.getElementById('sidebar-fab');

  function setMobileSidebarOpen(open){
    sidebarEl.classList.toggle('mobile-open', open);
    sidebarFab.classList.toggle('is-open', open);
    sidebarFab.innerHTML = open ? '&times; Close' : '&#9776; Dossiers';
  }
  function closeMobileSidebar(){
    if(isMobileLayout()) setMobileSidebarOpen(false);
  }
  sidebarFab.addEventListener('click', ()=>{
    setMobileSidebarOpen(!sidebarEl.classList.contains('mobile-open'));
  });
  const sidebarMobileClose = document.getElementById('sidebar-mobile-close');
  if(sidebarMobileClose) sidebarMobileClose.addEventListener('click', closeMobileSidebar);

  // Jumping to a location on the map is the point of tapping a list row —
  // drop back to the map automatically so the result is actually visible.
  map.on('click', closeMobileSidebar);
  // Faction rows just open a dossier's holdings list (still useful to browse
  // on mobile), but zone/incident/holding rows fly the map to a point — those
  // are the ones worth dropping the panel for.
  ['zone-list','incident-list','holding-list'].forEach(id=>{
    document.addEventListener('click', e=>{
      if(e.target.closest('#' + id) && e.target.closest('.zone-item, .incident-item, .holding-item')){
        closeMobileSidebar();
      }
    });
  });

    runBoot();

})();
