/**
 * 延伸閱讀 Widget (V5.0-STABLE - Ads-Style Unified + MetaTs Cooldown ONLY)
 * ----------------------------------------------------------------------------
 * ✅ 目標：完全對齊你「Ads 最乾淨策略」
 * - Cold：先 meta=1 拿版本，再 v=latest 拉 full（不打 no-v）
 * - TTL 內：0 request
 * - TTL 到：若在 META_COOLDOWN_MS 內 → 不打 meta、用舊資料並續命 ts
 *          否則 → meta=1 探針，版本相同只續命；版本不同才 v-full
 * - meta 失敗：只做 gating（寫 metaTs=now）+ 續命 ts + 用舊 cache（畫面不空）
 *
 * ✅ Cache（One-Key, Ads-aligned）:
 * { ts, metaTs, version, data }
 *
 * ----------------------------------------------------------------------------
 * ✅ 你可調整的功能（都在 CONFIG / data-* 控制）
 * [CONFIG 可調整]
 * - LOCAL_CACHE_EXPIRY_MS：本地 TTL（目前 15 分鐘）
 * - META_COOLDOWN_MS：meta 冷卻（避免風暴，建議 60 秒）
 * - FETCH_TIMEOUT_MS / META_TIMEOUT_MS：超時
 * - DEFAULT_LIMIT：預設顯示筆數（data-limit 可覆蓋）
 * - HIDE_WHEN_EMPTY：沒資料是否隱藏（true=隱藏；false=顯示「精選文章整理中」）
 * - OPEN_TARGET：連結開啟方式（_self/_blank）
 *
 * [每個 UL 可用 data-* 調整]
 * - data-scope="北屯 機捷 特區"：關鍵字（支援逗號/空白/|）
 * - data-scope-mode="OR|AND"：匹配模式
 * - data-limit="8"：該區塊顯示筆數
 * - data-hide-empty="1|0"：該區塊覆蓋 HIDE_WHEN_EMPTY
 * - data-target="_self|_blank"：該區塊覆蓋 OPEN_TARGET
 * - data-debug="1"：該區塊 debug log
 *
 * [可選：資料欄位對應（若你 GAS 欄位不同）]
 * - 預設讀 row: { title, url, scope, priority, date }
 *   若你欄位名不同可在 normalizeRows() 調整 mapping
 */

(function () {
  // ==========================================================
  //  0) 全域設定（Ads 同款排版 + 命名）
  // ==========================================================
  const RELATED_API_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=related_posts";
  const LOCAL_CACHE_KEY = "daju_related_posts_cache";

  // ✅ localStorage 的有效時間（TTL 內完全 0 request）
  // ⚠️ 測試用先 15 分鐘（穩定後你再自行拉長）
  const LOCAL_CACHE_EXPIRY_MS = 15 * 60 * 1000; // 15 min

  // ✅ 避免 meta 風暴（TTL 過期後也不要每次都打 meta）
  // - 只要剛嘗試過 meta（成功或失敗），cooldown 內就不再打 meta
  const META_COOLDOWN_MS = 60 * 1000; // 60 sec

  // ✅ fetch 超時保護
  const FETCH_TIMEOUT_MS = 8000;
  const META_TIMEOUT_MS = 4000;

  // ✅ 顯示預設值（可被 data-limit 覆蓋）
  const DEFAULT_LIMIT = 10;

  // ✅ 沒資料是否隱藏（可被 data-hide-empty 覆蓋）
  const HIDE_WHEN_EMPTY = true;

  // ✅ 連結開啟方式（可被 data-target 覆蓋）
  const OPEN_TARGET = "_self";

  // ==========================================================
  //  1) CSS 注入（防重複）
  // ==========================================================
  function injectStyles() {
    const styleId = "related-posts-style";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      /* --- 延伸閱讀列表樣式 --- */
      ul.rel-list {
        list-style: none;
        padding: 0;
        margin: 15px 0 !important;
        border-top: 2px solid #eee;
        border-bottom: 2px solid #eee;
        background: #fff;
      }

      /* 載入中/無資料的狀態 */
      ul.rel-list.is-loading,
      ul.rel-list.is-empty {
        padding: 20px;
        text-align: center;
        color: #888;
        font-size: 0.9em;
      }

      ul.rel-list li {
        border-bottom: 1px dashed #eee;
        transition: background-color 0.2s;
      }
      ul.rel-list li:last-child { border-bottom: none; }
      ul.rel-list li:hover { background-color: #f9f9f9; }

      ul.rel-list a {
        display: block;
        padding: 10px 5px;
        text-decoration: none;
        color: #333;
        font-size: 1rem;
        line-height: 1.5;
        position: relative;
        padding-left: 20px;
      }
      ul.rel-list a::before {
        content: "➤";
        color: #eb6100;
        position: absolute;
        left: 0;
        top: 11px;
        font-size: 0.8em;
      }
      ul.rel-list a:hover { color: #eb6100; }
    `;
    document.head.appendChild(style);
  }

  // ==========================================================
  //  2) localStorage helpers（Ads 同款欄位）
  // ==========================================================
  function readCache() {
    try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } catch { return null; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
  }

  // ==========================================================
  //  3) 安全字串
  // ==========================================================
  function escapeHtml(s = "") {
    return String(s).replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  // ==========================================================
  //  4) fetch JSON with timeout（Ads 同款：先 text 再 parse）
  // ==========================================================
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
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: null };
    } finally {
      clearTimeout(tid);
    }
  }

  // ==========================================================
  //  5) URL builder（共用路由必備：避免兩個 ?）
  // ==========================================================
  function buildApiUrl({ meta = false, version = "", refresh = false } = {}) {
    const u = new URL(RELATED_API_URL);

    if (meta) {
      u.searchParams.set("meta", "1");
      return u.toString();
    }

    if (version && String(version).trim() !== "") {
      u.searchParams.set("v", String(version));
    }

    if (refresh) u.searchParams.set("refresh", "1");
    return u.toString();
  }

  // ==========================================================
  //  6) Payload normalize（你可在這裡改欄位 mapping）
  //    目標：輸出統一為：
  //    { title, url, scope, priority, date }
  // ==========================================================
  function normalizeRows(raw) {
    // 可能是：
    // - 白皮書版：{ code, version, data: [...] }
    // - 舊版：直接 [...]
    const rows = Array.isArray(raw) ? raw
      : (raw && Array.isArray(raw.data) ? raw.data
        : (raw && raw.data && Array.isArray(raw.data.data) ? raw.data.data : []));

    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const title = (r.title != null) ? String(r.title) : "";
      const url = (r.url != null) ? String(r.url) : "";
      const scope = (r.scope != null) ? String(r.scope) : "";
      const priority = (r.priority == null) ? 0 : Number(r.priority) || 0;
      const date = (r.date != null) ? String(r.date) : "";

      // ✅ 基本防呆：至少要有 url / title 才算一筆（你也可改成只要 url）
      if (!url || !title) continue;

      out.push({ title, url, scope, priority, date });
    }
    return out;
  }

  // ==========================================================
  //  7) 排序策略：priority desc > date desc > title asc
  // ==========================================================
  function sortRows(rows) {
    rows.sort((a, b) => {
      const p = (Number(b.priority || 0) - Number(a.priority || 0));
      if (p !== 0) return p;

      const d = (new Date(b.date || 0) - new Date(a.date || 0));
      if (d !== 0) return d;

      return String(a.title || "").localeCompare(String(b.title || ""), "zh-Hant");
    });
    return rows;
  }

  // ==========================================================
  //  8) Ads-style Data Engine（metaTs cooldown ONLY）
  // ==========================================================
  async function getRelatedSmart(forceRefresh) {
    const now = Date.now();
    const cached = readCache();

    const cachedTs = cached && cached.ts ? Number(cached.ts) : 0;
    const cachedMetaTs = cached && cached.metaTs ? Number(cached.metaTs) : 0;
    const cachedVersion = cached && cached.version ? String(cached.version) : "";
    const cachedData = cached && Array.isArray(cached.data) ? cached.data : null;

    // (A) ?refresh：救援/除錯用（仍 meta-first，但 refresh=1 bypass）
    if (forceRefresh) {
      const metaUrl = buildApiUrl({ meta: true });
      const metaRes = await fetchJSON(metaUrl, { timeoutMs: META_TIMEOUT_MS, cacheMode: "no-store" });
      const latest = metaRes && metaRes.data && metaRes.data.code === 200 && metaRes.data.version
        ? String(metaRes.data.version)
        : "";

      const vForRefresh = (latest || cachedVersion || "").trim();

      // ✅ 沒版本就不打 full（避免 no-v）
      if (!vForRefresh) {
        if (cachedData) {
          writeCache({ ts: now, metaTs: now, version: cachedVersion || "0", data: cachedData });
          return cachedData;
        }
        return null;
      }

      const fullUrl = buildApiUrl({ version: vForRefresh, refresh: true });
      const fullRes = await fetchJSON(fullUrl, { timeoutMs: FETCH_TIMEOUT_MS, cacheMode: "reload" });
      const payload = fullRes && fullRes.data;

      if (payload && payload.code === 200) {
        const rows = normalizeRows(payload);
        const ver = (payload.version ? String(payload.version) : vForRefresh) || "0";
        writeCache({ ts: now, metaTs: now, version: ver, data: rows });
        return rows;
      }

      // refresh full fail => fallback cache
      if (cachedData) {
        writeCache({ ts: now, metaTs: now, version: cachedVersion || "0", data: cachedData });
        return cachedData;
      }
      return null;
    }

    // (B) Cold：meta-first（不打 no-v）
    if (!cachedData || !cachedVersion) {
      const metaUrl = buildApiUrl({ meta: true });
      const metaRes = await fetchJSON(metaUrl, { timeoutMs: META_TIMEOUT_MS, cacheMode: "no-store" });
      const latest = metaRes && metaRes.data && metaRes.data.code === 200 && metaRes.data.version
        ? String(metaRes.data.version)
        : "";

      if (latest) {
        const fullUrl = buildApiUrl({ version: latest });
        const fullRes = await fetchJSON(fullUrl, { timeoutMs: FETCH_TIMEOUT_MS, cacheMode: "default" });
        const payload = fullRes && fullRes.data;

        if (payload && payload.code === 200) {
          const rows = normalizeRows(payload);
          const ver = (payload.version ? String(payload.version) : latest) || "0";
          writeCache({ ts: now, metaTs: now, version: ver, data: rows });
          return rows;
        }
      }

      // meta 拿不到：不打 no-v
      return cachedData || null;
    }

    // (C) TTL 內：0 request
    if (cachedTs && (now - cachedTs < LOCAL_CACHE_EXPIRY_MS)) {
      return cachedData;
    }

    // (D) TTL 到：meta probe（但要 cooldown）
    const canHitMeta = (!cachedMetaTs || (now - cachedMetaTs > META_COOLDOWN_MS));

    // cooldown 內：不打 meta，續命 ts
    if (!canHitMeta) {
      writeCache({ ts: now, metaTs: cachedMetaTs || 0, version: cachedVersion || "0", data: cachedData });
      return cachedData;
    }

    // 可以打 meta
    const metaUrl = buildApiUrl({ meta: true });
    const metaRes = await fetchJSON(metaUrl, { timeoutMs: META_TIMEOUT_MS, cacheMode: "no-store" });
    const latest = metaRes && metaRes.data && metaRes.data.code === 200 && metaRes.data.version
      ? String(metaRes.data.version)
      : "";

    // meta 失敗：gating + 續命 + 用舊 cache
    if (!latest) {
      writeCache({ ts: now, metaTs: now, version: cachedVersion || "0", data: cachedData });
      return cachedData;
    }

    // 版本相同：只續命（0 full）
    if (latest === cachedVersion) {
      writeCache({ ts: now, metaTs: now, version: cachedVersion || "0", data: cachedData });
      return cachedData;
    }

    // 版本不同：v-full（HIT edge）
    const fullUrl = buildApiUrl({ version: latest });
    const fullRes = await fetchJSON(fullUrl, { timeoutMs: FETCH_TIMEOUT_MS, cacheMode: "default" });
    const payload = fullRes && fullRes.data;

    if (payload && payload.code === 200) {
      const rows = normalizeRows(payload);
      const ver = (payload.version ? String(payload.version) : latest) || "0";
      writeCache({ ts: now, metaTs: now, version: ver, data: rows });
      return rows;
    }

    // full 失敗：回舊 + 續命
    writeCache({ ts: now, metaTs: now, version: cachedVersion || "0", data: cachedData });
    return cachedData;
  }

  // ==========================================================
  //  9) 渲染：多區塊 + scope filter（AND/OR）
  // ==========================================================
  function parseScopes(rawScope) {
    return String(rawScope || "")
      .split(/[,\|\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function matchRowByScope(rowScope, scopes, mode) {
    const s = String(rowScope || "");
    if (!scopes.length) return false;
    if (mode === "AND") return scopes.every(k => s.includes(k));
    return scopes.some(k => s.includes(k)); // OR
  }

  function renderList(ul, allRows) {
    ul.classList.remove("is-loading");
    ul.classList.remove("is-empty");

    const rawScope = ul.dataset.scope || "";
    const mode = (ul.dataset.scopeMode || "OR").toUpperCase(); // OR|AND
    const scopes = parseScopes(rawScope);

    const limit = parseInt(ul.dataset.limit || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
    const hideEmpty = (ul.dataset.hideEmpty != null)
      ? (String(ul.dataset.hideEmpty) === "1" || String(ul.dataset.hideEmpty).toLowerCase() === "true")
      : HIDE_WHEN_EMPTY;

    const target = (ul.dataset.target || OPEN_TARGET || "_self").trim();
    const debug = (ul.dataset.debug != null)
      ? (String(ul.dataset.debug) === "1" || String(ul.dataset.debug).toLowerCase() === "true")
      : false;

    if (debug && window.console) {
      console.log("[RelatedWidget] scope=", rawScope, "mode=", mode, "limit=", limit, "hideEmpty=", hideEmpty);
    }

    const items = allRows
      .filter(r => matchRowByScope(r.scope, scopes, mode))
      .slice(0, limit);

    if (!items.length) {
      ul.classList.add("is-empty");
      if (hideEmpty) {
        ul.style.display = "none";
      } else {
        ul.style.display = "";
        ul.innerHTML = "精選文章整理中...";
      }
      return;
    }

    ul.style.display = "";
    ul.innerHTML = items.map(it => `
      <li>
        <a href="${escapeHtml(it.url)}" target="${escapeHtml(target)}">
          ${escapeHtml(it.title || "（未命名）")}
        </a>
      </li>
    `).join("");
  }

  // ==========================================================
  //  10) 主程式：抓所有 ul.rel-list[data-scope]（多區塊）
  // ==========================================================
  async function initRelatedPosts() {
    const targets = document.querySelectorAll("ul.rel-list[data-scope]");
    if (!targets.length) return;

    injectStyles();

    // loading 狀態
    targets.forEach(ul => {
      ul.style.display = "";
      ul.classList.add("is-loading");
      ul.classList.remove("is-empty");
      ul.innerHTML = "資料讀取中...";
    });

    // ✅ 只有頁面網址帶 ?refresh 才強制直通
    let forceRefresh = false;
    try { forceRefresh = new URLSearchParams(window.location.search).has("refresh"); } catch {}

    try {
      const rows = await getRelatedSmart(forceRefresh);
      if (!rows || !Array.isArray(rows)) throw new Error("NO_DATA");

      const clean = sortRows(rows.slice());
      targets.forEach(ul => renderList(ul, clean));
    } catch (err) {
      console.error("[RelatedWidget] Error:", err);
      targets.forEach(ul => {
        ul.classList.remove("is-loading");
        ul.classList.add("is-empty");
        ul.innerHTML = "讀取失敗";
        ul.style.display = "none";
      });
    }
  }

  // ==========================================================
  //  11) 自動啟動（DOM ready + BFCache）
  // ==========================================================
  function boot() {
    try { initRelatedPosts(); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // ✅ BFCache：只在 persisted 才重跑（跟 Ads 同款）
  window.addEventListener("pageshow", function (ev) {
    if (ev && ev.persisted) {
      try { boot(); } catch (e) {}
    }
  });

})();
