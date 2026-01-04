/**
 * =========================================================
 * DAJU Related Posts Widget (Ads-aligned, Multi-UL, Stable)
 * - ✅ JS 修正版本（不是 GAS）
 * - ✅ 支援多個 ul.rel-list[data-scope]
 * - ✅ localStorage One-Key cache
 * - ✅ TTL 內 0 request
 * - ✅ TTL 到：meta=1 探針 + metaTs cooldown（Only）
 * - ✅ meta 失敗：只做 gating（metaTs=now）+ 用舊 cache + 續命 ts（畫面不空）
 * - ✅ 版本相同：只續命 ts（0 full）
 * - ✅ 版本不同：full?v=version 更新
 * - ✅ 關鍵修正：render 成功時必須清掉 is-empty / display:none
 *
 * Network 形態（正常狀態只會出現這兩種）：
 *   - ?type=related_posts&meta=1
 *   - ?type=related_posts&v=最新版本
 *
 * 可調整項目（都在 CONFIG）：
 * - EXPIRE_SECONDS：TTL（測試先 15 分鐘）
 * - META_COOLDOWN_MS：meta 風暴冷卻
 * - DEFAULT_LIMIT：沒寫 data-limit 時用這個
 * - DEFAULT_MODE：OR / AND
 * - HIDE_WHEN_EMPTY：沒資料是否隱藏 ul（你目前是 true）
 * - DEBUG：?debug=1 會輸出 console log
 * =========================================================
 */

(function () {
  "use strict";

  // =========================================================
  // 0) Config（✅ 你可調整）
  // =========================================================
  const CONFIG = {
    API_URL: "https://daju-unified-route-api.dajuteam88.workers.dev/?type=related_posts",
    STORAGE_KEY: "daju_related_posts_cache",

    // ✅ 測試先 15 分鐘，穩定後你再拉長
    EXPIRE_SECONDS: 15 * 60,

    META_TIMEOUT_MS: 4000,
    FULL_TIMEOUT_MS: 8000,

    // ✅ Ads 同款：只有 metaTs cooldown（不使用 metaFailAt）
    META_COOLDOWN_MS: 60 * 1000,

    // ✅ UI 預設
    DEFAULT_LIMIT: 10,
    DEFAULT_MODE: "OR", // OR | AND
    HIDE_WHEN_EMPTY: true
  };

  // debug flag：網址帶 ?debug=1
  const DEBUG = (() => {
    try { return new URLSearchParams(location.search).has("debug"); } catch { return false; }
  })();
  const dlog = (...args) => { if (DEBUG && console) console.log("[REL]", ...args); };

  // =========================================================
  // 1) CSS 注入（原樣保留）
  // =========================================================
  function injectStyles() {
    const styleId = "related-posts-style";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      ul.rel-list {
        list-style: none;
        padding: 0;
        margin: 15px 0 !important;
        border-top: 2px solid #eee;
        border-bottom: 2px solid #eee;
        background: #fff;
      }

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

  // =========================================================
  // 2) localStorage helpers（One-Key）
  // payload: { ts, metaTs, version, data }
  // =========================================================
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || "null"); } catch { return null; }
  }
  function writeCache(obj) {
    try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(obj)); } catch {}
  }

  // =========================================================
  // 3) fetch JSON（Ads 同款：先 text 再 parse）
  // =========================================================
  async function fetchJSON(url, { cacheMode, timeoutMs }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      dlog("fetch =>", url);
      const res = await fetch(url, {
        signal: controller.signal,
        cache: cacheMode || "no-cache",
        headers: { "Accept": "application/json" }
      });

      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }

      dlog("resp <=", res.status, data && data.code ? ("code=" + data.code) : "");
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      dlog("fetch error", e && e.message ? e.message : e);
      return { ok: false, status: 0, data: null };
    } finally {
      clearTimeout(timer);
    }
  }

  // =========================================================
  // 4) URL builder（避免 ? 重複）
  // =========================================================
  function buildUrl({ meta = false, version = "" } = {}) {
    const u = new URL(CONFIG.API_URL);

    if (meta) u.searchParams.set("meta", "1");
    if (!meta && version && String(version).trim() !== "") {
      u.searchParams.set("v", String(version));
    }
    return u.toString();
  }

  // =========================================================
  // 5) Data engine（Ads-style：metaTs cooldown ONLY）
  // =========================================================
  async function getRelatedData() {
    const now = Date.now();
    const cached = readCache();

    const cachedTs = cached && Number(cached.ts || 0);
    const cachedMetaTs = cached && Number(cached.metaTs || 0);
    const cachedVersion = cached && cached.version ? String(cached.version) : "";
    const cachedData = cached && Array.isArray(cached.data) ? cached.data : null;

    // A) TTL 內：0 request
    if (cachedData && cachedTs && (now - cachedTs < CONFIG.EXPIRE_SECONDS * 1000)) {
      dlog("hit local cache (TTL ok)");
      return { rows: cachedData, version: cachedVersion || "0" };
    }

    // B) Cold：沒 cache => meta-first（不打 no-v）
    const isCold = !cachedData || !cachedVersion;
    if (isCold) {
      dlog("cold start => meta-first");
      const metaRes = await fetchJSON(buildUrl({ meta: true }), {
        cacheMode: "no-store",
        timeoutMs: CONFIG.META_TIMEOUT_MS
      });

      const latest = metaRes && metaRes.data && metaRes.data.version ? String(metaRes.data.version) : "";
      if (latest) {
        const fullRes = await fetchJSON(buildUrl({ version: latest }), {
          cacheMode: "default",
          timeoutMs: CONFIG.FULL_TIMEOUT_MS
        });

        const payload = fullRes && fullRes.data;
        if (payload && payload.code === 200 && Array.isArray(payload.data)) {
          writeCache({ ts: now, metaTs: now, version: latest, data: payload.data });
          return { rows: payload.data, version: latest };
        }
      }

      // meta 也拿不到：回空（保持乾淨策略，不打 no-v）
      return { rows: [], version: "0" };
    }

    // C) TTL 到：meta probe（但要 metaTs cooldown）
    const canHitMeta = (!cachedMetaTs || (now - cachedMetaTs > CONFIG.META_COOLDOWN_MS));
    if (!canHitMeta) {
      // ✅ cooldown 內：不打 meta（0 request），直接用舊資料 + 續命 ts
      dlog("meta cooldown => renew ts only");
      writeCache({ ts: now, metaTs: cachedMetaTs || 0, version: cachedVersion, data: cachedData });
      return { rows: cachedData || [], version: cachedVersion || "0" };
    }

    // 可以打 meta
    const metaRes = await fetchJSON(buildUrl({ meta: true }), {
      cacheMode: "no-store",
      timeoutMs: CONFIG.META_TIMEOUT_MS
    });

    const latest = metaRes && metaRes.data && metaRes.data.version ? String(metaRes.data.version) : "";

    // meta 失敗：只做 gating（metaTs=now）+ 續命 ts + 用舊 cache
    if (!latest) {
      dlog("meta failed => gating + renew ts");
      writeCache({ ts: now, metaTs: now, version: cachedVersion, data: cachedData });
      return { rows: cachedData || [], version: cachedVersion || "0" };
    }

    // 版本相同：只續命 ts（0 full）
    if (latest === cachedVersion) {
      dlog("meta same => renew ts only");
      writeCache({ ts: now, metaTs: now, version: cachedVersion, data: cachedData });
      return { rows: cachedData || [], version: cachedVersion || "0" };
    }

    // 版本不同：full?v=latest
    dlog("meta changed => fetch full v=", latest);
    const fullRes = await fetchJSON(buildUrl({ version: latest }), {
      cacheMode: "default",
      timeoutMs: CONFIG.FULL_TIMEOUT_MS
    });

    const payload = fullRes && fullRes.data;
    if (payload && payload.code === 200 && Array.isArray(payload.data)) {
      writeCache({ ts: now, metaTs: now, version: latest, data: payload.data });
      return { rows: payload.data, version: latest };
    }

    // full 失敗：回舊 + 續命
    dlog("full failed => fallback old");
    writeCache({ ts: now, metaTs: now, version: cachedVersion, data: cachedData });
    return { rows: cachedData || [], version: cachedVersion || "0" };
  }

  // =========================================================
  // 6) render helpers
  // =========================================================
  function escapeHtml(s = "") {
    return String(s).replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function normalizeTokens(rawScope) {
    return String(rawScope || "")
      .split(/[,\|\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function sortRows(allRows) {
    const arr = Array.isArray(allRows) ? allRows.slice() : [];
    arr.sort((a, b) => {
      const p = (+(b.priority || 0)) - (+(a.priority || 0));
      if (p !== 0) return p;
      const d = (new Date(b.date || 0)) - (new Date(a.date || 0));
      if (d !== 0) return d;
      return (String(a.title || "")).localeCompare(String(b.title || ""), "zh-Hant");
    });
    return arr;
  }

  function renderList(ul, allRowsSorted) {
    // ✅ 修正重點：成功渲染前，先把「失敗/空資料狀態」清掉
    ul.classList.remove("is-loading");
    ul.classList.remove("is-empty");
    ul.style.display = ""; // ← 你現在卡住的關鍵就是這行（之前漏了）

    const rawScope = ul.dataset.scope || "";
    const tokens = normalizeTokens(rawScope);

    const limit = parseInt(ul.dataset.limit || String(CONFIG.DEFAULT_LIMIT), 10) || CONFIG.DEFAULT_LIMIT;
    const mode = String(ul.dataset.scopeMode || CONFIG.DEFAULT_MODE).toUpperCase();

    dlog("render", { rawScope, tokens, mode, limit });

    function matchRow(row) {
      const rowScope = String(row && row.scope ? row.scope : "");
      if (!tokens.length) return false;
      if (mode === "AND") return tokens.every(t => rowScope.includes(t));
      return tokens.some(t => rowScope.includes(t)); // OR
    }

    const items = allRowsSorted.filter(matchRow).slice(0, limit);

    if (!items.length) {
      ul.classList.add("is-empty");
      ul.innerHTML = "（沒有相關延伸閱讀）";
      if (CONFIG.HIDE_WHEN_EMPTY) ul.style.display = "none";
      return;
    }

    ul.innerHTML = items.map(it => `
      <li>
        <a href="${escapeHtml(it.url || "#")}" target="_self">
          ${escapeHtml(it.title || "（未命名）")}
        </a>
      </li>
    `).join("");
  }

  // =========================================================
  // 7) main
  // =========================================================
  async function initRelatedPosts() {
    const targets = document.querySelectorAll("ul.rel-list[data-scope]");
    if (!targets.length) return;

    injectStyles();

    // loading state
    targets.forEach(ul => {
      ul.classList.add("is-loading");
      ul.classList.remove("is-empty");
      ul.style.display = ""; // 確保不會被舊狀態鎖死
      ul.innerHTML = "資料讀取中...";
    });

    try {
      const result = await getRelatedData();
      const sorted = sortRows(result.rows);

      dlog("data loaded", { version: result.version, rows: sorted.length });

      targets.forEach(ul => {
        try { renderList(ul, sorted); } catch (e) {
          console.error("[REL] render failed:", e);
          ul.classList.remove("is-loading");
          ul.classList.add("is-empty");
          ul.innerHTML = "讀取失敗";
          ul.style.display = "none";
        }
      });

    } catch (e) {
      console.error("[REL] init failed:", e);
      targets.forEach(ul => {
        ul.classList.remove("is-loading");
        ul.classList.add("is-empty");
        ul.innerHTML = "讀取失敗";
        ul.style.display = "none";
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRelatedPosts);
  } else {
    initRelatedPosts();
  }

})();
