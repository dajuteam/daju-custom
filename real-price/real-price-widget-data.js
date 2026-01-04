/**
 * =========================================================
 * DAJU Real Price Widget (Ads-aligned / MetaTs ONLY) - v4.2.2
 * ---------------------------------------------------------
 * ✅ 容器抓法：抓取所有 [data-real-price]，並用 data-case-name 對應網址
 *
 * 流程（對齊 Ads 方案一）：
 * 1) TTL 內：0 request（直接用 localStorage）
 * 2) TTL 到：
 *    - meta=1 探針拿 version（受 metaTs cooldown 控制）
 *    - cooldown 內：0 request，直接用舊資料並續命 ts（Ads 同款）
 *    - meta 失敗：有舊資料就用，並更新 metaTs + 續命 ts（Ads 同款）
 *    - version 沒變：續命（不打 full）
 *    - version 有變：full?v=version 更新
 *
 * Cache payload（One-Key）:
 * { ts, metaTs, version, data }
 *
 * 重要：Worker/GAS 需支援：
 * - ?meta=1 -> { code:200, version:"xxx" }
 * - full?v=xxx -> { code:200, version:"xxx", data:{ "案名":"url" } }
 *   (若 full 直接回 map，程式也相容)
 * =========================================================
 */

(function () {
  // =========================
  // 0) 設定區
  // =========================
  const CONFIG = {
    GAS_API_URL: "https://daju-unified-route-api.dajuteam88.workers.dev/?type=real_price",
    STORAGE_KEY: "daju_real_price_cache",

    // ✅ 先用 15 分鐘測試（穩定後你再自行拉長）
    EXPIRE_SECONDS: 15 * 60,

    // ✅ timeout
    META_TIMEOUT_MS: 3000,
    FULL_TIMEOUT_MS: 5000,

    // ✅ 避免 meta 風暴（Ads 同款：只有 metaTs）
    META_COOLDOWN_MS: 60 * 1000,

    ICON_URL: "https://www.dajuteam.com.tw/upload/web/images/assets/real-price-pic.png"
  };

  // =========================
  // 1) CSS 注入（防重複）
  // =========================
  const injectStyles = () => {
    if (document.getElementById("real-price-style-v4-2")) return;

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
    styleSheet.id = "real-price-style-v4-2";
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);
  };

  // =========================
  // 2) fetch JSON（Ads 同款：text -> JSON.parse）+ timeout
  // =========================
  const fetchJSON = async (url, timeoutMs, cacheMode) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        cache: cacheMode || "no-cache",
        headers: { "Accept": "application/json" },
        credentials: "omit"
      });

      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }

      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: null };
    } finally {
      clearTimeout(t);
    }
  };

  // =========================
  // 3) URL Builder（對齊 Ads/Case）
  // =========================
  const buildApiUrl_ = ({ meta = false, version = "" } = {}) => {
    const u = new URL(CONFIG.GAS_API_URL);
    if (meta) {
      u.searchParams.set("meta", "1");
      return u.toString();
    }
    if (version && String(version).trim() !== "") {
      u.searchParams.set("v", String(version));
    }
    return u.toString();
  };

  // =========================
  // 4) localStorage 讀寫（One-Key）
  // payload: { ts, metaTs, version, data }
  // =========================
  const readLocalCache = () => {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      if (!j || typeof j !== "object") return null;
      return j;
    } catch {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      return null;
    }
  };

  const writeLocalCache = (payload) => {
    try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload)); }
    catch {}
  };

  // =========================
  // 5) meta 探針
  // =========================
  const fetchMetaVersion = async () => {
    const metaUrl = buildApiUrl_({ meta: true });
    const r = await fetchJSON(metaUrl, CONFIG.META_TIMEOUT_MS, "no-store");
    const j = r && r.data;

    if (j && j.code === 200 && j.version) return String(j.version);
    return "";
  };

  // =========================
  // 6) full（一定帶 v；不打 no-v）
  // =========================
  const fetchFullData = async (version) => {
    if (!version) return null; // ✅ 不打 no-v（對齊白皮書：避免不可預期）
    const fullUrl = buildApiUrl_({ version });

    const r = await fetchJSON(fullUrl, CONFIG.FULL_TIMEOUT_MS, "default");
    const j = r && r.data;

    // 白皮書版：{code, version, data}
    if (j && j.code === 200 && j.data && typeof j.data === "object") {
      return { version: String(j.version || version || ""), data: j.data };
    }

    // 舊版：直接回 map {...}
    if (j && typeof j === "object" && !("code" in j)) {
      return { version: String(version || ""), data: j };
    }

    return null;
  };

  // =========================
  // 7) 取資料流程（Ads 方案一）
  // =========================
  const getData = async () => {
    const now = Date.now();
    const cache = readLocalCache();

    const cacheTs = cache && cache.ts ? Number(cache.ts) : 0;
    const cacheMetaTs = cache && cache.metaTs ? Number(cache.metaTs) : 0;
    const cacheVersion = cache && cache.version ? String(cache.version) : "";
    const cacheData = cache && cache.data && typeof cache.data === "object" ? cache.data : null;

    // (A) TTL 內：0 request
    if (cacheData && cacheTs && (now - cacheTs < CONFIG.EXPIRE_SECONDS * 1000)) {
      return cacheData;
    }

    // (B) TTL 到：meta cooldown gating
    const canHitMeta = (!cacheMetaTs) || (now - cacheMetaTs > CONFIG.META_COOLDOWN_MS);

    // cooldown 內：0 request，直接用舊資料並續命 ts（Ads 同款）
    if (!canHitMeta) {
      if (cacheData) {
        writeLocalCache({ ts: now, metaTs: cacheMetaTs || 0, version: cacheVersion, data: cacheData });
        return cacheData;
      }
      // 沒 cache：不打 no-v，直接回 null（讓畫面顯示更新中）
      return null;
    }

    // (C) 可以打 meta
    const metaVersion = await fetchMetaVersion();

    // meta 失敗：有舊用舊 + 更新 metaTs + 續命 ts（Ads 同款）
    if (!metaVersion) {
      if (cacheData) {
        writeLocalCache({ ts: now, metaTs: now, version: cacheVersion, data: cacheData });
        return cacheData;
      }
      // 沒舊資料：不打 no-v
      writeLocalCache({ ts: now, metaTs: now, version: "", data: {} });
      return null;
    }

    // meta OK 且版本相同：續命（不打 full）
    if (cacheData && cacheVersion && metaVersion === cacheVersion) {
      writeLocalCache({ ts: now, metaTs: now, version: cacheVersion, data: cacheData });
      return cacheData;
    }

    // 版本不同：打 full?v=metaVersion
    const full = await fetchFullData(metaVersion);
    if (full && full.data) {
      writeLocalCache({
        ts: now,
        metaTs: now,
        version: metaVersion || full.version || "",
        data: full.data
      });
      return full.data;
    }

    // full 失敗：有舊用舊 + 續命
    if (cacheData) {
      writeLocalCache({ ts: now, metaTs: now, version: cacheVersion, data: cacheData });
      return cacheData;
    }

    writeLocalCache({ ts: now, metaTs: now, version: metaVersion, data: {} });
    return null;
  };

  // =========================
  // 8) 渲染
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
  // 9) 主程式：抓取所有 [data-real-price]
  // =========================
  const init = async () => {
    const containers = document.querySelectorAll("[data-real-price]");
    if (!containers.length) return;

    injectStyles();

    const allData = await getData();

    containers.forEach((container) => {
      const caseName = (container.dataset.caseName || "").trim();
      if (!caseName) {
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
