/* ==========================================================================
   RIFTFALL — CONTINUANCE ARCHIVE
   Application logic: world map, click-to-zoom subdivision drill-down,
   faction dossiers, exclusion zones, incident timeline.
   ========================================================================== */

(function(){
  "use strict";

  const DATA = window.RIFTFALL_DATA;
  const COUNTRY_MAP = window.RIFTFALL_COUNTRY_MAP;

  /* ---------------------------------------------------------------------
     Faction color assignment — muted, distinguishable, dark-theme-safe.
     --------------------------------------------------------------------- */
  const FACTION_COLORS = [
    "#5fd4c4","#e0a53f","#c1453f","#7fa8d9","#c98fd6","#9bc75a",
    "#d97a9c","#5fa9d4","#e0c23f","#8f6fd6","#5fd48a","#d45f7a",
    "#a3a3a3","#d48f5f","#5f8ed4","#c4d45f","#d45fbf","#6fd6b0",
    "#d6a06f","#7ed6d6","#b0d65f","#d65f8e","#8ed65f","#5f79d6","#d6785f"
  ];
  DATA.factions.forEach((f,i)=>{ f.color = FACTION_COLORS[i % FACTION_COLORS.length]; });
  const factionByName = {};
  DATA.factions.forEach(f=> factionByName[f.name] = f);

  const PRECISION_LABEL = {
    confirmed: "CONFIRMED", approx: "APPROXIMATE", classified: "CLASSIFIED", orbital: "NON-TERRESTRIAL"
  };

  /* =======================================================================
     BOOT SEQUENCE
     ======================================================================= */
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

  /* =======================================================================
     MAP SETUP
     ======================================================================= */
  const map = L.map('map', {
    center: [20, 10],
    zoom: 2,
    minZoom: 2,
    maxZoom: 9,
    worldCopyJump: true,
    zoomControl: true,
    attributionControl: true
  });
  map.attributionControl.setPrefix('Boundaries: Natural Earth / amCharts geodata (free-licensed) — Rendered with Leaflet');

  let worldLayer = null;          // country choropleth (global view)
  let subdivisionLayer = null;    // active drill-down layer
  let factionLayerGroup = L.layerGroup().addTo(map);
  let zoneLayerGroup = L.layerGroup().addTo(map);
  let incidentLayerGroup = L.layerGroup().addTo(map);
  let currentCountryName = null;
  const geoCache = {};

  function scanFlash(){
    const el = document.getElementById('scan-flash');
    el.classList.remove('active');
    void el.offsetWidth;
    el.classList.add('active');
  }

  /* ---------------- World (global) layer ---------------- */
  fetch('geodata/world.json').then(r=>r.json()).then(world=>{
    worldLayer = L.geoJSON(world, {
      style: baseCountryStyle,
      onEachFeature: (feature, layer)=>{
        layer.on('mouseover', ()=>{
          if(!subdivisionLayer) layer.setStyle(hoverCountryStyle);
        });
        layer.on('mouseout', ()=>{
          if(!subdivisionLayer) worldLayer.resetStyle(layer);
        });
        layer.on('click', ()=> drillIntoCountry(feature));
      }
    }).addTo(map);
    setStatus('cartography-status', 'WORLD SURVEY LOADED');
  }).catch(err=>{
    console.error(err);
    setStatus('cartography-status', 'WORLD SURVEY LOAD FAILED');
  });

  function baseCountryStyle(){
    return { color:'#2e6b62', weight:0.8, fillColor:'#0c2622', fillOpacity:0.55 };
  }
  function hoverCountryStyle(){
    return { color:'#5fd4c4', weight:1.3, fillColor:'#123a34', fillOpacity:0.7 };
  }

  /* ---------------- Drill-down into a country ---------------- */
  function drillIntoCountry(feature){
    const name = feature.properties.name;
    const iso3 = COUNTRY_MAP[name];
    scanFlash();
    // zoom to country bounds regardless of subdivision availability
    const tmp = L.geoJSON(feature);
    map.flyToBounds(tmp.getBounds(), { padding:[40,40], duration: 0.85, maxZoom: 6 });
    currentCountryName = name;
    updateBreadcrumb(name);

    if(!iso3){
      // no subdivision data available — just stay zoomed on the country layer
      return;
    }
    if(geoCache[iso3]){
      renderSubdivision(geoCache[iso3], name);
      return;
    }
    fetch('geodata/countries/' + iso3 + '.json').then(r=>{
      if(!r.ok) throw new Error('not found');
      return r.json();
    }).then(gj=>{
      geoCache[iso3] = gj;
      renderSubdivision(gj, name);
    }).catch(()=>{
      // silently keep global view zoomed — no regional survey on file
    });
  }

  function renderSubdivision(geojson, countryName){
    if(subdivisionLayer){ map.removeLayer(subdivisionLayer); subdivisionLayer = null; }
    if(worldLayer) worldLayer.setStyle({ opacity:0, fillOpacity:0 });

    subdivisionLayer = L.geoJSON(geojson, {
      style: ()=> ({ color:'#3a4548', weight:1, fillColor:'#141c1e', fillOpacity:0.5 }),
      onEachFeature: (feature, layer)=>{
        const nm = (feature.properties && feature.properties.name) || 'Unknown Division';
        layer.bindTooltip(nm, { className:'subdiv-label', sticky:true, direction:'top' });
        layer.on('mouseover', ()=> layer.setStyle({ color:'#5fd4c4', weight:1.6, fillColor:'#1c3d38', fillOpacity:0.65 }));
        layer.on('mouseout', ()=> layer.setStyle({ color:'#3a4548', weight:1, fillColor:'#141c1e', fillOpacity:0.5 }));
      }
    }).addTo(map);
  }

  function returnToGlobal(){
    if(subdivisionLayer){ map.removeLayer(subdivisionLayer); subdivisionLayer = null; }
    if(worldLayer) worldLayer.setStyle(baseCountryStyle());
    currentCountryName = null;
    updateBreadcrumb(null);
    scanFlash();
    map.flyTo([20,10], 2, { duration: 0.85 });
  }

  function updateBreadcrumb(countryName){
    const el = document.getElementById('breadcrumb');
    if(!countryName){
      el.innerHTML = '<span class="seg current">GLOBAL VIEW</span>';
      return;
    }
    el.innerHTML =
      '<span class="seg">GLOBAL VIEW</span><span>/</span><span class="seg current">' +
      countryName.toUpperCase() + '</span><button id="return-btn">RETURN TO GLOBAL VIEW</button>';
    document.getElementById('return-btn').addEventListener('click', returnToGlobal);
  }
  updateBreadcrumb(null);

  /* =======================================================================
     FACTION MARKERS
     ======================================================================= */
  const holdingMarkers = []; // {marker, faction, holding}

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

  /* =======================================================================
     EXCLUSION ZONES
     ======================================================================= */
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

  /* =======================================================================
     INCIDENTS (Historical Record)
     ======================================================================= */
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

  /* =======================================================================
     LAYER TOGGLES
     ======================================================================= */
  document.getElementById('toggle-factions').addEventListener('change', e=>{
    if(e.target.checked) map.addLayer(factionLayerGroup); else map.removeLayer(factionLayerGroup);
  });
  document.getElementById('toggle-zones').addEventListener('change', e=>{
    if(e.target.checked) map.addLayer(zoneLayerGroup); else map.removeLayer(zoneLayerGroup);
  });
  document.getElementById('toggle-incidents').addEventListener('change', e=>{
    if(e.target.checked) map.addLayer(incidentLayerGroup); else map.removeLayer(incidentLayerGroup);
  });

  /* =======================================================================
     SIDEBAR — TABS
     ======================================================================= */
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  /* ---------------- Dossiers (factions) list ---------------- */
  const factionListEl = document.getElementById('faction-list');
  const dossierDetailEl = document.getElementById('dossier-detail');
  const factionSearchEl = document.getElementById('faction-search');

  function renderFactionList(filter){
    factionListEl.innerHTML = '';
    const q = (filter || '').trim().toLowerCase();
    DATA.factions.forEach(faction=>{
      if(q && !faction.name.toLowerCase().includes(q) && !faction.tag.toLowerCase().includes(q)) return;
      const row = document.createElement('div');
      row.className = 'faction-row';
      row.innerHTML =
        '<span class="faction-swatch" style="background:' + faction.color + '"></span>' +
        '<span class="faction-row-text">' +
          '<div class="faction-row-name">' + escapeHtml(faction.name) + '</div>' +
          '<div class="faction-row-meta">' + faction.tag + ' · ' + faction.holdings.length + ' KNOWN SITES</div>' +
        '</span>';
      row.addEventListener('click', ()=> openDossier(faction));
      factionListEl.appendChild(row);
    });
    if(factionListEl.children.length === 0){
      factionListEl.innerHTML = '<div class="panel-note">NO MATCHING RECORDS IN ARCHIVE</div>';
    }
  }
  renderFactionList();
  factionSearchEl.addEventListener('input', ()=> renderFactionList(factionSearchEl.value));

  function openDossier(faction){
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
      if(subdivisionLayer){ map.removeLayer(subdivisionLayer); subdivisionLayer = null; }
      if(worldLayer) worldLayer.setStyle(baseCountryStyle());
      currentCountryName = null; updateBreadcrumb(null);
      scanFlash();
      map.flyToBounds(bounds, { padding:[60,60], duration:0.85, maxZoom:6 });
    }
  }

  function closeDossier(){
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
    if(subdivisionLayer){ map.removeLayer(subdivisionLayer); subdivisionLayer = null; }
    if(worldLayer) worldLayer.setStyle(baseCountryStyle());
    currentCountryName = null; updateBreadcrumb(null);
    scanFlash();
    map.flyTo([h.lat, h.lon], 7, { duration: 0.85 });
    const m = holdingMarkers.find(x=>x.holding===h);
    setTimeout(()=>{ if(m) m.marker.openPopup(); }, 900);
  }

  /* ---------------- Zones tab ---------------- */
  const zoneListEl = document.getElementById('zone-list');
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

  /* ---------------- Timeline tab ---------------- */
  const incidentListEl = document.getElementById('incident-list');
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

  /* =======================================================================
     LEGEND
     ======================================================================= */
  document.getElementById('legend').innerHTML =
    '<span class="leg-item"><span class="leg-dot" style="background:#5fd4c4"></span>Faction Site</span>' +
    '<span class="leg-item"><span class="leg-dot" style="background:#e0a53f;border-radius:0;transform:rotate(45deg);"></span>Exclusion Zone</span>' +
    '<span class="leg-item"><span class="leg-dot" style="background:#c1453f"></span>Historical Incident</span>' +
    '<span class="leg-item">Stroke: amber=approx · red dashed=classified</span>';

  /* =======================================================================
     STATUS BAR
     ======================================================================= */
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

  /* =======================================================================
     ABOUT MODAL
     ======================================================================= */
  const modal = document.getElementById('about-modal');
  document.getElementById('about-btn').addEventListener('click', ()=> modal.classList.add('open'));
  document.getElementById('about-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.addEventListener('click', e=>{ if(e.target === modal) modal.classList.remove('open'); });

  /* =======================================================================
     BOOT
     ======================================================================= */
  runBoot();

})();
