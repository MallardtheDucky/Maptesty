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

  // world.json's `iso_a3` field (Natural Earth) comes through as the
  // literal string "-99" for a handful of complex-sovereignty entries.
  // Patch those by display name so every clickable country still
  // resolves to a real ISO3 code geoBoundaries can look up. Entries with
  // no reasonable ISO3 (disputed slivers, uninhabited territories) are
  // left out on purpose -- geoBoundaries doesn't track them either.
  const ISO_OVERRIDE = {
    "France": "FRA",
    "Norway": "NOR",
    "Kosovo": "XKX"
  };

  const metaCache = {};  // iso3 -> Promise<[{level,name,unitCount,url}]>
  const geoCache  = {};  // "iso3:ADM1" -> Promise<GeoJSON>
  const LS_PREFIX = "gb-cache:";

  function resolveIso3(name, propsIso3){
    if(propsIso3 && propsIso3 !== "-99") return propsIso3;
    return ISO_OVERRIDE[name] || null;
  }

  function lsGet(key){
    try{
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  function lsSet(key, val){
    try{ localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); }
    catch(e){ /* quota exceeded or storage disabled -- just skip caching */ }
  }

  function fetchWithTimeout(url, ms){
    const ctrl = new AbortController();
    const t = setTimeout(()=> ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(()=> clearTimeout(t));
  }

  // Some geoBoundaries geometry files are served from a host that
  // doesn't send CORS headers, even though the metadata API does. When
  // a direct fetch fails for what looks like a CORS/network reason (as
  // opposed to a real 404), retry once through a public read-only CORS
  // relay before giving up, so a missing Access-Control-Allow-Origin
  // header on their end doesn't just break the feature outright.
  function fetchJSON(url, label){
    return fetchWithTimeout(url, 25000)
      .then(r=>{
        if(!r.ok) throw new Error(label + " HTTP " + r.status);
        return r.json();
      })
      .catch(directErr=>{
        console.warn('[geoBoundaries] direct fetch failed for', label, url, '-- retrying via CORS relay.', directErr);
        const proxied = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
        return fetchWithTimeout(proxied, 25000)
          .then(r=>{
            if(!r.ok) throw new Error(label + " (via relay) HTTP " + r.status);
            return r.json();
          })
          .catch(relayErr=>{
            console.error('[geoBoundaries] relay fetch also failed for', label, url, relayErr);
            throw new Error(label + ' failed both directly and via relay: ' + (directErr && directErr.message) + ' / ' + (relayErr && relayErr.message));
          });
      });
  }

  // A single request to the special "ALL" endpoint returns metadata for
  // every ADM level geoBoundaries has on file for this country, so we
  // don't have to probe ADM1..ADM5 one at a time per country.
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
            url: r.simplifiedGeometryGeoJSON || r.gjDownloadURL
          }))
          .sort((a,b)=> LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
        lsSet("meta:" + iso3, levels);
        return levels;
      })
      .catch(err=>{ delete metaCache[iso3]; throw err; });

    return metaCache[iso3];
  }

  function fetchGeometry(iso3, level, url){
    const key = iso3 + ":" + level;
    if(geoCache[key]) return geoCache[key];

    const cached = lsGet("geo:" + key);
    if(cached){
      geoCache[key] = Promise.resolve(cached);
      return geoCache[key];
    }

    geoCache[key] = fetchJSON(url, "geoBoundaries " + level + " geometry for " + iso3)
      .then(gj=>{
        lsSet("geo:" + key, gj); // best-effort; large countries may exceed quota and silently skip
        return gj;
      })
      .catch(err=>{ delete geoCache[key]; throw err; });

    return geoCache[key];
  }

  return { resolveIso3, fetchLevels, fetchGeometry, LEVEL_LABEL, LEVEL_ORDER };
})();
