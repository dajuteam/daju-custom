/**
 * Daju Zone Ads Widget V1.6 (Whitepaper-aligned)
 * - Meta-first version probe
 * - V-FULL edge cache hit: &v=VERSION
 * - localStorage TTL: 10 min -> 0 request
 * - meta cooldown + safe fallback
 * - Supports backend format: { zone, case_name, images:[], link_url }
 * - Pick 1 image with equal probability (2 imgs => 50/50, 3 imgs => 33.3%)
 * - Multiple containers supported: #case-zone-ads OR [data-case-zone]
 */

(function (window, document) {
  'use strict';

  // =========================================================
  // 0) Config
  // =========================================================
  const API_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=zone_ads";

  const LS_KEY = "daju_zone_ads_cache_v1";
  const LS_TTL_MS = 10 * 60 * 1000;          // 10 min: within TTL => 0 request
  const META_COOLDOWN_MS = 60 * 1000;        // meta fail cooldown
  const FETCH_TIMEOUT_MS = 8000;

  const STYLE_ID = "daju-zone-ads-style";

  // Optional rotation (if you want). Set 0 to disable.
  const ROTATE_INTERVAL_MS = 0; // e.g. 8000 for 8s rotate

  // =========================================================
  // 1) Storage Helpers
  // =========================================================
  function readLS() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; }
  }
  function writeLS(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {}
  }

  // Cache schema:
  // {
  //   version: "176....",
  //   ts: 1234567890,
  //   data: [...],
  //   metaFailTs: 0
  // }

  // =========================================================
  // 2) Fetch Helpers (timeout + safe json)
  // =========================================================
  async function fetchJson(url, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: ctrl.signal, credentials: "omit" });
      const text = await res.text();
      // 某些狀況回的是非 JSON（例如 CF error page）
      try { return JSON.parse(text); } catch { return null; }
    } finally {
      clearTimeout(timer);
    }
  }

  // =========================================================
  // 3) Data Normalize
  // =========================================================
  function normalizeAdsData(payload) {
    // Expect: { code:200, data:[{zone,case_name,images,link_url}] }
    if (!payload || payload.code !== 200 || !Array.isArray(payload.data)) return null;

    const arr = payload.data
      .map(x => ({
        zone: String(x.zone || "").trim(),
        case_name: String(x.case_name || "").trim(),
        link_url: String(x.link_url || "").trim(),
        // backend uses images[]
        images: Array.isArray(x.images) ? x.images.map(s => String(s || "").trim()).filter(Boolean) : [],
      }))
      .filter(x => x.zone && x.case_name && x.images.length > 0);

    return arr;
  }

  // =========================================================
  // 4) Smart Fetch (whitepaper-aligned)
  // =========================================================
  async function getZoneAdsData() {
    const now = Date.now();
    const cached = readLS();

    // TTL hit => 0 request
    if (cached && cached.data && (now - (cached.ts || 0) < LS_TTL_MS)) {
      return cached.data;
    }

    // meta cooldown if last meta failed recently
    if (cached && cached.metaFailTs && (now - cached.metaFailTs < META_COOLDOWN_MS)) {
      return cached.data || null;
    }

    // Step A: meta probe
    const meta = await fetchJson(API_URL + "&meta=1", FETCH_TIMEOUT_MS);
    const latestVersion = meta && meta.version ? String(meta.version) : "";

    if (!latestVersion) {
      // record meta fail
      if (cached) {
        cached.metaFailTs = now;
        cached.ts = now; // 讓它不要一直打
        writeLS(cached);
        return cached.data || null;
      }
      return null;
    }

    // Same version => renew ts only (0 full)
    if (cached && cached.version === latestVersion && cached.data) {
      cached.ts = now;
      cached.metaFailTs = 0;
      writeLS(cached);
      return cached.data;
    }

    // Step B: full download with version => HIT edge cache
    const full = await fetchJson(API_URL + "&v=" + encodeURIComponent(latestVersion), FETCH_TIMEOUT_MS);
    const normalized = normalizeAdsData(full);

    if (normalized) {
      writeLS({ version: latestVersion, ts: now, data: normalized, metaFailTs: 0 });
      return normalized;
    }

    // fallback to old cache
    if (cached) {
      cached.metaFailTs = now;
      cached.ts = now;
      writeLS(cached);
      return cached.data || null;
    }
    return null;
  }

  // =========================================================
  // 5) Render Engine
  // =========================================================
  function ensureStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .zone-ad-container { opacity: 0; transform: translateY(10px); transition: all 0.8s ease; width: 100%; margin: 20px 0; }
      .zone-ad-container.show { opacity: 1; transform: translateY(0); }
      .zone-ad-link { display: block; width: 100%; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
      .zone-ad-img { width: 100%; height: auto; display: block; border: none; }
    `;
    document.head.appendChild(style);
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function renderOne(container, allAds) {
    const targetZone = String(container.getAttribute("data-case-zone") || "").trim();
    if (!targetZone) return;

    const zoneRows = allAds.filter(ad => ad.zone === targetZone);
    if (!zoneRows.length) return;

    // ✅ 你需求：2~3 張圖「均等機率」
    // 做法：把此 zone 的所有 images 攤平成 pool，再隨機挑一張
    const pool = [];
    let link = "";      // 預設 link 用該張圖所在 row 的 link（取中選那張時再決定）
    let alt = targetZone;

    zoneRows.forEach(r => {
      r.images.forEach(img => pool.push({ img, link_url: r.link_url, case_name: r.case_name }));
    });

    if (!pool.length) return;

    const chosen = pickRandom(pool);
    link = chosen.link_url || "";
    alt = chosen.case_name || targetZone;

    ensureStyleOnce();

    // 清掉舊內容（避免重複累積）
    container.innerHTML = `
      <div class="zone-ad-container" data-zone-ad-inner="1">
        <a class="zone-ad-link" href="${link ? escapeAttr(link) : "javascript:void(0)"}" target="_blank" rel="noopener noreferrer">
          <img class="zone-ad-img" src="${escapeAttr(chosen.img)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async">
        </a>
      </div>
    `;

    requestAnimationFrame(() => {
      const inner = container.querySelector('[data-zone-ad-inner="1"]');
      if (inner) inner.classList.add("show");
    });

    // optional rotate
    if (ROTATE_INTERVAL_MS > 0 && pool.length > 1) {
      const timerKey = "__zoneAdsTimer__";
      if (container[timerKey]) clearInterval(container[timerKey]);

      container[timerKey] = setInterval(() => {
        const next = pickRandom(pool);
        const imgEl = container.querySelector("img.zone-ad-img");
        const aEl = container.querySelector("a.zone-ad-link");
        if (imgEl) {
          imgEl.src = next.img;
          imgEl.alt = next.case_name || targetZone;
        }
        if (aEl) aEl.href = next.link_url ? next.link_url : "javascript:void(0)";
      }, ROTATE_INTERVAL_MS);
    }
  }

  // basic attribute escaping
  function escapeAttr(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  async function renderAll() {
    // 支援單一 id 或多個（更接近你其他三套 widget 的可重用性）
    const containers = [];
    const byId = document.getElementById("case-zone-ads");
    if (byId) containers.push(byId);

    // 也支援同頁多個廣告區塊
    document.querySelectorAll('[data-case-zone]').forEach(el => {
      if (el !== byId) containers.push(el);
    });

    if (!containers.length) return;

    const allAds = await getZoneAdsData();
    if (!allAds || !Array.isArray(allAds)) return;

    containers.forEach(c => renderOne(c, allAds));
  }

  // =========================================================
  // 6) Boot
  // =========================================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAll);
  } else {
    renderAll();
  }

})(window, document);
