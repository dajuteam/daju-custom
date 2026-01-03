(function () {
  // =========================================================
  // DAJU Real Price Widget (Single-Key Cache + Meta Version Probe)
  // - localStorage 只用 1 個 key：daju_real_price_cache
  // - 快取過期：15*60 秒
  // - 過期時：先打 meta=1 取 version
  //   - version 沒變：續命（不打 full）
  //   - version 有變：打 full?v=xxxx 更新
  // - 容器：所有 [data-real-price]，案名在 data-case-name
  // =========================================================

  const CONFIG = {
    // ✅ 走 Worker 統一路由
    GAS_API_URL: "https://daju-unified-route-api.dajuteam88.workers.dev/?type=real_price",

    // ✅ 只用這一個 key（你指定的命名）
    STORAGE_KEY: "daju_real_price_cache",

    // ✅ 15 分鐘（秒）
    EXPIRE_SECONDS: 15 * 60,

    // ✅ request timeout（避免卡住）
    META_TIMEOUT_MS: 3000,
    FULL_TIMEOUT_MS: 5000,

    // ✅ 避免 meta 風暴：就算過期，也不要每次都打 meta
    META_COOLDOWN_MS: 60 * 1000,

    // ✅ CSS 防重複 id
    STYLE_ID: "real-price-style-v4-singlekey",
  };

  // ---------------------------
  // 0) 小工具：timeout fetch
  // ---------------------------
  async function fetchWithTimeout_(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal, credentials: "omit" });
      return res;
    } finally {
      clearTimeout(t);
    }
  }

  // ---------------------------
  // 1) localStorage：只存一把
  // payload 格式：
  // {
  //   ts: number,          // 上次寫入時間（ms）
  //   ver: string,         // 上次 meta 的 version（可空）
  //   data: object|null,   // 案名->url
  //   metaTs: number       // 上次打 meta 的時間（ms）
  // }
  // ---------------------------
  function readCache_() {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch (e) {
      // 快取壞了就清掉，避免一直炸
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      return null;
    }
  }

  function writeCache_(payload) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      // localStorage 滿了等狀況，不要讓整個 widget 掛掉
      console.warn("[real_price] localStorage write failed:", e);
    }
  }

  function isFresh_(cache, nowMs) {
    if (!cache || !cache.ts) return false;
    const ageSec = (nowMs - cache.ts) / 1000;
    return ageSec < CONFIG.EXPIRE_SECONDS;
  }

  // ---------------------------
  // 2) 向 Worker 打 meta=1 拿 version
  // ---------------------------
  async function fetchMetaVersion_() {
    const url = CONFIG.GAS_API_URL + "&meta=1";
    const res = await fetchWithTimeout_(url, CONFIG.META_TIMEOUT_MS);
    if (!res.ok) throw new Error("META_HTTP_" + res.status);

    const json = await res.json();
    // 兼容 {code:200, version:"..."} 或其他格式
    const ver = (json && json.version != null) ? String(json.version) : "";
    return ver;
  }

  // ---------------------------
  // 3) 向 Worker 打 full（帶 v）
  // ---------------------------
  async function fetchFullData_(version) {
    const url = version
      ? (CONFIG.GAS_API_URL + "&v=" + encodeURIComponent(version))
      : CONFIG.GAS_API_URL;

    const res = await fetchWithTimeout_(url, CONFIG.FULL_TIMEOUT_MS);
    if (!res.ok) throw new Error("FULL_HTTP_" + res.status);

    const json = await res.json();

    // 兼容兩種：
    // A) {code:200, version:"...", data:{...}}
    // B) 直接就是 {...}
    if (json && typeof json === "object" && "data" in json && json.data && typeof json.data === "object") {
      return json.data;
    }
    return json;
  }

  // ---------------------------
  // 4) 核心：取得 allData（案名->url）
  // ---------------------------
  async function getAllData_() {
    const now = Date.now();
    const cache = readCache_();

    // (A) 快取新鮮：直接用
    if (isFresh_(cache, now) && cache.data) {
      return cache.data;
    }

    // (B) 快取過期：先做 meta 探針（但要 cooldown）
    const lastMetaTs = cache && cache.metaTs ? Number(cache.metaTs) : 0;
    const canHitMeta = (now - lastMetaTs) > CONFIG.META_COOLDOWN_MS;

    // 如果 cooldown 未到：先用舊資料（就算過期）
    if (!canHitMeta) {
      if (cache && cache.data) return cache.data;
      // 沒舊資料就只好直接 full（保底）
      const data = await fetchFullData_("");
      writeCache_({ ts: now, ver: "", data, metaTs: lastMetaTs || 0 });
      return data;
    }

    // (C) 允許打 meta：拿最新版本
    let latestVer = "";
    try {
      latestVer = await fetchMetaVersion_();
    } catch (e) {
      // meta 探針失敗：有舊資料就先用舊的，沒有才 full 保底
      if (cache && cache.data) {
        writeCache_({ ts: now, ver: cache.ver || "", data: cache.data, metaTs: now });
        return cache.data;
      }
      const data = await fetchFullData_("");
      writeCache_({ ts: now, ver: "", data, metaTs: now });
      return data;
    }

    // (D) 版本沒變：續命（不打 full）
    const oldVer = cache && cache.ver ? String(cache.ver) : "";
    if (latestVer && oldVer && latestVer === oldVer && cache && cache.data) {
      writeCache_({ ts: now, ver: oldVer, data: cache.data, metaTs: now });
      return cache.data;
    }

    // (E) 版本變了（或沒舊 ver）：打 full?v=latest 更新
    try {
      const data = await fetchFullData_(latestVer);
      writeCache_({ ts: now, ver: latestVer || "", data, metaTs: now });
      return data;
    } catch (e) {
      // full 失敗：有舊資料就回舊的
      if (cache && cache.data) {
        writeCache_({ ts: now, ver: oldVer, data: cache.data, metaTs: now });
        return cache.data;
      }
      return null;
    }
  }

  // ---------------------------
  // 5) CSS 注入（防重複）
  // ---------------------------
  function injectStyles_() {
    if (document.getElementById(CONFIG.STYLE_ID)) return;

    const css = `
      .real-price-section {
        max-width: 100%;
        margin: 20px auto;
        border-radius: 12px;
        border: 2px dotted #ffda56;
        background: linear-gradient(to right, #fffaf0, #fff);
        box-sizing: border-box;
        font-family: sans-serif;
      }
      .real-price-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
        gap: 20px;
      }
      .real-price-left {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      img.real-price-icon {
        width: 50px !important;
        height: auto;
        margin-right: 10px;
        margin-bottom: 10px;
        display: block;
      }
      .real-price-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .real-price-title {
        font-size: 1.4rem;
        font-weight: bold;
        margin: 0;
        letter-spacing: 1px;
        color: #333;
        line-height: 1.4;
      }
      .real-price-subtext {
        font-size: 0.85rem;
        color: gray;
      }
      .real-price-button {
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #ffc107;
        color: black;
        font-size: 1.1rem;
        padding: 12px 20px;
        border-radius: 10px;
        text-decoration: none;
        transition: background-color 0.3s ease, transform 0.2s;
        gap: 10px;
        white-space: nowrap;
        font-weight: 500;
        cursor: pointer;
      }
      .real-price-button:hover {
        background-color: #ffb326;
        color: black;
        transform: translateY(-1px);
      }
      .real-price-button.disabled {
        background-color: #e0e0e0 !important;
        color: #999 !important;
        cursor: default;
        pointer-events: none;
        transform: none !important;
        box-shadow: none !important;
      }
      @media screen and (min-width: 992px) {
        .real-price-body {
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          padding: 20px 30px;
        }
        .real-price-left {
          flex-direction: row;
          align-items: center;
          text-align: left;
        }
        img.real-price-icon {
          margin-bottom: 0;
          margin-right: 15px;
          width: 50px;
        }
        .real-price-text {
          align-items: flex-start;
          text-align: left;
        }
        .real-price-title {
          font-size: 1.5rem;
        }
        .real-price-button {
          font-size: 1.3rem;
          padding: 15px 25px;
        }
      }
    `;

    const style = document.createElement("style");
    style.id = CONFIG.STYLE_ID;
    style.innerText = css;
    document.head.appendChild(style);
  }

  // ---------------------------
  // 6) 渲染
  // ---------------------------
  function renderInto_(container, url) {
    if (!container) return;

    const hasUrl = !!url;
    const titleText = hasUrl ? "查看本案最新實價登錄" : "查看本案最新實價登錄(更新中)";
    const btnClass = hasUrl ? "real-price-button" : "real-price-button disabled";
    const btnHref = hasUrl ? `href="${url}" target="_blank"` : 'href="javascript:void(0)"';
    const btnIcon = hasUrl
      ? '<i class="fas fa-external-link-alt" aria-hidden="true"></i>'
      : '<i class="fas fa-tools" aria-hidden="true"></i>';

    container.innerHTML = `
      <div class="real-price-section">
        <div class="real-price-body">
          <div class="real-price-left">
            <img alt="實價登錄圖示" class="real-price-icon"
              src="https://www.dajuteam.com.tw/upload/web/images/assets/real-price-pic.png"
              onerror="this.style.display='none'"/>
            <div class="real-price-text">
              <h5 class="real-price-title">${titleText}</h5>
              <p class="real-price-subtext">您將前往樂居網站，本資料由樂居網站提供。</p>
            </div>
          </div>
          <a class="${btnClass}" ${btnHref} rel="noopener noreferrer" aria-label="前往樂居網站">
            ${btnIcon}
            前往樂居網站
          </a>
        </div>
      </div>
    `;
  }

  // ---------------------------
  // 7) Init：抓所有 data-real-price
  // ---------------------------
  async function init_() {
    const containers = document.querySelectorAll("[data-real-price]");
    if (!containers.length) return;

    injectStyles_();

    const allData = await getAllData_(); // 可能是 null
    containers.forEach((container) => {
      const caseName = (container.dataset.caseName || "").trim();
      if (!caseName) {
        console.warn("[real_price] missing data-case-name", container);
        renderInto_(container, null);
        return;
      }
      const url = allData && allData[caseName] ? allData[caseName] : null;
      renderInto_(container, url);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init_);
  } else {
    init_();
  }
})();
