window.CONTINUANCE_GEOBOUNDARIES = (function(){
  "use strict";

  const API_BASE = "https://www.geoboundaries.org/api/current/gbOpen/";
  const LEVEL_ORDER = ["ADM0","ADM1","ADM2","ADM3","ADM4","ADM5"];
  const LEVEL_LABEL = {
    ADM0: "NATIONAL",
    ADM1: "STATE / PROVINCE",
    ADM2: "DISTRICT / COUNTY",
    ADM3: "MUNICIPALITY",
    ADM4: "LOCAL DIVISION",
    ADM5: "LOCAL DIVISION"
  };

  const ISO_OVERRIDE = {
    "France": "FRA",
    "Norway": "NOR",
    "Kosovo": "XKX"
  };

  const metaCache = {}; 
  const geoCache  = {}; 
  const LS_PREFIX = "gb-cache:";

  function resolveIso3(name, propsIso3){
    if(propsIso3 && propsIso3 !== "-99") return propsIso3;
    return ISO_OVERRIDE[name] || null;
  }

  function normalizeGeoUrl(url){
    if(!url) return url;
    const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/[^/]+\/(.+)$/.exec(url);
    if(m) return "https://media.githubusercontent.com/media/" + m[1] + "/" + m[2] + "/main/" + m[3];
    const m2 = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/[^/]+\/(.+)$/.exec(url);
    if(m2) return "https://media.githubusercontent.com/media/" + m2[1] + "/" + m2[2] + "/main/" + m2[3];
    return url;
  }

  function isLfsPointerText(text){
    return typeof text === "string" && text.slice(0, 40).indexOf("version https://git-lfs") === 0;
  }

  function lsGet(key){
    try{
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  function lsSet(key, val){
    try{ localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); }
    catch(e){ }
  }

  function fetchWithTimeout(url, ms){
    const ctrl = new AbortController();
    const t = setTimeout(()=> ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(()=> clearTimeout(t));
  }

  function toRelay(url){
    return "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
  }

  function fetchJSON(url, label){
    function attempt(target){
      return fetchWithTimeout(target, 25000).then(r=>{
        if(!r.ok) throw new Error(label + " HTTP " + r.status);
        return r.text();
      }).then(text=>{
        if(isLfsPointerText(text)) throw new Error(label + " returned an unresolved Git LFS pointer instead of file content");
        return JSON.parse(text);
      });
    }

    return attempt(url).catch(directErr=>{
      console.warn('[geoBoundaries] direct fetch failed for', label, url, '-- retrying via CORS relay.', directErr);
      return attempt(toRelay(url)).catch(relayErr=>{
        console.error('[geoBoundaries] relay fetch also failed for', label, url, relayErr);
        throw new Error(label + ' failed both directly and via relay: ' + (directErr && directErr.message) + ' / ' + (relayErr && relayErr.message));
      });
    });
  }

  function fetchLevels(iso3){
    if(metaCache[iso3]) return metaCache[iso3];

    const cached = lsGet("meta:" + iso3);
    if(cached){
      metaCache[iso3] = Promise.resolve(cached);
      return metaCache[iso3];
    }

    metaCache[iso3] = fetchJSON(API_BASE + iso3 + "/ALL/", "geoBoundaries metadata for " + iso3)
      .then(rows=>{
        const arr = Array.isArray(rows) ? rows : [rows];
        const levels = arr
          .filter(r => r && r.boundaryType && (r.simplifiedGeometryGeoJSON || r.gjDownloadURL))
          .map(r => ({
            level: r.boundaryType,
            label: LEVEL_LABEL[r.boundaryType] || r.boundaryType,
            unitCount: r.admUnitCount || null,
            url: normalizeGeoUrl(r.simplifiedGeometryGeoJSON || r.gjDownloadURL)
          }))
          .sort((a,b)=> LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
        lsSet("meta:" + iso3, levels);
        return levels;
      })
      .catch(err=>{ delete metaCache[iso3]; throw err; });

    return metaCache[iso3];
  }

  function fetchGeometry(iso3, level, url){
    url = normalizeGeoUrl(url);
    const key = iso3 + ":" + level;
    if(geoCache[key]) return geoCache[key];

    const cached = lsGet("geo:" + key);
    if(cached){
      geoCache[key] = Promise.resolve(cached);
      return geoCache[key];
    }

    geoCache[key] = fetchJSON(url, "geoBoundaries " + level + " geometry for " + iso3)
      .then(gj=>{
        lsSet("geo:" + key, gj); 
        return gj;
      })
      .catch(err=>{ delete geoCache[key]; throw err; });

    return geoCache[key];
  }

  return { resolveIso3, fetchLevels, fetchGeometry, LEVEL_LABEL, LEVEL_ORDER };
})();
