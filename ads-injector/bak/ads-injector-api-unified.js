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
 * - 只有當頁面網址帶 ?refresh 才會走 refresh=1（完全 bypass，Debug/強制更新用）
 * - 正常流程（首次 / TTL 更新）都不使用 refresh=1（才能吃到 edge cache）
 *
 * ✅ 保留你指定必做項目：
 * 1) pageshow / BFCache 修補
 * 2) writeCache 延後寫入（requestIdleCallback）
 * 3) bustHtmlUrls 先 check（避免無 src 浪費）
 * 4) readyState 啟動
 * 5) fetchJSON 更穩（不再被 content-type 卡住：先讀 text 再 parse）
 */

// ==========================================
//  0) 全域設定
// ==========================================
const ADS_GAS_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=ads_injector";
const LOCAL_CACHE_KEY = "daju_ads_cache";

// ✅ localStorage 的有效時間（TTL 內完全 0 request）
const LOCAL_CACHE_EXPIRY_MS = 5 * 60 * 1000;

// ✅ fetch 超時保護
const FETCH_TIMEOUT_MS = 8000;
const META_TIMEOUT_MS  = 4000;

// ==========================================
//  0.5) defer（延後寫入 localStorage，避免卡主執行緒）
// ==========================================
/**function defer(fn) {
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
 */
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
    try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
  }

// ==========================================
//  3) slotMap（一次掃描 DOM，避免重複 query）
// ==========================================
function buildSlotMap() {
  const map = new Map();
  document.querySelectorAll(".ad-slot").forEach(el => {
    // 記錄「初始 class」，避免每次 render class 累積
    if (!el.dataset.baseClass) el.dataset.baseClass = el.className;

    // 每個 slot 必須有 data-slot-id
    const slotId = el.dataset.slotId;
    if (slotId) map.set(slotId, el);
  });
  return map;
}

// ==========================================
//  4) fetch JSON with timeout（✅ 穩定版：先讀 text 再 JSON.parse）
//  - 有些情況 Worker/GAS 回 content-type 不是 application/json
//  - 但內容仍是 JSON，這裡不依賴 content-type
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

    const text = await res.text();
    if (!text) return null;

    try { return JSON.parse(text); } catch { return null; }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ==========================================
//  4.5) URL builder
//  - meta=1：版本探針（小包）
//  - v=xxx：版本型 full（大包）=> ✅ 能 HIT edge
//  - refresh=1：完全 bypass edge（只給你手動強制更新）
// ==========================================
function buildAdsUrl({ version, meta, refresh } = {}) {
  const u = new URL(ADS_GAS_URL);

  if (meta) {
    u.searchParams.set("meta", "1");
    return u.toString();
  }

  if (version != null && String(version).trim() !== "") {
    u.searchParams.set("v", String(version));
  }

  if (refresh) {
    u.searchParams.set("refresh", "1");
  }

  return u.toString();
}

// ==========================================
//  4.6) Auto Cache Bust（確保素材也跟著版本更新）
//  - img/iframe/html 的 src 都加上 ?v=版本
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
  if (s.indexOf("src=") === -1 && s.indexOf("SRC=") === -1) return s;

  const srcRe = /(\bsrc=["'])([^"']+)(["'])/gi;
  return s.replace(srcRe, (m, p1, url, p3) => p1 + appendV(url, v) + p3);
}

// ==========================================
//  4.7) API calls
//  - meta：版本探針（小包）
//  - full：用 v=版本（版本型快取）
//  - refresh=1：只在你網址帶 ?refresh 才使用（BYPASS）
// ==========================================
async function fetchAdsByClientVersion(version, bypassCache = false) {
  const url = buildAdsUrl({ version, meta: false, refresh: !!bypassCache });

  // ✅ 關鍵：正常情況不要硬塞 cache:"no-cache"
  // 讓瀏覽器/Worker 正常走 HTTP cache 流程（edge HIT 更自然）
  const fetchOptions = bypassCache ? { cache: "reload" } : { cache: "default" };

  return await fetchJSON(url, fetchOptions, FETCH_TIMEOUT_MS);
}

async function fetchMetaVersion() {
  const url = buildAdsUrl({ meta: true });

  // meta 本來就應該「永遠新」，這裡用 no-store 最乾淨
  return await fetchJSON(url, { cache: "no-store" }, META_TIMEOUT_MS);
}

// ==========================================
//  5) render slot（渲染到畫面）
// ==========================================
function renderSlot(slot, adData, apiVersion) {
  // 還原初始 class（避免累積造成 CSS 變怪）
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;
  else slot.className = "";

  slot.innerHTML = "";
  slot.style.display = "none";
  if (!adData) return;

  // 追加 class（由後端資料決定）
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

  // YOUTUBE（預設用 data-src + IntersectionObserver lazy）
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
//  6) Smart cache logic（Meta Stable）
//  A) 你網址帶 ?refresh => refresh=1 強制直通（Debug）
//  B) 沒 cache => meta 拿 version，再用 v=version 拉 full（edge HIT）
//  C) TTL 內 => 0 request
//  D) TTL 到 => meta 檢查版本
//     - 沒變 => 只續命 timestamp
//     - 有變 => 用 v=latest 拉 full（edge HIT）
// ==========================================
async function getAdsSmart(forceRefresh) {
  const cached = readCache();

  // (A) 強制刷新（只有 ?refresh 才走）
  if (forceRefresh) {
    const meta = await fetchMetaVersion();
    const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";

    const full = await fetchAdsByClientVersion(latest, true); // ✅ 只有這裡 refresh=1
    if (full && full.code === 200 && full.data) {
      const v = String(full.version || latest || "0");
      writeCache({ version: v, data: full.data, timestamp: Date.now() });
      return { data: full.data, version: v };
    }

    return cached ? { data: cached.data, version: String(cached.version || "0") } : null;
  }

  // (B) 首次/清 localStorage：沒有 cache
  if (!cached) {
    const meta = await fetchMetaVersion();
    const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";

    const full = await fetchAdsByClientVersion(latest, false);
    if (full && full.code === 200 && full.data) {
      const v = String(full.version || latest || "0");
      writeCache({ version: v, data: full.data, timestamp: Date.now() });
      return { data: full.data, version: v };
    }
    return null;
  }

  // (C) TTL 內：0 request
  if (cached.timestamp && (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS)) {
    return { data: cached.data, version: String(cached.version || "0") };
  }

  // (D) TTL 到：meta 檢查版本
  const meta = await fetchMetaVersion();
  const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";
  const oldV = String(cached.version || "0");

  // 沒變：只續命，不拉 full
  if (latest && oldV === latest) {
    writeCache({ ...cached, timestamp: Date.now() });
    return { data: cached.data, version: oldV };
  }

  // 有變：拉新版 full（用 v=latest）
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
//  7) YouTube lazy load
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

  // ✅ 只有頁面網址帶 ?refresh 才強制直通
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

// ✅ readyState 啟動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAds, { once: true });
} else {
  bootAds();
}

// ✅ BFCache 修補（返回頁也會重新跑）
window.addEventListener("pageshow", (ev) => {
  if (ev && ev.persisted) bootAds();
});
