/**
 * 房地產物件列表 Widget (V4.12-FIX - Ads-aligned Meta-First + Warm Compatible)
 * ----------------------------------------------------------------------------
 * ✅ 目標：跟 Ads 同款的乾淨策略（你要的 Network 形態）
 *
 * Network 形態（正常狀態只會出現這兩種）：
 *   - ?type=case_list&meta=1
 *   - ?type=case_list&v=最新版本
 *
 * ✅ 規則：
 * 1) 首次 / 清 localStorage：
 *    - 先 meta=1 拿最新版本
 *    - 再 v=latest 拉 full（✅ 可 HIT edge warm）
 *    => 不再出現 ?type=case_list（no meta / no v）
 *
 * 2) TTL 內：0 request
 * 3) TTL 到：
 *    - meta=1
 *    - 版本相同：只續命 ts（0 full）
 *    - 版本不同：v=latest full（HIT edge）
 *
 * 4) refresh 規則：
 *    - 只有你手動（網址 ?refresh 或 CONFIG.FORCE_REFRESH=true）才會走 refresh=1（BYPASS）
 *    - 正常流程（首次/TTL更新）都不使用 refresh=1（才能吃到 edge）
 *
 * ✅ BFCache：
 * - 跟 Ads 同款：pageshow 只在 ev.persisted=true 才重跑
 *
 * ✅ 保持不變：
 * - UI/CSS/Render: SAME as V4.11
 * - One-Key localStorage cache structure: { version, data, ts, metaFailAt }
 */

(function () {
  const CONFIG = {
    API_URL: "https://daju-unified-route-api.dajuteam88.workers.dev/?type=case_list",

    PROBE_INTERVAL_MS: 15 * 60 * 1000,  // 15 分鐘內 0 請求
    FETCH_TIMEOUT_MS: 8000,
    META_TIMEOUT_MS: 5000,
    META_FAIL_COOLDOWN_MS: 60 * 1000,
    MAX_VISIBLE: 3,

    // 僅做救援/除錯用（不要當正常更新）
    FORCE_REFRESH: false
  };

  // ✅ One-Key Cache
  const KEY_CACHE = "daju_case_cache"; // { version, data, ts, metaFailAt }


 // ✅ 購物車svg
  const iconCart = `
    <svg class="shopping-cart-icon" viewBox="0 0 34.17 29.29" >
      <path d="M6.17,1.57c.13.04.24.11.4.24.59.48,1.44,1.64,2.16,1.81,7.23.17,14.49.03,21.73.07,1.04.17,1.62,1.29,1.48,2.28-.85,3.48-1.59,6.99-2.43,10.48-.34,1.41-.54,3.28-2,3.88-.14.06-.38.14-.56.14s-.66,0-.66,0H9.66c-1.08-.14-1.83-.97-2.06-2.01-.53-3.84-1.03-7.69-1.57-11.53-.06-.39-.06-1.17-.22-1.49-.09-.18-.38-.36-.57-.38-.83-.12-1.9.08-2.76,0-.92-.09-1.19-1.3-1.18-1.85,0-.17.05-.47.14-.69l.01-.03c.28-.62.9-1.01,1.58-1.01h2.81c.12,0,.23.05.34.08ZM11.74,8.83c-.9.17-.96,1.34-.06,1.55h13.82c.97-.23.78-1.51-.2-1.56h-13.55ZM12.99,13.8c-.86.14-.87,1.39-.01,1.55h11.71c.94-.22.81-1.5-.15-1.56h-11.54Z"></path>
      <circle cx="10.35" cy="25.46" r="2.35"></circle>
      <circle cx="25.65" cy="25.46" r="2.35"></circle>
    </svg>
  `;
  
  // ----------------------------
  // 1. Style（原樣保留）
  // ----------------------------
  function injectStyles() {
    const STYLE_ID = "daju-case-style-v48";

    // FontAwesome (keep original behavior)
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
      /* ✅ Default hidden (no space) */
      .case-list-widget-target {
        display: none;      /* 資料載入前不佔空間 */
        width: 100%;
        margin: 40px 0;     /* 外距由這裡控制 */
        opacity: 0;
        transition: opacity 0.4s ease;
      }
      .case-list-widget-target.is-ready { display: block; }
      .case-list-widget-target.show { opacity: 1; }

      /* Widget Base (原 CSS 保留) */
      .case-list-container { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
        width: 100%; 
        background: #fff; 
        padding: 0; 
        box-sizing: border-box; 
        margin: 0;
      }
      .case-list-header { color: #eb6100; font-size: 1.6rem; font-weight: bold; margin-bottom: 15px; padding-left: 5px; letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; padding-top: 10px; }
      .case-list-header .shopping-cart-icon { width: 1.25em; height: auto; vertical-align: -0.12em; fill: currentColor; display: inline-block; } 
      .case-list-count { font-size: 14px; font-weight: normal; background: #eb6100; color: #fff; padding: 2px 8px; border-radius: 12px; }
      .case-list-ul { list-style: none; padding: 0; margin: 0; border-top: 2px solid #eb6100; }
      .case-list-item { display: flex; flex-direction: column; align-items: flex-start; padding: 15px 10px; border-bottom: 1px solid #ffe6cc; transition: background-color 0.2s; }
      .case-list-ul > .case-list-item:last-child, .case-list-overflow > .case-list-item:last-child { border-bottom: none; }
      .case-list-item:hover { background-color: #fff9f2; }
      .case-list-overflow { max-height: 0; overflow: hidden; opacity: 0; transition: max-height 0.5s ease-in-out, opacity 0.4s ease-in-out; }
      .case-list-overflow.is-expanded { max-height: 2000px; opacity: 1; }
      .case-list-link { text-decoration: none; display: flex; align-items: flex-start; width: 100%; margin-bottom: 8px; position: relative; padding-right: 25px; text-align: justify; }
      .case-list-link::after { content: "\\f35d"; font-family: "Font Awesome 5 Free"; font-weight: 900; font-size: 0.65em; color: #eb6100; opacity: 0.7; transition: opacity 0.2s; position: absolute; right: 0; flex-shrink: 0; }
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
      .case-list-message { text-align: center; color: #eb6100; padding: 20px; }

      @media (min-width: 992px) {
        .case-list-container { max-width: 1000px; }
        .case-list-item { flex-direction: row; justify-content: space-between; align-items: center; }
        .case-list-link { width: auto; margin-bottom: 0; padding-right: 0px; align-items: center; flex: 1; }
        .case-list-link::after {  position: static; margin-left: 10px;margin-top: 0; }
        .case-list-dot { margin-top: 0; }
        .case-list-price-box { width: auto; text-align: right; padding-left: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  // ----------------------------
  // 2. Utils（原樣保留 + fetchJSON 升級）
  // ----------------------------
  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }
  function safeSetCache(obj) {
    try {
      localStorage.setItem(KEY_CACHE, JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ✅ Ads 同款：先讀 text 再 parse（更穩：不吃 content-type）
  async function fetchJSON(url, { timeoutMs, cacheMode }) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        cache: cacheMode || "no-cache",
        headers: { "Accept": "application/json" }
      });

      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }

      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: null };
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
  // 2.5 URL Builder（✅ 共用路由必備：避免兩個 ?）
  // ----------------------------
  function buildApiUrl_({ meta = false, version = "", refresh = false } = {}) {
    const u = new URL(CONFIG.API_URL);

    if (meta) u.searchParams.set("meta", "1");

    // ✅ A Rule：有 version 才帶 v
    if (!meta && version && String(version).trim() !== "") {
      u.searchParams.set("v", String(version));
    }

    // ⚠️ refresh=1 只做救援/除錯（不作為正常更新）
    if (refresh) u.searchParams.set("refresh", "1");

    return u.toString();
  }

  // ----------------------------
  // ✅ 3. Unified Data Engine (One-Key)（Ads-aligned Meta-First）
  // ----------------------------
  async function unifiedDataEngine() {
    const now = Date.now();
    const cache = safeJSONParse(localStorage.getItem(KEY_CACHE) || "{}", {});
    const cachedData = Array.isArray(cache.data) ? cache.data : null;
    const cachedVersion = cache.version ? String(cache.version) : "";
    const cachedTs = parseInt(cache.ts || "0", 10) || 0;
    const metaFailAt = parseInt(cache.metaFailAt || "0", 10) || 0;

    // A) TTL 內：0 請求
    if (cachedData && (now - cachedTs < CONFIG.PROBE_INTERVAL_MS)) {
      return sanitizeData_(cachedData);
    }

    // ✅ 0) 手動強制刷新（僅 debug/救援）
    let urlParamsHasRefresh = false;
    try { urlParamsHasRefresh = new URLSearchParams(location.search).has("refresh"); } catch {}
    const forceRefresh = !!CONFIG.FORCE_REFRESH || !!urlParamsHasRefresh;

    if (forceRefresh) {
      // 先 meta 拿最新版本（一致）
      const metaUrl = buildApiUrl_({ meta: true });
      const metaRes = await fetchJSON(metaUrl, {
        timeoutMs: CONFIG.META_TIMEOUT_MS,
        cacheMode: "no-store"
      }).catch(() => null);

      const latest = metaRes && metaRes.data && metaRes.data.version ? String(metaRes.data.version) : "";

      const fullUrl = buildApiUrl_({ version: latest || cachedVersion || "", refresh: true });
      const fullRes = await fetchJSON(fullUrl, {
        timeoutMs: CONFIG.FETCH_TIMEOUT_MS,
        cacheMode: "reload"
      }).catch(() => null);

      const payload = fullRes && fullRes.data;

      if (payload && payload.code === 200 && Array.isArray(payload.data)) {
        const clean = sanitizeData_(payload.data);
        const newV = payload.version ? String(payload.version) : (latest || cachedVersion || "");
        safeSetCache({ version: newV, data: clean, ts: now, metaFailAt: 0 });
        return clean;
      }

      // 失敗：回舊資料（穩）
      if (cachedData) {
        safeSetCache({ version: cachedVersion, data: cachedData, ts: now, metaFailAt: 0 });
        return sanitizeData_(cachedData);
      }
      return [];
    }

    // B) cold（首次/清 localStorage）：✅ meta-first（不走 no-v）
    const isCold = (!cachedData || !cachedVersion);

    if (isCold) {
      const metaUrl = buildApiUrl_({ meta: true });
      const metaRes = await fetchJSON(metaUrl, {
        timeoutMs: CONFIG.META_TIMEOUT_MS,
        cacheMode: "no-store"
      }).catch(() => null);

      const metaVersion = metaRes && metaRes.data && metaRes.data.version ? String(metaRes.data.version) : "";

      if (metaVersion) {
        const vFullUrl = buildApiUrl_({ version: metaVersion });

        // ✅ Ads 同款：v-full 用 cache:"default"（更好吃 edge warm / HIT）
        const vFullRes = await fetchJSON(vFullUrl, {
          timeoutMs: CONFIG.FETCH_TIMEOUT_MS,
          cacheMode: "default"
        }).catch(() => null);

        const payload = vFullRes && vFullRes.data;
        if (payload && payload.code === 200 && Array.isArray(payload.data)) {
          const clean = sanitizeData_(payload.data);
          safeSetCache({ version: metaVersion, data: clean, ts: now, metaFailAt: 0 });
          return clean;
        }
      }

      // cold 但 meta 拿不到：維持乾淨策略（不打 no-v）
      // 有舊就回舊，沒有就空
      if (cachedData) {
        safeSetCache({ version: cachedVersion, data: cachedData, ts: now, metaFailAt: now });
        return sanitizeData_(cachedData);
      }
      return [];
    }

    // C) TTL 到：meta probe（含 cooldown）
    let metaVersion = "";
    const canMeta = (!metaFailAt || (now - metaFailAt > CONFIG.META_FAIL_COOLDOWN_MS));

    if (canMeta) {
      const metaUrl = buildApiUrl_({ meta: true });
      const metaRes = await fetchJSON(metaUrl, {
        timeoutMs: CONFIG.META_TIMEOUT_MS,
        cacheMode: "no-store"
      }).catch(() => null);

      metaVersion = metaRes && metaRes.data && metaRes.data.version ? String(metaRes.data.version) : "";

      // meta 失敗：記錄 failAt，避免一直打
      if (!metaVersion) {
        safeSetCache({
          version: cachedVersion || "",
          data: cachedData || [],
          ts: cachedTs || 0,
          metaFailAt: now
        });
      }

      // ✅ 版本相同：只續命（0 full）
      if (metaVersion && metaVersion === cachedVersion && cachedData) {
        safeSetCache({ version: cachedVersion, data: cachedData, ts: now, metaFailAt: 0 });
        return sanitizeData_(cachedData);
      }

      // ✅ 版本不同：v-full（HIT edge）
      if (metaVersion && metaVersion !== cachedVersion) {
        const vFullUrl = buildApiUrl_({ version: metaVersion });

        // ✅ Ads 同款：v-full 用 cache:"default"
        const vFullRes = await fetchJSON(vFullUrl, {
          timeoutMs: CONFIG.FETCH_TIMEOUT_MS,
          cacheMode: "default"
        }).catch(() => null);

        const payload = vFullRes && vFullRes.data;

        if (payload && payload.code === 200 && Array.isArray(payload.data)) {
          const clean = sanitizeData_(payload.data);
          safeSetCache({ version: metaVersion, data: clean, ts: now, metaFailAt: 0 });
          return clean;
        }

        // 失敗：回舊（穩）+ 續命
        safeSetCache({ version: cachedVersion, data: cachedData, ts: now, metaFailAt: 0 });
        return sanitizeData_(cachedData);
      }
    }

    // D) meta 拿不到（冷卻/失敗）：保守用「舊版 v-full」拉一次（維持 edge 命中率）
    if (cachedVersion) {
      const url = buildApiUrl_({ version: cachedVersion });
      const res = await fetchJSON(url, {
        timeoutMs: CONFIG.FETCH_TIMEOUT_MS,
        cacheMode: "default"
      }).catch(() => null);

      const payload = res && res.data;

      if (payload && payload.code === 200 && Array.isArray(payload.data)) {
        const clean = sanitizeData_(payload.data);
        const newV = payload.version ? String(payload.version) : cachedVersion;
        safeSetCache({ version: newV, data: clean, ts: now, metaFailAt: 0 });
        return clean;
      }
    }

    // 最後 fallback：續命舊資料
    safeSetCache({ version: cachedVersion, data: cachedData, ts: now, metaFailAt: 0 });
    return sanitizeData_(cachedData);
  }

  // ----------------------------
  // 4. Rendering（原樣保留）
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
    const caseName = (container.dataset.caseName || "").trim();
    let items = (dataIndex instanceof Map) ? (dataIndex.get(caseName) || []) : [];

    if (!items.length) {
      container.innerHTML = '<div class="case-list-container"><div class="case-list-message">- 精選物件上架中 -</div></div>';
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
          <span>${iconCart} 最新上架物件</span>
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
  // 5. Global Toggle（原樣保留）
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
  // 6. Init（原樣保留）
  // ----------------------------
  function setupViewportReveal(widgets) {
    if (!("IntersectionObserver" in window)) {
      widgets.forEach(w => w.classList.add("show"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(ent => {
        if (ent.isIntersecting) {
          ent.target.classList.add("show");
          io.unobserve(ent.target);
        }
      });
    }, { root: null, threshold: 0.15 });

    widgets.forEach(w => io.observe(w));
  }

  async function init() {
    const widgets = document.querySelectorAll("#case-list, .case-list-widget-target");
    if (!widgets.length) return;

    injectStyles();

    widgets.forEach(w => {
      w.classList.add("case-list-widget-target");
      w.classList.remove("is-ready", "show");
      w.innerHTML = "";
    });

    const data = await unifiedDataEngine();
    const idx = indexByCaseName(Array.isArray(data) ? data : []);

    widgets.forEach(w => {
      renderWidget(w, idx);
      w.classList.add("is-ready");
    });

    setupViewportReveal(Array.from(widgets));
  }

  // DOM ready
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // ✅ BFCache / pageshow：跟 Ads 同款（避免初次載入跑兩次）
  window.addEventListener("pageshow", function (ev) {
    if (ev && ev.persisted) {
      try { init(); } catch (e) {}
    }
  });
})();
