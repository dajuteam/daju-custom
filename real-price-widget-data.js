(function () {
  // =========================================
  // 實價登錄 Real Price Widget (Worker+Version Mode)
  // - 只有「本地快取過期」才打 meta 探針
  // - meta 版本相同：續命、不打 full（避免 full 風暴）
  // - meta 版本不同：full 一律用 v=version（讓 edge cache key 穩定，可拉長 TTL）
  // =========================================

  const CONFIG = {
    // ✅ 走 Worker 統一路由：type=real_price
    GAS_API_URL: "https://daju-unified-route-api.dajuteam88.workers.dev/?type=real_price",

    // localStorage key（建議改版號避免跟舊資料混）
    STORAGE_KEY: "real_price_local_v4",

    // ✅ 用「秒」設定本地快取有效期：15 分鐘 = 900 秒
    EXPIRE_SECONDS: 900,

    // ✅ 只在本地快取過期時才會打 meta
    META_TIMEOUT_MS: 3000,
    FULL_TIMEOUT_MS: 5000,

    // ✅ 避免 meta 風暴：就算本地過期，也至少隔一段時間才允許再打一次 meta
    META_COOLDOWN_MS: 60 * 1000,

    // meta cooldown key
    META_COOLDOWN_KEY: "real_price_meta_cd_v1",
  };

  // === 1) CSS 注入（防重複）===
  const injectStyles = () => {
    if (document.getElementById("real-price-style-v4")) return;

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
    styleSheet.id = "real-price-style-v4";
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);
  };

  // === 2) 小工具：timeout fetch ===
  const fetchWithTimeout = async (url, timeoutMs) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return res;
    } finally {
      clearTimeout(t);
    }
  };

  // === 3) 快取結構 ===
  // payload = { timestamp, version, data }
  const readLocalCache = () => {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch {
      return null;
    }
  };

  const writeLocalCache = (payload) => {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  };

  const isLocalValid = (cache) => {
    if (!cache || !cache.timestamp || !cache.data) return false;
    const ageMs = Date.now() - Number(cache.timestamp);
    return ageMs >= 0 && ageMs < CONFIG.EXPIRE_SECONDS * 1000;
  };

  // === 4) meta cooldown（避免一直打 meta）===
  const metaCooldownOk = () => {
    const raw = localStorage.getItem(CONFIG.META_COOLDOWN_KEY);
    const last = raw ? Number(raw) : 0;
    const now = Date.now();
    return (now - last) >= CONFIG.META_COOLDOWN_MS;
  };

  const touchMetaCooldown = () => {
    try { localStorage.setItem(CONFIG.META_COOLDOWN_KEY, String(Date.now())); } catch {}
  };

  // === 5) 讀 meta version ===
  const fetchMetaVersion = async () => {
    const url = CONFIG.GAS_API_URL + "&meta=1";
    const res = await fetchWithTimeout(url, CONFIG.META_TIMEOUT_MS);
    if (!res.ok) throw new Error("META_HTTP_" + res.status);
    const json = await res.json();

    // 兼容你的白皮書格式：{code:200, version:"..."}
    if (json && String(json.code) === "200" && json.version) return String(json.version);

    // 如果你的 meta 不是白皮書格式，至少要有 version
    if (json && json.version) return String(json.version);

    throw new Error("META_NO_VERSION");
  };

  // === 6) 讀 full（必帶 v=version）===
  const fetchFullData = async (version) => {
    const url = CONFIG.GAS_API_URL + "&v=" + encodeURIComponent(String(version));
    const res = await fetchWithTimeout(url, CONFIG.FULL_TIMEOUT_MS);
    if (!res.ok) throw new Error("FULL_HTTP_" + res.status);
    const json = await res.json();

    // 兼容白皮書：{code:200, data: {...}}
    if (json && String(json.code) === "200" && json.data) return json.data;

    // 兼容舊格式：直接回 object
    return json;
  };

  // === 7) 核心：拿到 allData（caseName=>url map）===
  const getAllData = async () => {
    const cache = readLocalCache();

    // (A) 本地快取有效：直接用
    if (isLocalValid(cache)) return cache.data;

    // (B) 本地過期：先走 meta（但要有 cooldown）
    if (!metaCooldownOk()) {
      // cooldown 期間：不要打 meta，不要打 full
      // 直接用舊資料（就算過期也先頂著）
      if (cache && cache.data) return cache.data;
      // 沒舊資料就只能走 full 了（避免完全空）
      // 但這是極端狀況：第一次載入且 cooldown key 被寫死
    } else {
      touchMetaCooldown();
      try {
        const latest = await fetchMetaVersion();

        // cache 有版本且相同：續命（不打 full）
        if (cache && cache.version && String(cache.version) === String(latest) && cache.data) {
          writeLocalCache({ timestamp: Date.now(), version: latest, data: cache.data });
          return cache.data;
        }

        // 版本不同或沒有 cache：打 full?v=latest
        const data = await fetchFullData(latest);
        writeLocalCache({ timestamp: Date.now(), version: latest, data });
        return data;
      } catch (e) {
        // meta 失敗：退回舊資料（就算過期也用）
        if (cache && cache.data) return cache.data;
      }
    }

    // (C) 最後保底：直接打一個 full（不帶 v）避免完全空（很少走到這）
    try {
      const res = await fetchWithTimeout(CONFIG.GAS_API_URL, CONFIG.FULL_TIMEOUT_MS);
      if (!res.ok) throw new Error("FULL_HTTP_" + res.status);
      const json = await res.json();
      const data = (json && String(json.code) === "200" && json.data) ? json.data : json;
      writeLocalCache({ timestamp: Date.now(), version: cache && cache.version ? cache.version : "", data });
      return data;
    } catch {
      return (cache && cache.data) ? cache.data : null;
    }
  };

  // === 8) 渲染 ===
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
  };

  // === 9) 主程式：抓取所有 data-real-price ===
  const init = async () => {
    const containers = document.querySelectorAll("[data-real-price]");
    if (!containers.length) return;

    injectStyles();

    const allData = await getAllData();

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
