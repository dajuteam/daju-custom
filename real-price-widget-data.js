/**
 * =========================================================
 * DAJU Real Price Widget (Multi Containers + Local Cache + Meta Probe + Cooldown) - v4.1
 * ---------------------------------------------------------
 * ✅ 你指定的容器抓法：抓取所有 [data-real-price]，並用 data-case-name 對應網址
 *
 * 目的：
 * 1) 先用 localStorage 快取（EXPIRE_SECONDS）加速
 * 2) 本地快取過期時「才」打 meta 探針，比對版本號
 *    - version 沒變：續命本地快取（不打 full）
 *    - version 有變：打 full 更新資料
 * 3) META_COOLDOWN_MS：避免 meta 風暴（一直切頁/重整）
 *
 * 重要：
 * - 你的 GAS 需支援：
 *   - ?meta=1 -> { code:200, version:"xxx", ... }
 *   - full     -> { code:200, version:"xxx", data:{ "案名":"url", ... } }
 *   (若你的 real_price 目前 full 直接回 map，程式也有做相容)
 * =========================================================
 */

(function () {
  // =========================
  // 0) 設定區（你給的 GAS + 改成秒數）
  // =========================
  const CONFIG = {
     // 走 Worker 統一路由：type=real_price
    GAS_API_URL: "https://daju-unified-route-api.dajuteam88.workers.dev/?type=real_price",

    // localStorage key（改版號避免舊快取污染）
    STORAGE_KEY: "real_price_local_v4_1",

    // ✅ 本地快取有效秒數（15 分鐘）
    EXPIRE_SECONDS: 15 * 60,

    // ✅ 只在本地快取過期時才會打 meta
    META_TIMEOUT_MS: 3000,
    FULL_TIMEOUT_MS: 5000,

    // ✅ 避免 meta 風暴：過期後也不要每次都打 meta
    META_COOLDOWN_MS: 60 * 1000,

    // icon
    ICON_URL: "https://www.dajuteam.com.tw/upload/web/images/assets/real-price-pic.png"
  };

  // =========================
  // 1) CSS 注入（加防重複）
  // =========================
  const injectStyles = () => {
    if (document.getElementById("real-price-style-v4-1")) return;

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
    styleSheet.id = "real-price-style-v4-1";
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);
  };

  // =========================
  // 2) timeout fetch（避免卡死）
  // =========================
  const fetchWithTimeout = async (url, timeoutMs) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  // =========================
  // 3) localStorage 讀寫
  // payload:
  // {
  //   ts: number,         // 本地資料寫入時間（用來算 EXPIRE_SECONDS）
  //   metaTs: number,     // 上次打 meta 的時間（用來算 META_COOLDOWN_MS）
  //   version: string,    // meta 版本號
  //   data: object        // { case_name: url, ... }
  // }
  // =========================
  const readLocalCache = () => {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn("快取格式錯誤，刪除重抓");
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      return null;
    }
  };

  const writeLocalCache = (payload) => {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("localStorage 寫入失敗:", e);
    }
  };

  // =========================
  // 4) meta 探針：只拿版本（?meta=1）
  // 期待：
  // { code:200, version:"xxx" }
  // =========================
  const fetchMetaVersion = async () => {
    const metaUrl = CONFIG.GAS_API_URL + (CONFIG.GAS_API_URL.includes("?") ? "&" : "?") + "meta=1";
    const res = await fetchWithTimeout(metaUrl, CONFIG.META_TIMEOUT_MS);
    if (!res.ok) throw new Error("META HTTP " + res.status);
    const j = await res.json();
    if (!j || j.code !== 200 || !j.version) throw new Error("META BAD PAYLOAD");
    return String(j.version);
  };

  // =========================
  // 5) full：拿完整資料（不帶 meta）
  // 期待（白皮書版）：
  // { code:200, version:"xxx", data:{...} }
  // 相容（舊版）：
  // 直接回 map {...}
  // =========================
  const fetchFullData = async () => {
    const res = await fetchWithTimeout(CONFIG.GAS_API_URL, CONFIG.FULL_TIMEOUT_MS);
    if (!res.ok) throw new Error("FULL HTTP " + res.status);
    const j = await res.json();

    // 白皮書版
    if (j && j.code === 200 && j.data && typeof j.data === "object") {
      return { version: String(j.version || ""), data: j.data };
    }

    // 舊版：直接回 map（沒有 code/data）
    if (j && typeof j === "object" && !("code" in j)) {
      return { version: "", data: j };
    }

    throw new Error("FULL BAD PAYLOAD");
  };

  // =========================
  // 6) 取資料流程（本地快取 -> meta gating -> full）
  // =========================
  const getData = async () => {
    const now = Date.now();
    const cache = readLocalCache();

    // (A) 本地快取有效：直接用（0 API）
    if (cache && cache.ts && cache.data && (now - cache.ts < CONFIG.EXPIRE_SECONDS * 1000)) {
      return cache.data;
    }

    // (B) 本地過期：優先 meta gating（但要 cooldown）
    const canHitMeta = !cache || !cache.metaTs || (now - cache.metaTs > CONFIG.META_COOLDOWN_MS);

    let metaVersion = "";
    if (canHitMeta) {
      try {
        metaVersion = await fetchMetaVersion();
      } catch (e) {
        console.warn("META failed:", e);

        // meta 失敗：有舊資料就先用（就算過期也撐）
        if (cache && cache.data) return cache.data;

        // 沒舊資料：只能繼續試 full
        metaVersion = "";
      }
    } else {
      // cooldown 內：不要一直打 meta，有舊資料就用
      if (cache && cache.data) return cache.data;
    }

    // (C) meta OK 且版本相同：續命（不打 full）
    if (cache && cache.data && metaVersion && cache.version && metaVersion === cache.version) {
      writeLocalCache({
        ts: now,        // ✅ 續命
        metaTs: now,
        version: cache.version,
        data: cache.data
      });
      return cache.data;
    }

    // (D) 版本不同 or 不能比：打 full 更新
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
  // 7) 渲染：塞進指定 container（你指定的 renderInto）
  // =========================
  const renderInto = (container, url) => {
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
  };

  // =========================
  // 8) 主程式：抓取所有 [data-real-price]
  // =========================
  const init = async () => {
    const containers = document.querySelectorAll("[data-real-price]");
    if (!containers.length) return;

    injectStyles();
    const allData = await getData();

    containers.forEach((container) => {
      const caseName = (container.dataset.caseName || "").trim();

      if (!caseName) {
        console.warn("實價登錄區塊未設定 data-case-name", container);
        renderInto(container, null);
        return;
      }

      const targetUrl = (allData && allData[caseName]) ? allData[caseName] : null;
      renderInto(container, targetUrl);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
