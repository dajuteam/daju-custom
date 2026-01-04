/**
 * =========================================================
 * DAJU Real Price Widget (Local Cache + Meta Probe + Cooldown) - v4.0
 * ---------------------------------------------------------
 * 目的：
 * 1) 先用 localStorage 快取加速（EXPIRE_SECONDS）
 * 2) 本地快取過期時「才」打 meta 探針，比對版本號
 *    - version 沒變：續命本地快取（不打 full）
 *    - version 有變：打 full 更新資料
 * 3) META_COOLDOWN_MS：避免 meta 風暴（使用者一直切頁/重整）
 * 4) 全部走你的 Cloudflare Worker 統一路由
 * ---------------------------------------------------------
 * 依賴：
 * - HTML 容器需存在：<div id="real-price-container" data-case-name="..."></div>
 * - FontAwesome（可選，用於 icon）
 * =========================================================
 */

(function () {
  // =========================
  // 0) 設定區
  // =========================
  const CONFIG = {
    // 走 Worker 統一路由：type=real_price
    GAS_API_URL: "https://daju-unified-route-api.dajuteam88.workers.dev/?type=real_price",

    // 容器
    CONTAINER_ID: "real-price-container",

    // localStorage key（改版號避免舊快取污染）
    STORAGE_KEY: "real_price_local_v4",

    // ✅ 本地快取有效秒數（15 分鐘）
    EXPIRE_SECONDS: 15 * 60,

    // ✅ 只在本地快取過期時才會打 meta
    META_TIMEOUT_MS: 3000,
    FULL_TIMEOUT_MS: 5000,

    // ✅ 避免 meta 風暴：過期後也不要每次都打 meta
    META_COOLDOWN_MS: 60 * 1000,

    // ✅ 你目前的 UI icon 圖
    ICON_URL: "https://www.dajuteam.com.tw/upload/web/images/assets/real-price-pic.png"
  };

  // =========================
  // 1) 小工具：timeout fetch
  // =========================
  const fetchWithTimeout = async (url, timeoutMs) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      return res;
    } finally {
      clearTimeout(t);
    }
  };

  // =========================
  // 2) CSS 注入
  // =========================
  const injectStyles = () => {
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
    const styleSheet = document.createElement("style");
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);
  };

  // =========================
  // 3) localStorage 讀寫
  // payload 結構：
  // {
  //   ts: number,          // 本地寫入時間
  //   metaTs: number,      // 上次打 meta 的時間
  //   version: string,     // meta 版本號（可空）
  //   data: object         // case_name -> url 的 map
  // }
  // =========================
  const readLocalCache = () => {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      return null;
    }
  };

  const writeLocalCache = (payload) => {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      // localStorage 滿了也別炸
      console.warn("localStorage write failed:", e);
    }
  };

  // =========================
  // 4) meta 探針（只拿版本）
  // 走 Worker：?meta=1
  // 期待回：
  // { code:200, version:"xxx", ... }
  // =========================
  const fetchMetaVersion = async () => {
    const metaUrl = CONFIG.GAS_API_URL + "&meta=1";
    const res = await fetchWithTimeout(metaUrl, CONFIG.META_TIMEOUT_MS);
    if (!res.ok) throw new Error("META HTTP " + res.status);
    const j = await res.json();
    if (!j || j.code !== 200 || !j.version) throw new Error("META BAD PAYLOAD");
    return String(j.version);
  };

  // =========================
  // 5) full 取資料（拿完整 map）
  // 走 Worker：full 永遠回 200 + data
  // 期待回：
  // { code:200, version:"xxx", data:{...} }
  // =========================
  const fetchFullData = async () => {
    const res = await fetchWithTimeout(CONFIG.GAS_API_URL, CONFIG.FULL_TIMEOUT_MS);
    if (!res.ok) throw new Error("FULL HTTP " + res.status);
    const j = await res.json();
    // 兼容：若你這支 real_price 直接回 object 而不是 {data:...}
    if (j && j.code === 200 && j.data && typeof j.data === "object") return { version: String(j.version || ""), data: j.data };
    if (j && typeof j === "object" && !("code" in j)) return { version: "", data: j }; // 舊版直接回 map
    throw new Error("FULL BAD PAYLOAD");
  };

  // =========================
  // 6) 主要取資料流程（白皮書版）
  // =========================
  const getData = async () => {
    const now = Date.now();
    const cache = readLocalCache();

    // (A) 有本地快取且未過期 -> 直接用（0 API）
    if (cache && cache.ts && cache.data && (now - cache.ts < CONFIG.EXPIRE_SECONDS * 1000)) {
      return cache.data;
    }

    // (B) 本地過期 -> 先做 meta gating（避免直接 full）
    // 但要有 cooldown，避免 meta 風暴
    const canHitMeta =
      !cache ||
      !cache.metaTs ||
      (now - cache.metaTs > CONFIG.META_COOLDOWN_MS);

    let metaVersion = "";
    if (canHitMeta) {
      try {
        metaVersion = await fetchMetaVersion();
      } catch (e) {
        // meta 探針失敗：先用舊資料撐住（有就用），並且讓下次仍有機會再試
        console.warn("META failed:", e);
        if (cache && cache.data) return cache.data;
        // 沒舊資料就只能走 full 嘗試
        metaVersion = "";
      }
    } else {
      // cooldown 內：不打 meta，直接用舊資料（有就用）
      if (cache && cache.data) return cache.data;
    }

    // (C) meta 成功：若版本沒變 -> 續命本地快取，不打 full
    if (cache && cache.data && metaVersion && cache.version && metaVersion === cache.version) {
      writeLocalCache({
        ts: now,                // ✅ 續命
        metaTs: now,
        version: cache.version,
        data: cache.data
      });
      return cache.data;
    }

    // (D) 版本變了 or 沒版本可比 -> 打 full 更新
    try {
      const full = await fetchFullData();
      writeLocalCache({
        ts: now,
        metaTs: now,
        version: metaVersion || full.version || "",
        data: full.data
      });
      return full.data;
    } catch (e) {
      console.error("FULL failed:", e);
      // full 失敗：有舊資料就先用
      if (cache && cache.data) return cache.data;
      return null;
    }
  };

  // =========================
  // 7) render（跟你原本一樣：無網址就 disabled）
  // =========================
  const render = (url) => {
    const container = document.getElementById(CONFIG.CONTAINER_ID);
    if (!container) return;

    const hasUrl = !!url;
    const titleText = hasUrl ? "查看本案最新實價登錄" : "查看本案最新實價登錄（更新中）";
    const btnClass = hasUrl ? "real-price-button" : "real-price-button disabled";
    const btnHref = hasUrl ? `href="${url}" target="_blank"` : 'href="javascript:void(0)"';
    const btnIcon = hasUrl
      ? '<i class="fas fa-external-link-alt" aria-hidden="true"></i>'
      : '<i class="fas fa-tools" aria-hidden="true"></i>';

    const html = `
      <div class="real-price-section">
        <div class="real-price-body">
          <div class="real-price-left">
            <img alt="實價登錄圖示" class="real-price-icon"
              src="${CONFIG.ICON_URL}"
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
    container.innerHTML = html;
  };

  // =========================
  // 8) init
  // =========================
  const init = async () => {
    const container = document.getElementById(CONFIG.CONTAINER_ID);
    if (!container) return;

    const caseName = container.dataset.caseName;
    if (!caseName) {
      console.warn("實價登錄區塊未設定 data-case-name");
      return;
    }

    injectStyles();

    const allData = await getData();

    // allData: { "案名": "url", ... }
    const key = caseName.trim();
    const targetUrl = (allData && allData[key]) ? allData[key] : null;

    render(targetUrl);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
