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

  // geoBoundaries' metadata API hands back geometry URLs shaped like
  // https://github.com/<org>/<repo>/raw/<ref>/<path>. Two problems with
  // that, discovered the hard way:
  //   1) That "raw" path on github.com is a redirector to
  //      raw.githubusercontent.com, and the redirect response itself
  //      doesn't carry a valid Access-Control-Allow-Origin header, so a
  //      cross-origin fetch() dies on the hop before reaching the file.
  //   2) Even raw.githubusercontent.com doesn't help here: as of
  //      geoBoundaries 5.0, every release file is stored via Git LFS, so
  //      that host only serves the small LFS *pointer* text
  //      ("version https://git-lfs.github.com/spec/v1..."), not the
  //      actual GeoJSON bytes.
  // GitHub's media.githubusercontent.com host is the one that actually
  // resolves LFS pointers to real file content, with correct CORS
  // headers. We rewrite to that host and use the "main" branch rather
  // than the (possibly abbreviated, LFS-incompatible) commit ref the API
  // gave us -- "main" always has the current release at this same path.
  function normalizeGeoUrl(url){
    if(!url) return url;
    const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/[^/]+\/(.+)$/.exec(url);
    if(m) return "https://media.githubusercontent.com/media/" + m[1] + "/" + m[2] + "/main/" + m[3];
    const m2 = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/[^/]+\/(.+)$/.exec(url);
    if(m2) return "https://media.githubusercontent.com/media/" + m2[1] + "/" + m2[2] + "/main/" + m2[3];
    return url;
  }

  // Detects the small text stand-in Git LFS leaves behind when a host
  // doesn't resolve the pointer to real content, so we can treat it as a
  // failure (and fall back) instead of trying to JSON.parse it.
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
    catch(e){ /* quota exceeded or storage disabled -- just skip caching */ }
  }

  function fetchWithTimeout(url, ms){
    const ctrl = new AbortController();
    const t = setTimeout(()=> ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(()=> clearTimeout(t));
  }

  // Converts a media.githubusercontent.com LFS-resolving URL into a
  // generic public CORS relay URL, as a last-resort fallback if GitHub's
  // own media host is unreachable or rate-limited.
  function toRelay(url){
    return "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
  }

  // Some geoBoundaries hosts are inconsistent about CORS headers, and
  // (separately) Git LFS files resolve to a small pointer stand-in
  // instead of real content on some hosts. A fetch "succeeds" here only
  // if it returns a real HTTP success AND the body isn't an LFS pointer;
  // otherwise we retry via a public CORS relay before giving up, so a
  // single misbehaving host doesn't just break the feature outright.
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
    // Defends against stale localStorage metadata (saved by an older
    // build of this file) that still holds an un-rewritten github.com/raw
    // URL -- normalize on every call, not just at fetchLevels() time.
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
        lsSet("geo:" + key, gj); // best-effort; large countries may exceed quota and silently skip
        return gj;
      })
      .catch(err=>{ delete geoCache[key]; throw err; });

    return geoCache[key];
  }

  return { resolveIso3, fetchLevels, fetchGeometry, LEVEL_LABEL, LEVEL_ORDER };
})();
