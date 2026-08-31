
(function(){
  "use strict";

  const DATA = window.CONTINUANCE_DATA;
  const COUNTRY_MAP = window.CONTINUANCE_COUNTRY_MAP;

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
    "CONTINUANCE NETWORK // TERMINAL AUTH // REQUESTING UPLINK",
    "VERIFYING ARCHIVE INTEGRITY ................. OK",
    "DECRYPTING FACTION HOLDINGS REGISTER ......... OK",
    "LOADING CARTOGRAPHIC SURVEY (CUSTOM.GEO) ..... OK",
    "CROSS REFERENCING 25 KNOWN ENTITIES .......... OK",
    "CLEARANCE LEVEL: OBSERVER // READ ONLY",
    "",
    "WELCOME TO THE CONTINUANCE SURVEILLANCE ARCHIVE"
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
    zoomControl: true,
    attributionControl: true
  });
  map.attributionControl.setPrefix('Boundaries: Natural Earth / amCharts geodata (free-licensed); subdivisions via geoBoundaries (CC BY 4.0) · Rendered with Leaflet');

  // Country outlines live in their own pane, below the default overlay
  // pane that circle-marker holdings use, so bringing a selected country
  // to the front (for its highlight border) can never sit on top of and
  // block clicks on the site markers inside it.
  map.createPane('countryPane');
  map.getPane('countryPane').style.zIndex = 390;

  let worldLayer = null;
  let factionLayerGroup = L.layerGroup().addTo(map);
  let zoneLayerGroup = L.layerGroup().addTo(map);
  let incidentLayerGroup = L.layerGroup().addTo(map);
  let selectedLayer = null;

  function scanFlash(){
    const el = document.getElementById('scan-flash');
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
  }

    (function(){
    try{
    const world = window.CONTINUANCE_WORLD;

    const makeWorld = (offset)=> L.geoJSON(world, {
      pane: 'countryPane',
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
    }catch(err){
      console.error(err);
      setStatus('cartography-status', 'WORLD SURVEY LOAD FAILED');
    }
  })();

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

  const GB = window.CONTINUANCE_GEOBOUNDARIES;

  function drawSubdivisions(rmap, iso3, geojsonOrNull, feature, name){
    regionalCountryLayer.clearLayers();
    if(geojsonOrNull){
      const sub = L.geoJSON(geojsonOrNull, {
        style: ()=> ({ color:'#5c7b74', weight:1.1, fillColor:'#12211f', fillOpacity:0.55 }),
        onEachFeature: (f, l)=>{
          const nm = (f.properties && (f.properties.shapeName || f.properties.name)) || 'Unknown Division';
          l.bindTooltip(nm, { className:'subdiv-label', sticky:true, direction:'top' });
          l.on('mouseover', ()=> l.setStyle({ color:'#8fe8da', weight:1.8, fillColor:'#1c3d38', fillOpacity:0.7 }));
          l.on('mouseout', ()=> l.setStyle({ color:'#5c7b74', weight:1.1, fillColor:'#12211f', fillOpacity:0.55 }));
        }
      }).addTo(regionalCountryLayer);
      document.getElementById('regional-note').textContent =
        sub.getLayers().length + ' INTERNAL DIVISION' + (sub.getLayers().length===1?'':'S') + ' ON RECORD';
      if(iso3 === 'RUS'){
        rmap.fitBounds([[41, 19], [82, 180]], { padding:[20,20], duration:0.4, maxZoom:4 });
      } else {
        rmap.flyToBounds(sub.getBounds(), { padding:[20,20], duration:0.4 });
      }
    } else {
      const outline = L.geoJSON(feature, {
        style: ()=> ({ color:'#5c7b74', weight:1.4, fillColor:'#12211f', fillOpacity:0.55 })
      }).addTo(regionalCountryLayer);
      document.getElementById('regional-note').textContent =
        'NO REGIONAL SUBDIVISION SURVEY ON FILE // NATIONAL BOUNDARY ONLY';
      if(iso3 === 'RUS'){
        rmap.fitBounds([[41, 19], [82, 180]], { padding:[20,20], duration:0.4, maxZoom:4 });
      } else {
        rmap.flyToBounds(outline.getBounds(), { padding:[20,20], duration:0.4 });
      }
    }
    plotRegionalMarkers(name);
  }

  // Renders the row of level buttons (Province / District / Municipality...)
  // once we know which ADM levels geoBoundaries actually has on file for
  // this country, and wires each one up to fetch + draw on click.
  function renderLevelSwitcher(rmap, iso3, feature, name, levels, activeLevel, onPick){
    const box = document.getElementById('regional-levels');
    box.innerHTML = '';
    if(!levels || !levels.length) return;
    levels.forEach(lv=>{
      const btn = document.createElement('button');
      btn.className = 'lvl-btn' + (lv.level === activeLevel ? ' active' : '');
      btn.textContent = lv.label + (lv.unitCount ? ' (' + lv.unitCount + ')' : '');
      btn.addEventListener('click', ()=>{
        if(btn.classList.contains('active')) return;
        Array.from(box.children).forEach(c=> c.classList.remove('active'));
        btn.classList.add('active');
        onPick(lv);
      });
      box.appendChild(btn);
    });
  }

  function openRegionalWindow(feature, layer){
    const name = feature.properties.name;
    const iso3 = (GB && GB.resolveIso3(name, feature.properties.iso_a3)) || COUNTRY_MAP[name] || null;

    if(selectedLayer && selectedLayer !== layer) selectedLayer.setStyle(baseCountryStyle());
    selectedLayer = layer;
    layer.setStyle(selectedCountryStyle());
    layer.bringToFront();

    scanFlash();
    document.getElementById('regional-title').textContent = name.toUpperCase();
    document.getElementById('regional-panel').classList.add('open');
    document.getElementById('regional-levels').innerHTML = '';

    const rmap = ensureRegionalMap();
    regionalCountryLayer.clearLayers();
    regionalMarkerLayer.clearLayers();
    document.getElementById('regional-note').textContent = 'LOADING REGIONAL SURVEY…';

    setTimeout(()=> rmap.invalidateSize(), 30);

    function loadLevel(lv){
      document.getElementById('regional-note').textContent = 'LOADING ' + lv.label + ' SURVEY…';
      GB.fetchGeometry(iso3, lv.level, lv.url)
        .then(gj=> drawSubdivisions(rmap, iso3, gj, feature, name))
        .catch(()=>{
          document.getElementById('regional-note').textContent =
            lv.label + ' SURVEY UNAVAILABLE // NETWORK OR SOURCE ERROR';
          drawSubdivisions(rmap, iso3, null, feature, name);
        });
    }

    function offlineFallback(){
      // No live geoBoundaries data (no ISO3, offline, or the country isn't
      // tracked) -- fall back to the small locally-bundled ADM1 set for the
      // curated countries this archive originally shipped with.
      const gj = iso3 ? (window.CONTINUANCE_COUNTRY_GEO || {})[iso3] : null;
      drawSubdivisions(rmap, iso3, gj || null, feature, name);
    }

    if(!iso3 || !GB){ offlineFallback(); return; }

    GB.fetchLevels(iso3).then(levels=>{
      // ADM0 is just the national outline we already have; only offer
      // levels below it as subdivision options.
      const subLevels = levels.filter(l=> l.level !== 'ADM0');
      if(!subLevels.length){ offlineFallback(); return; }
      const first = subLevels[0];
      renderLevelSwitcher(rmap, iso3, feature, name, subLevels, first.level, loadLevel);
      loadLevel(first);
    }).catch(()=>{
      offlineFallback();
    });
  }

  function locMatchesCountry(loc, countryName){
    const escaped = countryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^A-Za-z])' + escaped + '($|[^A-Za-z])').test(loc);
  }

  function plotRegionalMarkers(countryName){
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
      if(!locMatchesCountry(z.loc, countryName)) return;
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
      if(inc.lat === null || !locMatchesCountry(inc.loc, countryName)) return;
      const icon = L.divIcon({
        className: '', html: '<div style="width:9px;height:9px;background:#c1453f;border:1px solid #0b0f10;border-radius:50%;"></div>',
        iconSize: [9,9], iconAnchor: [4,4]
      });
      const m = L.marker([inc.lat, inc.lon], { icon });
      m.bindPopup(
        '<div class="popup-faction">' + inc.year + ' · HISTORICAL RECORD</div>' +
        '<div class="popup-title">' + escapeHtml(inc.name) + '</div>' +
        '<div class="popup-coords" style="margin-top:6px; color:#7d8c8f;">' + escapeHtml(inc.note) + '</div>'
      );
      m.addTo(regionalMarkerLayer);
    });
  }

  function closeRegionalWindow(){
    document.getElementById('regional-panel').classList.remove('open');
    document.getElementById('regional-levels').innerHTML = '';
    if(selectedLayer){ selectedLayer.setStyle(baseCountryStyle()); selectedLayer = null; }
  }
  document.getElementById('regional-close').addEventListener('click', closeRegionalWindow);

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

  function applyFactionFilter(faction){
    activeFactionFilter = faction;
    holdingMarkers.forEach(entry=>{
      const show = !faction || entry.faction === faction;
      if(show) factionLayerGroup.addLayer(entry.marker);
      else factionLayerGroup.removeLayer(entry.marker);
    });
  }

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
      '<div class="popup-faction">' + inc.year + ' · HISTORICAL RECORD</div>' +
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
    '<span class="leg-item"><span class="leg-key">Amber ring</span> · approximate</span>' +
    '<span class="leg-item"><span class="leg-key">Red dashed</span> · classified</span>';

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

    runBoot();

    const shellEl = document.getElementById('shell');
  const hideBarBtn = document.getElementById('hide-bar-btn');
  const showBarTab = document.getElementById('show-bar-tab');
  function setBarHidden(hidden){
    shellEl.classList.toggle('bar-hidden', hidden);
    showBarTab.classList.toggle('visible', hidden);
  }
  hideBarBtn.addEventListener('click', ()=> setBarHidden(true));
  showBarTab.addEventListener('click', ()=> setBarHidden(false));

    const hideSidebarBtn = document.getElementById('hide-sidebar-btn');
  const showSidebarTab = document.getElementById('show-sidebar-tab');
  function setSidebarHidden(hidden){
    shellEl.classList.toggle('sidebar-hidden', hidden);
    showSidebarTab.classList.toggle('visible', hidden);
    setTimeout(()=> map.invalidateSize(), 200);
  }
  hideSidebarBtn.addEventListener('click', ()=> setSidebarHidden(true));
  showSidebarTab.addEventListener('click', ()=> setSidebarHidden(false));

    // Survey Layers panel: collapsed by default on narrow/mobile screens
  // (handled purely by the CSS media query — no class needed to start hidden),
  // toggled open with a small tab and closed again with its own close button.
  const showLayersTab = document.getElementById('show-layers-tab');
  const layerControlClose = document.getElementById('layer-control-close');
  if(showLayersTab && layerControlClose){
    showLayersTab.addEventListener('click', ()=> shellEl.classList.add('layers-open'));
    layerControlClose.addEventListener('click', ()=> shellEl.classList.remove('layers-open'));
  }

    // ---- Full survey snapshot export ----
  // Renders the entire world, every visible faction holding / exclusion zone /
  // historical incident as a small dot, onto an offscreen canvas and downloads
  // it as a PNG. This is drawn from the raw geodata + coordinate data directly
  // (rather than screenshotting the live Leaflet DOM), so it always captures
  // the whole map at full resolution regardless of current pan/zoom or screen
  // size, and works the same on mobile as on desktop.
  function mercY(latDeg){
    const clamped = Math.max(Math.min(latDeg, 85.05), -85.05);
    const rad = clamped * Math.PI / 180;
    return Math.log(Math.tan(Math.PI / 4 + rad / 2)) * 180 / Math.PI;
  }

  function drawCountryPath(ctx, feature, project){
    const geom = feature && feature.geometry;
    if(!geom) return;
    const polys = geom.type === 'Polygon' ? [geom.coordinates]
      : geom.type === 'MultiPolygon' ? geom.coordinates : null;
    if(!polys) return;
    const path = new Path2D();
    polys.forEach(rings=>{
      rings.forEach(ring=>{
        ring.forEach((coord, i)=>{
          const p = project(coord[0], coord[1]);
          if(i === 0) path.moveTo(p[0], p[1]); else path.lineTo(p[0], p[1]);
        });
        path.closePath();
      });
    });
    ctx.fill(path, 'evenodd');
    ctx.stroke(path);
  }

  function buildSnapshotPoints(){
    const showFactions = document.getElementById('toggle-factions').checked;
    const showZones = document.getElementById('toggle-zones').checked;
    const showIncidents = document.getElementById('toggle-incidents').checked;
    const holdings = [];
    if(showFactions){
      DATA.factions.forEach(faction=>{
        if(activeFactionFilter && faction !== activeFactionFilter) return;
        faction.holdings.forEach(h=>{
          if(h.precision === 'orbital' || h.lat == null || h.lon == null) return;
          holdings.push({ lat: h.lat, lon: h.lon, color: faction.color });
        });
      });
    }
    const zones = showZones ? DATA.exclusionZones.filter(z=> z.lat != null && z.lon != null) : [];
    const incidents = showIncidents ? DATA.incidents.filter(inc=> inc.lat != null && inc.lon != null) : [];
    return { holdings, zones, incidents };
  }

  function renderSnapshotCanvas(){
    const { holdings, zones, incidents } = buildSnapshotPoints();

    let latMin = -85.05, latMax = 83, lonMin = -180, lonMax = 180;
    holdings.concat(zones, incidents).forEach(p=>{
      if(p.lat < latMin) latMin = p.lat - 4;
      if(p.lat > latMax) latMax = p.lat + 4;
      if(p.lon < lonMin) lonMin = p.lon - 4;
      if(p.lon > lonMax) lonMax = p.lon + 4;
    });
    latMin = Math.max(latMin, -85.05);
    latMax = Math.min(latMax, 85.05);

    const yTop = mercY(latMax), yBottom = mercY(latMin);
    const lonSpan = lonMax - lonMin, ySpan = yTop - yBottom;

    const mapW = 2000;
    const mapH = Math.round(mapW * (ySpan / lonSpan));
    const marginX = 44, marginTop = 108, marginBottom = 84;
    const totalW = mapW + marginX * 2;
    const totalH = mapH + marginTop + marginBottom;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(totalW * dpr);
    canvas.height = Math.round(totalH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    function project(lon, lat){
      const y = mercY(lat);
      const px = marginX + (lon - lonMin) / lonSpan * mapW;
      const py = marginTop + (yTop - y) / ySpan * mapH;
      return [px, py];
    }

    ctx.fillStyle = '#0a0d0e';
    ctx.fillRect(0, 0, totalW, totalH);

    ctx.fillStyle = '#04191a';
    ctx.fillRect(marginX, marginTop, mapW, mapH);

    ctx.strokeStyle = 'rgba(79,111,106,0.25)';
    ctx.lineWidth = 1;
    for(let lon = -180; lon <= 180; lon += 30){
      if(lon < lonMin || lon > lonMax) continue;
      const p1 = project(lon, latMax), p2 = project(lon, latMin);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    for(let lat = -80; lat <= 80; lat += 20){
      if(lat < latMin || lat > latMax) continue;
      const p1 = project(lonMin, lat), p2 = project(lonMax, lat);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(marginX, marginTop, mapW, mapH);
    ctx.clip();
    ctx.fillStyle = '#0e2b26';
    ctx.strokeStyle = '#4f6f6a';
    ctx.lineWidth = 0.9;
    const world = window.CONTINUANCE_WORLD;
    if(world && world.features){
      world.features.forEach(f=> drawCountryPath(ctx, f, project));
    }
    ctx.restore();

    ctx.strokeStyle = '#3a4548';
    ctx.lineWidth = 1;
    ctx.strokeRect(marginX + 0.5, marginTop + 0.5, mapW - 1, mapH - 1);

    function dot(lon, lat, r, fill, stroke, shape){
      const p = project(lon, lat);
      ctx.beginPath();
      if(shape === 'diamond'){
        ctx.save();
        ctx.translate(p[0], p[1]);
        ctx.rotate(Math.PI / 4);
        ctx.rect(-r, -r, r * 2, r * 2);
        ctx.restore();
      } else {
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      }
      ctx.fillStyle = fill;
      ctx.fill();
      if(stroke){
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    }

    holdings.forEach(h=> dot(h.lon, h.lat, 3.6, h.color, '#0b0f10'));
    zones.forEach(z=> dot(z.lon, z.lat, 4.2, '#e0a53f', '#0b0f10', 'diamond'));
    incidents.forEach(inc=> dot(inc.lon, inc.lat, 3.4, '#c1453f', '#0b0f10'));

    const stampDate = new Date();
    const isoStamp = stampDate.toISOString();
    const displayStamp = isoStamp.slice(0, 16).replace('T', ' ') + ' UTC';
    const fileStamp = isoStamp.slice(0, 19).replace(/[:T]/g, '-');

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5fd4c4';
    ctx.font = '600 26px "IBM Plex Mono", monospace';
    ctx.fillText('THE CONTINUANCE', marginX, 44);
    ctx.fillStyle = '#7d8c8f';
    ctx.font = '400 13px "IBM Plex Mono", monospace';
    ctx.fillText('GLOBAL SURVEY SNAPSHOT · FACTION HOLDINGS / EXCLUSION ZONES / HISTORICAL INCIDENTS', marginX, 66);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#4d5a5d';
    ctx.font = '400 12px "IBM Plex Mono", monospace';
    ctx.fillText('CAPTURED ' + displayStamp, totalW - marginX, 44);
    ctx.fillText(holdings.length + ' HOLDINGS · ' + zones.length + ' ZONES · ' + incidents.length + ' INCIDENTS', totalW - marginX, 62);
    ctx.textAlign = 'left';

    const legendY = marginTop + mapH + 30;
    ctx.font = '400 11.5px "IBM Plex Mono", monospace';
    let lx = marginX;
    function legendItem(label, color, shape){
      if(shape === 'diamond'){
        ctx.save(); ctx.translate(lx + 5, legendY - 4); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = color; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(lx + 5, legendY - 4, 4, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
      }
      ctx.fillStyle = '#7d8c8f';
      ctx.fillText(label, lx + 16, legendY);
      lx += 16 + ctx.measureText(label).width + 26;
    }
    legendItem('FACTION HOLDINGS', '#5fd4c4');
    legendItem('EXCLUSION ZONES', '#e0a53f', 'diamond');
    legendItem('HISTORICAL INCIDENTS', '#c1453f');

    ctx.fillStyle = '#4d5a5d';
    ctx.font = '400 10.5px "IBM Plex Mono", monospace';
    ctx.fillText('Boundaries: Natural Earth / amCharts geodata (free-licensed) · Rendered with Leaflet · Generated by The Continuance Archive', marginX, totalH - 18);

    canvas.toBlob(blob=>{
      if(!blob){ alert('Snapshot generation failed — please try again.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'continuance-survey-snapshot-' + fileStamp + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=> URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  }

  const captureBtn = document.getElementById('capture-snapshot-btn');
  if(captureBtn){
    captureBtn.addEventListener('click', ()=>{
      captureBtn.disabled = true;
      const originalLabel = captureBtn.textContent;
      captureBtn.textContent = 'RENDERING…';
      requestAnimationFrame(()=>{
        setTimeout(()=>{
          try{
            renderSnapshotCanvas();
          }catch(err){
            console.error(err);
            alert('Could not generate the snapshot: ' + err.message);
          }finally{
            captureBtn.disabled = false;
            captureBtn.textContent = originalLabel;
          }
        }, 30);
      });
    });
  }

})();
