/**
 * 房地產物件列表 Widget (V4.7 - Whitepaper Final Perfect)
 * - Architecture: Dual-Key (daju_case_cache / daju_case_probe)
 * - UX: Shimmer Skeleton + Zero CLS (min-height match)
 * - Hardening: Trim inputs, Safe Fetch, Auto-Clear Error Flags
 */

(function () {
  const CONFIG = {
    API_URL: "https://daju-case-list.dajuteam88.workers.dev/",
    // NS 已移除 (Clean Code)
    PROBE_INTERVAL_MS: 15 * 60 * 1000,
    FETCH_TIMEOUT_MS: 8000,
    META_TIMEOUT_MS: 5000,
    META_FAIL_COOLDOWN_MS: 60 * 1000,
    MAX_VISIBLE: 3,
    FORCE_REFRESH: false
  };

  const KEYS = {
    STORAGE: "daju_case_cache",       // { version, data }
    LAST_PROBE: "daju_case_probe",    // timestamp only
    META_FAIL_AT: "daju_case_meta_fail"
  };

  // ----------------------------
  // 1. Style (Shimmer + Zero CLS)
  // ----------------------------
  function injectStyles() {
    const STYLE_ID = "daju-case-style-v47";

    if (!document.querySelector('link[href*="fontawesome"]')) {
      const faLink = document.createElement("link");
      faLink.rel = "stylesheet";
      faLink.href = "https://www.dajuteam.com.tw/js/fontawesome-free-5.15.1-web/css/all.min.css";
      document.head.appendChild(faLink);
    }
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.innerHTML = `
      @keyframes dajuShimmer {
        0% { background-position: -468px 0; }
        100% { background-position: 468px 0; }
      }
      .daju-estate-skeleton {
        width: 100%; height: 250px; /* 配套高度 */
        background: #fff;
        border-top: 2px solid #eb6100;
        padding: 0; box-sizing: border-box;
      }
      .skeleton-line {
        height: 60px; width: 100%; margin-bottom: 1px;
        background: #f6f7f8;
        background-image: linear-gradient(to right, #f6f7f8 0%, #edeef1 20%, #f6f7f8 40%, #f6f7f8 100%);
        background-repeat: no-repeat; background-size: 800px 104px;
        animation: dajuShimmer 1.5s linear infinite forwards;
        border-bottom: 1px solid #fff;
      }

      /* Zero CLS */
      .case-list-widget-target {
        width: 100%;
        min-height: 250px; /* 與 Skeleton 一致 */
        margin: 40px 0;    /* 外距由這裡控制 */
        opacity: 0;
        transition: opacity 0.4s ease;
      }
      .case-list-widget-target.show { opacity: 1; }

      /* Widget Base (CSS 合併優化) */
      .case-list-container { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
        width: 100%; 
        background: #fff; 
        padding: 0; 
        box-sizing: border-box; 
        margin: 0; /* 避免雙重 margin */
      }
      
      .case-list-header { color: #eb6100; font-size: 1.6rem; font-weight: bold; margin-bottom: 15px; padding-left: 5px; letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; padding-top: 10px; }
      .case-list-count { font-size: 14px; font-weight: normal; background: #eb6100; color: #fff; padding: 2px 8px; border-radius: 12px; }
      .case-list-ul { list-style: none; padding: 0; margin: 0; border-top: 2px solid #eb6100; }
      .case-list-item { display: flex; flex-direction: column; align-items: flex-start; padding: 15px 10px; border-bottom: 1px solid #ffe6cc; transition: background-color 0.2s; }
      .case-list-ul > .case-list-item:last-child, .case-list-overflow > .case-list-item:last-child { border-bottom: none; }
      .case-list-item:hover { background-color: #fff9f2; }
      .case-list-overflow { max-height: 0; overflow: hidden; opacity: 0; transition: max-height 0.5s ease-in-out, opacity 0.4s ease-in-out; }
      .case-list-overflow.is-expanded { max-height: 2000px; opacity: 1; }
      .case-list-link { text-decoration: none; display: flex; align-items: flex-start; width: 100%; margin-bottom: 8px; }
      .case-list-link::after { content: "\\f35d"; font-family: "Font Awesome 5 Free"; font-weight: 900; font-size: 0.65em; color: #eb6100; opacity: 0.7; margin-left: 0.5em; margin-top: 5px; transition: opacity 0.2s; flex-shrink: 0; }
      .case-list-link:hover::after { opacity: 1; }
      .case-list-dot { color: #eb6100; font-size: 20px; margin-right: 10px; line-height: 1; margin-top: 3px; flex-shrink: 0; }
      .case-list-title { font-size: 1.1rem; font-weight: 500; line-height: 1.5; color: #333; }
      .case-list-price-box { width: 100%; text-align: right; padding-left: 25px; box-sizing: border-box; white-space: nowrap; }
      .case-list-price-num { color: #e62e2e; font-size: 20px; font-weight: bold; font-family: Arial, sans-serif; }
      .case-list-price-unit { color: #666; font-size: 14px; margin-left: 2px; }
      .case-list-more-btn { display: block; width: 100%; text-align: center; padding: 12px 0; margin-top: 15px; background-color: #fff; color: #eb6110; font-size: 1em; cursor: pointer; border: 1px dashed #fedcba; transition: all 0.2s; user-select: none; }
      .case-list-more-btn:hover { background-color: #fff6ee; color: #eb6100; border-color: #eb6100; }
      .case-list-more-btn .arrow-icon { display: inline-block; transition: transform 0.3s; margin-left: 5px; }
      .case-list-more-btn.is-active .arrow-icon { transform: rotate(180deg); }
      .case-list-message { text-align: center; color: #888; padding: 20px; }
      
      @media (min-width: 992px) {
        .case-list-container { max-width: 1000px; }
        .case-list-item { flex-direction: row; justify-content: space-between; align-items: center; }
        .case-list-link { width: auto; margin-bottom: 0; padding-right: 20px; align-items: center; flex: 1; }
        .case-list-link::after { margin-top: 0; }
        .case-list-dot { margin-top: 0; }
        .case-list-price-box { width: auto; text-align: right; padding-left: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // ----------------------------
  // 2. Utils
  // ----------------------------
  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }
  function safeSetItem(key, val) {
    try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }

  // ✅ Patch C: 更穩健的 fetchJSON (防止 HTML/502 報錯)
  async function fetchJSON(url, { timeoutMs, cacheMode }) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: cacheMode || "no-cache" });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; } // 解析失敗視為 null
      return { ok: res.ok, status: res.status, data };
    } finally {
      clearTimeout(tid);
    }
  }

  function sanitizeData_(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i] || {};
      if (!it.case_name || !it.url) continue;
      out.push({
        shop: it.shop || "",
        case_name: String(it.case_name),
        title: it.title ? String(it.title) : "無標題",
        url: String(it.url),
        price: (it.price == null) ? 0 : it.price
      });
    }
    return out;
  }

  // ----------------------------
  // 3. Unified Data Engine
  // ----------------------------
  async function unifiedDataEngine() {
    const now = Date.now();
    const local = safeJSONParse(localStorage.getItem(KEYS.STORAGE) || "{}", {});
    const lastProbe = parseInt(localStorage.getItem(KEYS.LAST_PROBE) || "0", 10) || 0;

    // A) 15 分鐘鎖定
    if (local.data && Array.isArray(local.data) && (now - lastProbe < CONFIG.PROBE_INTERVAL_MS)) {
      return sanitizeData_(local.data);
    }

    // B) Meta 探針
    const lastMetaFailAt = parseInt(localStorage.getItem(KEYS.META_FAIL_AT) || "0", 10) || 0;
    if (now - lastMetaFailAt > CONFIG.META_FAIL_COOLDOWN_MS) {
      try {
        const metaRes = await fetchJSON(`${CONFIG.API_URL}?meta=1`, {
          timeoutMs: CONFIG.META_TIMEOUT_MS,
          cacheMode: "no-cache"
        });
        const metaVersion = metaRes.data && metaRes.data.version;

        if (metaVersion && local.version === metaVersion && local.data && Array.isArray(local.data)) {
          safeSetItem(KEYS.LAST_PROBE, String(now));
          // ✅ Patch B: 成功後清除錯誤旗標
          safeSetItem(KEYS.META_FAIL_AT, "0");
          return sanitizeData_(local.data);
        }
      } catch (e) {
        safeSetItem(KEYS.META_FAIL_AT, String(now));
      }
    }

    // C) 完整抓取
    try {
      const v = local.version || "0";
      const url = CONFIG.FORCE_REFRESH
        ? `${CONFIG.API_URL}?refresh=1`
        : `${CONFIG.API_URL}?v=${encodeURIComponent(v)}`;

      const res = await fetchJSON(url, {
        timeoutMs: CONFIG.FETCH_TIMEOUT_MS,
        cacheMode: "no-cache"
      });

      const payload = res.data;

      // 304 Not Modified
      if (payload && payload.code === 304) {
        safeSetItem(KEYS.LAST_PROBE, String(now));
        safeSetItem(KEYS.META_FAIL_AT, "0"); // 成功連線，清除錯誤
        return sanitizeData_(local.data || []);
      }

      // 200 OK
      if (payload && payload.code === 200 && Array.isArray(payload.data)) {
        const clean = sanitizeData_(payload.data);
        safeSetItem(KEYS.STORAGE, JSON.stringify({ version: payload.version, data: clean }));
        safeSetItem(KEYS.LAST_PROBE, String(now));
        safeSetItem(KEYS.META_FAIL_AT, "0"); // 成功連線，清除錯誤
        return clean;
      }

      // 503 Rebuilding -> 降級
      if (payload && payload.code === 503) {
        return sanitizeData_(local.data || []);
      }
    } catch (e) {
      return sanitizeData_(local.data || []);
    }

    return sanitizeData_(local.data || []);
  }

  // ----------------------------
  // 4. Rendering
  // ----------------------------
  function indexByCaseName(data) {
    const map = new Map();
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const k = d.case_name || "";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    }
    return map;
  }

  let _overflowSeq = 0;

  function renderWidget(container, dataIndex) {
    // ✅ Patch A: Trim 防呆，避免 dataset 有空白導致找不到
    const caseName = (container.dataset.caseName || "").trim();
    
    let items = (dataIndex instanceof Map) ? (dataIndex.get(caseName) || []) : [];

    if (!items.length) {
      container.innerHTML = '<div class="case-list-container"><div class="case-list-message">目前尚無上架物件</div></div>';
      return;
    }

    items = items.slice().sort((a, b) => {
      const pA = parseFloat(String(a.price).replace(/,/g, "")) || 0;
      const pB = parseFloat(String(b.price).replace(/,/g, "")) || 0;
      return pA - pB;
    });

    const linkTarget = window.innerWidth < 992 ? "_self" : "_blank";

    let html = `
      <div class="case-list-container">
        <div class="case-list-header">
          <span>《 最新上架物件 》</span>
          <span class="case-list-count">共 ${items.length} 筆</span>
        </div>
        <div class="case-list-ul">
    `;

    const gen = (item) => {
      let displayPrice = String(item.price);
      if (!displayPrice.includes("萬") && item.price != 0) displayPrice += "萬";
      return `
        <div class="case-list-item">
          <a href="${item.url}" target="${linkTarget}" class="case-list-link">
            <span class="case-list-dot">•</span>
            <span class="case-list-title">${item.title}</span>
          </a>
          <div class="case-list-price-box">
            <span class="case-list-price-num">${displayPrice.replace("萬", "")}</span>
            <span class="case-list-price-unit">萬</span>
          </div>
        </div>`;
    };

    items.slice(0, CONFIG.MAX_VISIBLE).forEach(it => (html += gen(it)));

    if (items.length > CONFIG.MAX_VISIBLE) {
      const hidden = items.slice(CONFIG.MAX_VISIBLE);
      const overflowId = `overflow-${++_overflowSeq}`;
      html += `<div class="case-list-overflow" id="${overflowId}">`;
      hidden.forEach(it => (html += gen(it)));
      html += `</div>
        <div class="case-list-more-btn" onclick="DAJU_toggleEstateList(this, '${overflowId}')">
          <span class="btn-text">查看更多案件 (還有 ${hidden.length} 筆)</span>
          <span class="arrow-icon">▾</span>
        </div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
  }

  // ----------------------------
  // 5. Global Toggle
  // ----------------------------
  function DAJU_toggleEstateList(btn, overflowId) {
    const overflowDiv = document.getElementById(overflowId);
    const btnText = btn && btn.querySelector ? btn.querySelector(".btn-text") : null;
    if (!overflowDiv || !btnText) return;

    overflowDiv.classList.toggle("is-expanded");
    btn.classList.toggle("is-active");

    if (overflowDiv.classList.contains("is-expanded")) {
      btnText.textContent = "收起列表";
    } else {
      const count = overflowDiv.querySelectorAll(".case-list-item").length;
      btnText.textContent = `查看更多案件 (還有 ${count} 筆)`;
    }
  }

  if (!window.DAJU_toggleEstateList) window.DAJU_toggleEstateList = DAJU_toggleEstateList;
  if (!window.toggleEstateList) window.toggleEstateList = window.DAJU_toggleEstateList;

  // ----------------------------
  // 6. Init
  // ----------------------------
  async function init() {
    const widgets = document.querySelectorAll("#case-list, .case-list-widget-target");
    if (!widgets.length) return;

    injectStyles();

    const skeletonHTML = `
      <div class="daju-estate-skeleton">
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line" style="border-bottom:none;"></div>
      </div>`;

    widgets.forEach(w => {
      w.classList.add("case-list-widget-target");
      w.innerHTML = skeletonHTML;
      // Request Animation Frame 確保 transition 正常觸發
      requestAnimationFrame(() => w.classList.add("show"));
    });

    const data = await unifiedDataEngine();
    const idx = indexByCaseName(Array.isArray(data) ? data : []);

    widgets.forEach(w => {
      renderWidget(w, idx);
      w.classList.add("show");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
