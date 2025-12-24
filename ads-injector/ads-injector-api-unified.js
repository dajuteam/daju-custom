/**
 * 大橘廣告管理系統前端 JS（V4.7.3 - Meta Stable + BFCache Fix + Deferred Cache Write + YT Default Lazy + ✅ Edge HIT Friendly）
 * ----------------------------------------------------------------------------
 * 核心目標（你要的效果）：
 * 1) localStorage TTL 內：0 request（最快）
 * 2) TTL 到期：打 meta=1（小包）確認版本
 *    - 版本沒變：只更新 timestamp（仍 0 full request）
 *    - 版本變了：打 full 用「?v=最新版本」✅（讓 Worker 用版本型快取，能 HIT edge）
 * 3) ✅ 清 Cookie / 第一次來：
 *    - 先 meta 拿最新版本
 *    - 再用 v=最新版本 拉 full（❌ 不用 refresh=1）
 *      => 這樣「你按過 warm」的全球節點會 HIT（不是 BYPASS）
 *
 * refresh 規則（很重要）：
 * - 只有當網址帶 ?refresh 才會走 refresh=1（完全 bypass，給你 Debug/強制更新用）
 * - 正常流程（首次 / TTL 更新）都不使用 refresh=1（才能吃到 edge cache）
 *
 * ✅ 保留你指定必做項目：
 * 1) pageshow / BFCache 修補
 * 2) writeCache 延後寫入（requestIdleCallback）
 * 3) bustHtmlUrls 先 check（避免無 src 浪費）
 * 4) readyState 啟動
 * 5) fetchJSON 更穩（先檢查 content-type）
 *
 * ✅ 版本關鍵修正（跟你這次需求完全對齊）：
 * - 首次 full：改用 v=latest（不再 refresh=1）
 * - 版本更新 full：改用 v=latest（不再 refresh=1）
 * - 只有你手動 ?refresh 才 refresh=1
 */

// ==========================================
//  0) 全域設定
// ==========================================
const ADS_GAS_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=ads_injector";
const LOCAL_CACHE_KEY = "daju_ads_cache";

// ✅ 你原本是 5 分鐘：保留
const LOCAL_CACHE_EXPIRY_MS = 5 * 60 * 1000;

// fetch 超時
const FETCH_TIMEOUT_MS = 8000;
const META_TIMEOUT_MS  = 4000;

// ==========================================
//  0.5) defer（避免手機 main thread 卡）
// ==========================================
function defer(fn) {
  try {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => fn(), { timeout: 1200 });
    } else {
      setTimeout(fn, 0);
    }
  } catch {
    try { setTimeout(fn, 0); } catch {}
  }
}

// ==========================================
//  1) CSS 注入（保留原樣式）
// ==========================================
function injectStyles() {
  if (document.getElementById("daju-ad-manager-styles")) return;
  const style = document.createElement("style");
  style.id = "daju-ad-manager-styles";
  style.textContent = `
    .ad-slot { width: 100%; margin: 20px 0; display: none; overflow: hidden; }
    .ad-slot img { display: block; width: 100%; height: auto; object-fit: cover; }
    .ad-video-wrapper { position: relative; width: 100%; padding-bottom: 56.25%; background: #000; }
    .ad-video-wrapper iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    .ad-fade-in { animation: adFadeIn 0.35s ease-in forwards; }
    @keyframes adFadeIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

// ==========================================
//  2) localStorage helpers（延後寫入）
// ==========================================
function readCache() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } catch { return null; }
}
function writeCache(obj) {
  defer(() => {
    try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
  });
}

// ==========================================
//  3) slotMap（一次掃描 DOM）
// ==========================================
function buildSlotMap() {
  const map = new Map();
  document.querySelectorAll(".ad-slot").forEach(el => {
    if (!el.dataset.baseClass) el.dataset.baseClass = el.className;
    const slotId = el.dataset.slotId;
    if (slotId) map.set(slotId, el);
  });
  return map;
}

// ==========================================
//  4) fetch JSON with timeout（更穩：先看 Content-Type）
// ==========================================
async function fetchJSON(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { ...(options.headers || {}), "Accept": "application/json" }
    });

    // ✅ 先檢查 content-type，避免遇到 HTML 502/403 還去 res.json()
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return null;

    try { return await res.json(); } catch { return null; }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ==========================================
//  4.5) URL builder
//  - meta: 只回版本
//  - full: 可帶 v=...（版本型快取）
//  - refresh=1: 只給你手動強制更新用（會 BYPASS edge）
// ==========================================
function buildAdsUrl({ version, meta, refresh } = {}) {
  const u = new URL(ADS_GAS_URL);

  if (meta) {
    u.searchParams.set("meta", "1");
    return u.toString();
  }

  // ✅ full：強烈建議帶 v（版本型快取）
  if (version != null && String(version).trim() !== "") {
    u.searchParams.set("v", String(version));
  }

  // ⚠️ refresh=1：會讓 Worker BYPASS（不讀不寫 edge）
  if (refresh) {
    u.searchParams.set("refresh", "1");
  }

  return u.toString();
}

// ==========================================
//  4.6) Auto Cache Bust helpers
//  - 把 version 加到 img / iframe / html 的 src 上
// ==========================================
function appendV(url, v) {
  if (!url || !v) return url;
  const s = String(url).trim();
  if (!s) return s;
  if (/^(javascript:|data:|blob:)/i.test(s)) return s;

  try {
    const u = new URL(s, location.href);
    u.searchParams.set("v", String(v));
    return u.toString();
  } catch {
    const sep = s.includes("?") ? "&" : "?";
    return s + sep + "v=" + encodeURIComponent(String(v));
  }
}

function bustHtmlUrls(html, v) {
  if (!html || !v) return html;

  const s = String(html);
  // ✅ 先 check，避免無 src 的 HTML 也跑 replace
  if (s.indexOf("src=") === -1 && s.indexOf("SRC=") === -1) return s;

  const srcRe = /(\bsrc=["'])([^"']+)(["'])/gi;
  return s.replace(srcRe, (m, p1, url, p3) => p1 + appendV(url, v) + p3);
}

// ==========================================
//  4.7) API calls
//  - meta: 小包版本探針
//  - full: ✅ 正常情況不 refresh（讓 edge 可以 HIT）
//          只有網址帶 ?refresh 才 refresh=1（BYPASS edge）
// ==========================================
async function fetchAdsByClientVersion(version, bypassCache = false) {
  const url = buildAdsUrl({ version, meta: false, refresh: !!bypassCache });

  // ✅ 平常用 no-cache（允許走 edge cache key），需要強制才 reload
  const fetchOptions = bypassCache ? { cache: "reload" } : { cache: "no-cache" };
  return await fetchJSON(url, fetchOptions, FETCH_TIMEOUT_MS);
}

async function fetchMetaVersion() {
  const url = buildAdsUrl({ meta: true });
  return await fetchJSON(url, { cache: "no-cache" }, META_TIMEOUT_MS);
}

// ==========================================
//  5) render slot（完整可覆蓋版）
// ==========================================
function renderSlot(slot, adData, apiVersion) {
  // 還原 base class，避免 class 累積
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;
  else slot.className = "";

  slot.innerHTML = "";
  slot.style.display = "none";

  if (!adData) return;

  // 追加 class
  if (adData.class) {
    String(adData.class)
      .split(/\s+/)
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(c => slot.classList.add(c));
  }

  let hasContent = false;

  // IMAGE
  if (adData.type === "image" && adData.img) {
    const img = document.createElement("img");
    img.src = appendV(adData.img, apiVersion);
    img.loading = "lazy";
    img.setAttribute("decoding", "async");

    const altText =
      (adData.alt != null && String(adData.alt).trim() !== "")
        ? String(adData.alt).trim()
        : ((adData.title != null && String(adData.title).trim() !== "")
            ? String(adData.title).trim()
            : "房產廣告");
    img.alt = altText;

    const titleText = (adData.title != null) ? String(adData.title).trim() : "";
    if (titleText) img.title = titleText;

    const link = (adData.link != null) ? String(adData.link).trim() : "";
    if (link) {
      const a = document.createElement("a");
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.appendChild(img);
      slot.appendChild(a);
    } else {
      slot.appendChild(img);
    }
    hasContent = true;

  // YOUTUBE（預設 data-src lazy）
  } else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", appendV(adData.video, apiVersion));
    iframe.allowFullscreen = true;
    iframe.title = adData.title || "video";
    iframe.setAttribute("loading", "lazy");
    iframe.referrerPolicy = "strict-origin-when-cross-origin";

    wrapper.appendChild(iframe);
    slot.appendChild(wrapper);
    hasContent = true;

  // HTML
  } else if (adData.type === "html" && adData.html) {
    slot.innerHTML = bustHtmlUrls(adData.html, apiVersion);
    hasContent = true;
  }

  if (hasContent) {
    slot.style.display = "block";
    slot.classList.add("ad-fade-in");
  } else {
    slot.style.display = "none";
  }
}

// ==========================================
//  6) Smart cache logic (Meta Stable)
//  ✅ 這裡是本次關鍵修正：
//     - 首次（沒 cache）：full 改用 v=latest 且 bypassCache=false（不 refresh）
//     - TTL 後版本變：full 改用 v=latest 且 bypassCache=false（不 refresh）
//     - 只有網址帶 ?refresh 才 refresh=1（給你強制直通用）
// ==========================================
async function getAdsSmart(forceRefresh) {
  const cached = readCache();

  // ==========================
  // (A) 強制刷新：只有你網址帶 ?refresh 才會走這段
  //     => 會 refresh=1，Worker BYPASS（不讀不寫 edge）
  //     用途：Debug / 你想立刻看新資料，不管 edge/local
  // ==========================
  if (forceRefresh) {
    const meta = await fetchMetaVersion();
    const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";

    const full = await fetchAdsByClientVersion(latest, true); // ✅ 只有這裡 refresh=1
    if (full && full.code === 200 && full.data) {
      const v = String(full.version || latest || "0");
      writeCache({ version: v, data: full.data, timestamp: Date.now() });
      return { data: full.data, version: v };
    }

    // fail => fallback cached
    return cached ? { data: cached.data, version: String(cached.version || "0") } : null;
  }

  // ==========================
  // (B) 首次/清 cookie：沒有 local cache
  // ✅ 正確作法：先 meta 拿版本，再用 v=latest 拉 full（不 refresh）
  //     => 如果你按過 warm，full 這包會 HIT edge
  // ==========================
  if (!cached) {
    const meta = await fetchMetaVersion();
    const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";

    // ✅ 關鍵：不要 refresh=1，讓 edge 快取能命中
    const full = await fetchAdsByClientVersion(latest, false);

    if (full && full.code === 200 && full.data) {
      const v = String(full.version || latest || "0");
      writeCache({ version: v, data: full.data, timestamp: Date.now() });
      return { data: full.data, version: v };
    }

    return null;
  }

  // ==========================
  // (C) TTL 內：0 request
  // ==========================
  if (cached.timestamp && (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS)) {
    return { data: cached.data, version: String(cached.version || "0") };
  }

  // ==========================
  // (D) TTL 後：打 meta 檢查版本
  // ==========================
  const meta = await fetchMetaVersion();
  const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";
  const oldV = String(cached.version || "0");

  // 版本沒變：只續命 timestamp（仍然不拉 full）
  if (latest && oldV === latest) {
    writeCache({ ...cached, timestamp: Date.now() });
    return { data: cached.data, version: oldV };
  }

  // ==========================
  // (E) 版本變了：✅ 用 v=latest 拉 full（不 refresh）
  //     => 若 edge 已 warm，會 HIT；否則 MISS 一次後寫入 edge
  // ==========================
  const full = await fetchAdsByClientVersion(latest, false);

  if (full && full.code === 200 && full.data) {
    const v = String(full.version || latest || "0");
    writeCache({ version: v, data: full.data, timestamp: Date.now() });
    return { data: full.data, version: v };
  }

  // fail => fallback 舊 cache（避免畫面空）
  writeCache({ ...cached, timestamp: Date.now() });
  return { data: cached.data, version: oldV };
}

// ==========================================
//  7) YouTube lazy load（預設方法）
// ==========================================
function setupLazyIframes() {
  const frames = document.querySelectorAll("iframe[data-src]");
  if (!frames.length) return;

  if (!("IntersectionObserver" in window)) {
    frames.forEach(f => {
      f.src = f.getAttribute("data-src");
      f.removeAttribute("data-src");
    });
    return;
  }

  // ✅ 提早載入（體感更快）
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const f = entry.target;
      f.src = f.getAttribute("data-src");
      f.removeAttribute("data-src");
      obs.unobserve(f);
    });
  }, { rootMargin: "800px 0px" });

  frames.forEach(f => io.observe(f));
}

// ==========================================
//  8) Main（readyState + BFCache）
// ==========================================
async function insertAds() {
  injectStyles();

  // ✅ 只有你手動帶 ?refresh 才強制直通
  const params = new URLSearchParams(window.location.search);
  const forceRefresh = params.has("refresh");

  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  const result = await getAdsSmart(forceRefresh);
  if (!result || !result.data) return;

  slotMap.forEach((slot, slotId) => {
    try { renderSlot(slot, result.data[slotId], result.version); }
    catch (e) { console.error("renderSlot failed:", slotId, e); }
  });

  setupLazyIframes();
}

function bootAds() {
  try { insertAds(); } catch (e) { console.error(e); }
}

// ✅ readyState 啟動（你指定保留）
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAds, { once: true });
} else {
  bootAds();
}

// ✅ BFCache 修補（你指定保留）
window.addEventListener("pageshow", (ev) => {
  if (ev && ev.persisted) bootAds();
});
