(function (window, document) {
  'use strict';

  const API_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=zone_ads";
  const LS_KEY  = "DAJU_ZONE_ADS_CACHE_V21";
  const TTL_MS  = 10 * 60 * 1000;

  function readCache() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {}
  }

  async function getZoneAdsData() {
    const now = Date.now();
    const cached = readCache();

    if (cached && cached.ts && (now - cached.ts < TTL_MS)) return cached.data || [];

    try {
      const meta = await fetch(API_URL + "&meta=1", { cache: "no-store" }).then(r => r.json());
      const latest = meta.version;

      if (cached && cached.version === latest) {
        cached.ts = now; writeCache(cached);
        return cached.data || [];
      }

      const full = await fetch(API_URL + "&v=" + encodeURIComponent(latest)).then(r => r.json());
      if (full && full.code === 200 && Array.isArray(full.data)) {
        writeCache({ version: latest, ts: now, data: full.data });
        return full.data;
      }
    } catch (e) {}

    return cached ? (cached.data || []) : [];
  }

  // ✅ 真亂數（避免 Math.random 在某些環境表現像固定）
  function pickIndex_(len) {
    if (!len || len <= 1) return 0;
    if (window.crypto && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] % len;
    }
    return Math.floor(Math.random() * len);
  }

  // ✅ 正規化 zone：去頭尾空白 + 全形空白
  function norm_(s) {
    return String(s || "")
      .replace(/\u3000/g, " ")   // 全形空白 -> 半形
      .trim();
  }

  function inject(container, ad) {
    const html = `
      <style>
        .zone-ad-wrap { width:100%; margin:16px 0; opacity:0; transform:translateY(8px); transition:all .6s ease; }
        .zone-ad-wrap.show { opacity:1; transform:translateY(0); }
        .zone-ad-wrap img { width:100%; height:auto; display:block; border-radius:12px; }
      </style>
      <div class="zone-ad-wrap" id="zone-ad-inner">
        <a href="${ad.link_url || "javascript:void(0)"}" target="_blank" rel="noopener noreferrer">
          <img src="${ad.image_url}" alt="">
        </a>
      </div>
    `;
    container.innerHTML = html;
    requestAnimationFrame(() => {
      const el = document.getElementById("zone-ad-inner");
      if (el) el.classList.add("show");
    });
  }

  async function renderZoneAds(forceReroll) {
    const container = document.getElementById("case-zone-ads");
    if (!container) return;

    const zone = norm_(container.getAttribute("data-case-zone"));
    if (!zone) return;

    const allAds = await getZoneAdsData();
    if (!Array.isArray(allAds) || allAds.length === 0) return;

    const matches = allAds.filter(ad => norm_(ad.zone) === zone && ad.image_url);

    if (matches.length === 0) return;

    // ✅ 每次 render 都抽一次（matches 多筆就有機率）
    const idx = pickIndex_(matches.length);

    // ✅ Debug（你要看是不是真的抽不同張）
    // console.log("[ZoneAds]", zone, "matches=", matches.length, "pick=", idx, matches[idx]?.image_url);

    inject(container, matches[idx]);
  }

  // ✅ DOMContentLoaded：第一次抽
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => renderZoneAds(true));
  } else {
    renderZoneAds(true);
  }

  // ✅ pageshow：BFCache 返回也要重抽（你「怎麼整理都第一張」最常見就是這個）
  window.addEventListener("pageshow", (e) => {
    // e.persisted === true 代表從 BFCache 回來
    renderZoneAds(true);
  });

})(window, document);
