/**
 * Daju Zone Ads Widget V2.1
 * - meta-first
 * - localStorage TTL
 * - 同 zone 多列 = 權重
 * - 不排序、不優化順序
 */

(function (window, document) {
  'use strict';

  // =========================================================
  // 1) Config
  // =========================================================
  const API_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=zone_ads";
  const LS_KEY  = "DAJU_ZONE_ADS_CACHE_V21";
  const TTL_MS  = 10 * 60 * 1000; // 10 分鐘檢查 meta

  // =========================================================
  // 2) localStorage helpers
  // =========================================================
  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function writeCache(obj) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch (e) {}
  }

  // =========================================================
  // 3) meta-first fetch
  // =========================================================
  async function getZoneAdsData() {
    const now = Date.now();
    const cached = readCache();

    // TTL 內直接用
    if (cached && cached.ts && (now - cached.ts < TTL_MS)) {
      return cached.data || [];
    }

    try {
      // meta
      const metaRes = await fetch(API_URL + "&meta=1", { cache: "no-store" });
      const meta = await metaRes.json();
      const latest = meta.version;

      // 版本相同 → 續命
      if (cached && cached.version === latest) {
        cached.ts = now;
        writeCache(cached);
        return cached.data || [];
      }

      // 版本不同 → 拉 full（帶 v 命中 edge）
      const fullRes = await fetch(API_URL + "&v=" + encodeURIComponent(latest));
      const full = await fullRes.json();

      if (full && full.code === 200 && Array.isArray(full.data)) {
        writeCache({
          version: latest,
          ts: now,
          data: full.data
        });
        return full.data;
      }

    } catch (e) {
      console.warn("[ZoneAds] fetch failed, fallback to cache", e);
    }

    return cached ? (cached.data || []) : [];
  }

  // =========================================================
  // 4) Render Engine
  // =========================================================
  function renderZoneAds() {
    const container = document.getElementById("case-zone-ads");
    if (!container) return;

    const zone = String(container.getAttribute("data-case-zone") || "").trim();
    if (!zone) return;

    getZoneAdsData().then(function (allAds) {
      if (!Array.isArray(allAds) || allAds.length === 0) return;

      // ❗ 不排序、不改順序
      const matches = allAds.filter(function (ad) {
        return String(ad.zone || "") === zone && ad.image_url;
      });

      if (matches.length === 0) return;

      // 🎯 權重邏輯：同 zone 出現次數 = 機率
      const selected = matches[Math.floor(Math.random() * matches.length)];

      inject(container, selected);
    });
  }

  // =========================================================
  // 5) DOM inject（極簡、穩定）
  // =========================================================
  function inject(container, ad) {
    const html = `
      <style>
        .zone-ad-wrap {
          width: 100%;
          margin: 16px 0;
          opacity: 0;
          transform: translateY(8px);
          transition: all .6s ease;
        }
        .zone-ad-wrap.show {
          opacity: 1;
          transform: translateY(0);
        }
        .zone-ad-wrap img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 12px;
        }
      </style>

      <div class="zone-ad-wrap" id="zone-ad-inner">
        <a href="${ad.link_url || "javascript:void(0)"}"
           target="_blank"
           rel="noopener noreferrer">
          <img src="${ad.image_url}" alt="">
        </a>
      </div>
    `;

    container.innerHTML = html;

    requestAnimationFrame(function () {
      const el = document.getElementById("zone-ad-inner");
      if (el) el.classList.add("show");
    });
  }

  // =========================================================
  // 6) boot
  // =========================================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderZoneAds);
  } else {
    renderZoneAds();
  }

})(window, document);
