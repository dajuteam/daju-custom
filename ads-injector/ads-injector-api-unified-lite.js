/**
 * 大橘廣告管理系統 (V4.12 - Ads-aligned Meta-First + Warm Compatible)
 * ----------------------------------------------------------------------------
 * ✅ 核心目標：與 Case List / Expert Card 請求形態完全一致
 * * Network 形態：
 * 1) 首次/清空：meta=1 (no-store) -> v=最新版本 (default/HIT Edge)
 * 2) TTL 內：0 request
 * 3) TTL 到期：meta=1 -> 版本相同 (0 full) / 版本不同 (v=最新版本 HIT Edge)
 */

(function() {
  const CONFIG = {
    API_URL: "https://daju-unified-route-api.dajuteam88.workers.dev/?type=ads_injector",
    PROBE_INTERVAL_MS: 5 * 60 * 1000, // 5 分鐘 TTL
    FETCH_TIMEOUT_MS: 8000,
    META_TIMEOUT_MS: 4000,
    FORCE_REFRESH: false
  };

  const KEY_CACHE = "daju_ads_cache";

  // ==========================================
  // 1. Utils & Cache Helpers
  // ==========================================
  function safeJSONParse(str, fallback) { try { return JSON.parse(str); } catch { return fallback; } }
  
  function safeSetCache(obj) {
    // 這裡保留你要求的 defer (requestIdleCallback) 概念，但寫法對齊標準
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => { try { localStorage.setItem(KEY_CACHE, JSON.stringify(obj)); } catch {} }, { timeout: 1000 });
    } else {
      try { localStorage.setItem(KEY_CACHE, JSON.stringify(obj)); } catch {}
    }
  }

  async function fetchJSON(url, { timeoutMs, cacheMode }) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        cache: cacheMode || "default",
        headers: { "Accept": "application/json" }
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      return { ok: res.ok, data };
    } catch (e) {
      return { ok: false, data: null };
    } finally {
      clearTimeout(tid);
    }
  }

  function buildApiUrl({ meta = false, version = "", refresh = false } = {}) {
    const u = new URL(CONFIG.API_URL);
    if (meta) u.searchParams.set("meta", "1");
    if (!meta && version) u.searchParams.set("v", String(version));
    if (refresh) u.searchParams.set("refresh", "1");
    return u.toString();
  }

  // ==========================================
  // 2. Smart Engine (嚴格對齊 Case List 邏輯)
  // ==========================================
  async function unifiedDataEngine() {
    const now = Date.now();
    const cache = safeJSONParse(localStorage.getItem(KEY_CACHE), {});
    const cachedData = cache.data || null;
    const cachedVersion = cache.version ? String(cache.version) : "";
    const cachedTs = parseInt(cache.ts || "0") || 0;

    // 判斷是否強制刷新
    let urlHasRefresh = false;
    try { urlHasRefresh = new URLSearchParams(location.search).has("refresh"); } catch {}
    const forceRefresh = CONFIG.FORCE_REFRESH || urlHasRefresh;

    // A) TTL 內且非強制：0 請求
    if (!forceRefresh && cachedData && (now - cachedTs < CONFIG.PROBE_INTERVAL_MS)) {
      return { data: cachedData, version: cachedVersion };
    }

    // B) Meta-First 流程 (首次、過期、或強制刷新)
    // 步驟 1: 打 Meta 拿最新版本
    const metaRes = await fetchJSON(buildApiUrl({ meta: true }), {
      timeoutMs: CONFIG.META_TIMEOUT_MS,
      cacheMode: "no-store" // Meta 永遠不存快取
    });
    
    const latestV = metaRes?.data?.version ? String(metaRes.data.version) : "";

    // 步驟 2: 如果版本沒變且不是強制刷新 -> 只續命
    if (!forceRefresh && latestV && latestV === cachedVersion && cachedData) {
      safeSetCache({ version: cachedVersion, data: cachedData, ts: now });
      return { data: cachedData, version: cachedVersion };
    }

    // 步驟 3: 版本不同或首次或強制 -> 打 Full
    // ✅ 這裡就是關鍵：用 v=${latestV} 去 HIT 你 warm 好的 Edge
    const fullRes = await fetchJSON(buildApiUrl({ 
      version: latestV || cachedVersion || "stable", 
      refresh: forceRefresh 
    }), {
      timeoutMs: CONFIG.FETCH_TIMEOUT_MS,
      cacheMode: forceRefresh ? "reload" : "default" // 正常狀態用 default 來 HIT Edge
    });

    if (fullRes?.data?.code === 200 && fullRes.data.data) {
      const payload = fullRes.data.data;
      const finalV = fullRes.data.version || latestV || "stable";
      safeSetCache({ version: finalV, data: payload, ts: now });
      return { data: payload, version: finalV };
    }

    // Fallback
    return cachedData ? { data: cachedData, version: cachedVersion } : null;
  }

  // ==========================================
  // 3. Rendering (保留原 ADS 邏輯)
  // ==========================================
  function appendV(url, v) {
    if (!url || !v) return url;
    try {
      const u = new URL(url, location.href);
      u.searchParams.set("v", String(v));
      return u.toString();
    } catch { return url; }
  }

  function renderSlot(slot, adData, version) {
    if (!slot.dataset.baseClass) slot.dataset.baseClass = slot.className;
    slot.className = slot.dataset.baseClass;
    slot.innerHTML = "";
    slot.style.display = "none";

    if (!adData) return;
    if (adData.class) {
      adData.class.split(/\s+/).filter(Boolean).forEach(c => slot.classList.add(c));
    }

    let hasContent = false;
    if (adData.type === "image" && adData.img) {
      const img = document.createElement("img");
      img.src = appendV(adData.img, version);
      img.loading = "lazy";
      img.alt = adData.title || "房產廣告";
      if (adData.link) {
        const a = document.createElement("a");
        a.href = adData.link; a.target = "_blank"; a.rel = "noopener";
        a.appendChild(img); slot.appendChild(a);
      } else { slot.appendChild(img); }
      hasContent = true;
    } else if (adData.type === "youtube" && adData.video) {
      slot.innerHTML = `<div class="ad-video-wrapper"><iframe src="${appendV(adData.video, version)}" allowfullscreen loading="lazy"></iframe></div>`;
      hasContent = true;
    } else if (adData.type === "html" && adData.html) {
      // 這裡簡化了 bustHtmlUrls，直接填入
      slot.innerHTML = adData.html;
      hasContent = true;
    }

    if (hasContent) {
      slot.style.display = "block";
      slot.classList.add("ad-fade-in");
    }
  }

  // ==========================================
  // 4. Init & BFCache
  // ==========================================
  async function init() {
    const slots = document.querySelectorAll(".ad-slot");
    if (!slots.length) return;

    // 注入樣式 (保留你原本的 CSS)
    if (!document.getElementById("daju-ad-manager-styles")) {
      const style = document.createElement("style");
      style.id = "daju-ad-manager-styles";
      style.textContent = `.ad-slot{width:100%;margin:20px 0;display:none;overflow:hidden}.ad-slot img{display:block;width:100%;height:auto;object-fit:cover}.ad-video-wrapper{position:relative;width:100%;padding-bottom:56.25%;background:#000}.ad-video-wrapper iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}.ad-fade-in{animation:adFadeIn 0.35s ease-in forwards}@keyframes adFadeIn{from{opacity:0}to{opacity:1}}`;
      document.head.appendChild(style);
    }

    const result = await unifiedDataEngine();
    if (!result) return;

    slots.forEach(slot => {
      const id = slot.dataset.slotId;
      if (id) renderSlot(slot, result.data[id], result.version);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.addEventListener("pageshow", (ev) => { if (ev.persisted) init(); });
})();
