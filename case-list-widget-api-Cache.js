/**
 * 房地產物件列表 Widget (V4.3 - Whitepaper Standard Production)
 * - Unified Data Engine: meta probe + 304 keep-alive + versioned fetch
 * - Zero CLS: skeleton + viewport fade-in
 * - Timeout fuse + localStorage safe fallback
 * - Map index acceleration
 */

(function () {
  const CONFIG = {
    // ✅ 已改成你的 Cloudflare Worker
    API_URL: "https://daju-case-list.dajuteam88.workers.dev/",
    NS: "DAJU_ESTATE_",
    PROBE_INTERVAL_MS: 15 * 60 * 1000,
    FETCH_TIMEOUT_MS: 8000,
    META_TIMEOUT_MS: 5000,
    META_FAIL_COOLDOWN_MS: 60 * 1000,
    MAX_VISIBLE: 3
  };

  const KEYS = {
    STORAGE: CONFIG.NS + "STORAGE",
    LAST_PROBE: CONFIG.NS + "LAST_PROBE",
    META_FAIL_AT: CONFIG.NS + "META_FAIL_AT"
  };

  // ----------------------------
  // Style (Zero CLS + original)
  // ----------------------------
  function injectStyles() {
    if (!document.querySelector('link[href*="fontawesome"]')) {
      const faLink = document.createElement("link");
      faLink.rel = "stylesheet";
      faLink.href = "https://www.dajuteam.com.tw/js/fontawesome-free-5.15.1-web/css/all.min.css";
      document.head.appendChild(faLink);
    }
    if (document.getElementById(CONFIG.NS + "STYLE")) return;

    const style = document.createElement("style");
    style.id = CONFIG.NS + "STYLE";
    style.innerHTML = `
      /* Zero CLS: skeleton 佔位，避免首屏空白 */
      .daju-estate-skeleton {
        width: 100%;
        min-height: 120px;
        margin: 40px 0;
        background: #fff;
        border-top: 2px solid #eb6100;
        padding: 16px 10px;
        box-sizing: border-box;
        color: #888;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      .case-list-widget-target {
        opacity: 0;
        transition: opacity 0.6s ease;
        width: 100%;
      }
      .case-list-widget-target.show { opacity: 1; }

      /* --- 原有樣式保留（V3.1）--- */
      .case-list-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; width: 100%; margin: 40px 0; background: #fff; padding: 0; box-sizing: border-box; }
      .case-list-header { color: #eb6100; font-size: 1.6rem; font-weight: bold; margin-bottom: 15px; padding-left: 5px; letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; }
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
  // Utils
  // ----------------------------
  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }
  function safeSetItem(key, val) {
    try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }

  async function fetchJSON(url, { timeoutMs, cacheMode }) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        cache: cacheMode || "no-cache"
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data, headers: res.headers };
    } finally {
      clearTimeout(tid);
    }
  }

  // ----------------------------
  // Unified Data Engine
  // ----------------------------
  async function unifiedDataEngine() {
    const now = Date.now();
    const local = safeJSONParse(localStorage.getItem(KEYS.STORAGE) || "{}", {});
    const lastProbe = parseInt(localStorage.getItem(KEYS.LAST_PROBE) || "0", 10) || 0;

    // A) 15 分鐘鎖定：時間內 0 請求
    if (local.data && (now - lastProbe < CONFIG.PROBE_INTERVAL_MS)) {
      return local.data;
    }

    // B) Meta 探針（帶節流）
    const lastMetaFailAt = parseInt(localStorage.getItem(KEYS.META_FAIL_AT) || "0", 10) || 0;
    if (now - lastMetaFailAt > CONFIG.META_FAIL_COOLDOWN_MS) {
      try {
        const metaRes = await fetchJSON(`${CONFIG.API_URL}?meta=1`, {
          timeoutMs: CONFIG.META_TIMEOUT_MS,
          cacheMode: "no-cache"
        });

        const metaVersion = metaRes.data && metaRes.data.version;
        if (metaVersion && local.version === metaVersion && local.data) {
          safeSetItem(KEYS.LAST_PROBE, String(now)); // 304 續命等價：只更新 timestamp
          return local.data;
        }
      } catch (e) {
        safeSetItem(KEYS.META_FAIL_AT, String(now));
      }
    }

    // C) 完整資料抓取：帶 v 走 304 / 200
    try {
      const v = local.version || "0";
      const res = await fetchJSON(`${CONFIG.API_URL}?v=${encodeURIComponent(v)}`, {
        timeoutMs: CONFIG.FETCH_TIMEOUT_MS,
        cacheMode: "no-cache"
      });

      const payload = res.data;

      if (payload && payload.code === 304) {
        safeSetItem(KEYS.LAST_PROBE, String(now));
        return local.data || [];
      }

      if (payload && payload.code === 200) {
        safeSetItem(KEYS.STORAGE, JSON.stringify({ version: payload.version, data: payload.data }));
        safeSetItem(KEYS.LAST_PROBE, String(now));
        return payload.data;
      }

      if (payload && payload.code === 503) {
        return local.data || [];
      }
    } catch (e) {
      return local.data || [];
    }

    return local.data || [];
  }

  // ----------------------------
  // Rendering
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
    const caseName = container.dataset.caseName || "";
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

  function observeShow(el) {
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          el.classList.add("show");
          obs.unobserve(el);
        }
      }
    }, { threshold: 0.1 });
    obs.observe(el);
  }

  // ----------------------------
  // Toggle (namespaced + backward compatible)
  // ----------------------------
  window.DAJU_toggleEstateList = function (btn, overflowId) {
    const overflowDiv = document.getElementById(overflowId);
    const btnText = btn.querySelector(".btn-text");
    if (!overflowDiv || !btnText) return;

    overflowDiv.classList.toggle("is-expanded");
    btn.classList.toggle("is-active");

    if (overflowDiv.classList.contains("is-expanded")) {
      btnText.textContent = "收起列表";
    } else {
      const count = overflowDiv.querySelectorAll(".case-list-item").length;
      btnText.textContent = `查看更多案件 (還有 ${count} 筆)`;
    }
  };
  window.toggleEstateList = window.DAJU_toggleEstateList;

  // ----------------------------
  // Init
  // ----------------------------
  async function init() {
    const widgets = document.querySelectorAll("#case-list, .case-list-widget-target");
    if (!widgets.length) return;

    injectStyles();

    // 先塞 skeleton：不讓首屏空白，也不造成 CLS
    widgets.forEach(w => {
      w.classList.add("case-list-widget-target");
      w.innerHTML = `<div class="daju-estate-skeleton">資料載入中...</div>`;
      w.classList.add("show");
    });

    const data = await unifiedDataEngine();

    if (Array.isArray(data)) {
      const idx = indexByCaseName(data);
      widgets.forEach(w => {
        renderWidget(w, idx);
        observeShow(w);
      });
    } else {
      widgets.forEach(w => (w.innerHTML = `<div class="daju-estate-skeleton">資料準備中...</div>`));
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
