/**
 * 大橘廣告管理系統API版本 (V4.7.2 - Meta Stable + BFCache Fix + Deferred Cache Write + YT Default Lazy + Versioned Full)
 * 核心：
 * - local TTL：0 request
 * - 過期後 meta=1 探針：版本不同 => refresh=1 拉 full
 * - 自動把 version 加到 img/html/iframe 內資源 URL
 *
 * ✅ 保留你指定的必做優化：
 * 1) pageshow/BFCache
 * 2) writeCache 延後寫入
 * 3) bustHtmlUrls 先 check
 * 4) readyState 啟動
 * 5) fetchJSON 更穩
 *
 * ✅ 本版關鍵修正：
 * - 「拉 full」一律帶上 version（v=...），更吻合版本型 Worker，命中率更高
 * - 首次也先 meta 拿 version，再用 v 拉 full（首讀更穩）
 */

// ==========================================
//  0) 全域設定
// ==========================================
const ADS_GAS_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=ads_injector";
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const META_TIMEOUT_MS = 4000;

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
//  1) CSS 注入
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

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      // 不是 JSON（可能是 HTML 502/403），直接回 null 降成本
      return null;
    }

    try { return await res.json(); } catch { return null; }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ==========================================
//  4.5) URL builder
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
//  4.6) Auto Cache Bust helpers
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
// ==========================================
async function fetchAdsByClientVersion(version, bypassCache = false) {
  const url = buildAdsUrl({ version, meta: false, refresh: !!bypassCache });
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
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;
  else slot.className = "";

  slot.innerHTML = "";
  slot.style.display = "none";

  if (!adData) return;

  if (adData.class) {
    String(adData.class).split(/\s+/).map(s => s.trim()).filter(Boolean).forEach(c => slot.classList.add(c));
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
//  ✅ 本版：拉 full 一律帶 version（更吻合版本型 Worker）
// ==========================================
async function getAdsSmart(forceRefresh) {
  const cached = readCache();

  // ✅ 首次/強制：先 meta 拿版本，再帶 v 拉 full（首讀更穩）
  if (!cached || forceRefresh) {
    const meta = await fetchMetaVersion();
    const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";

    const full = await fetchAdsByClientVersion(latest, true);
    if (full && full.code === 200 && full.data) {
      const v = String(full.version || latest || "0");
      writeCache({ version: v, data: full.data, timestamp: Date.now() });
      return { data: full.data, version: v };
    }

    // fail => fallback cached（如果有）
    return cached ? { data: cached.data, version: String(cached.version || "0") } : null;
  }

  // TTL 內：0 請求
  if (cached.timestamp && (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS)) {
    return { data: cached.data, version: String(cached.version || "0") };
  }

  // TTL 後：meta 檢查
  const meta = await fetchMetaVersion();
  const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";
  const oldV = String(cached.version || "0");

  if (latest && oldV === latest) {
    writeCache({ ...cached, timestamp: Date.now() });
    return { data: cached.data, version: oldV };
  }

  // ✅ 版本有變：refresh=1 拉 full（帶 latest 版本）
  const full = await fetchAdsByClientVersion(latest, true);
  if (full && full.code === 200 && full.data) {
    const v = String(full.version || latest || "0");
    writeCache({ version: v, data: full.data, timestamp: Date.now() });
    return { data: full.data, version: v };
  }

  // fail => fallback
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAds, { once: true });
} else {
  bootAds();
}

window.addEventListener("pageshow", (ev) => {
  if (ev && ev.persisted) bootAds();
});
