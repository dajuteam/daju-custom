/**
 * 大橘廣告管理系統API版本 (V4.7.1 - Meta Stable + BFCache Fix + Deferred Cache Write + YT Back to Default Lazy)
 * 核心：
 * - local TTL：0 request
 * - 過期後 meta=1 探針：版本不同 => refresh=1 拉 full
 * - 自動把 version 加到 img/html/iframe 內資源 URL（解「昨天看過今天不更新」）
 *
 * ✅ 保留你指定的必做優化：
 * 1) pageshow/BFCache（不更新最關鍵）
 * 2) writeCache 延後寫入（手機卡頓最關鍵）
 * 3) bustHtmlUrls 先 check（超低成本高回報）
 * 4) readyState 啟動（首屏速度）
 * 5) fetchJSON 更穩（穩定性/例外成本）
 *
 * ❌ 移除：YouTube 縮圖 + 點擊後才載入 iframe
 * ✅ 改回：原本「data-src + IntersectionObserver lazy load」預設讀取方式
 */

// ==========================================
//  0) 全域設定
// ==========================================
const ADS_GAS_URL = "https://daju-unified-route-api.dajuteam88.workers.dev/?type=ads_injector"; // ✅ 共用路由
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 分鐘（你目前設定；先保守）
const FETCH_TIMEOUT_MS = 8000;

// meta timeout（維持你原 4000，但統一成常數好管理）
const META_TIMEOUT_MS = 4000;

// ==========================================
//  0.5) 小工具：排程/延後（避免手機 main thread 瞬間卡）
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
//  1) CSS 注入 (僅保留廣告核心樣式)
//  - ✅ 已移除 YT poster button/overlay 相關樣式（因為回到預設 lazy iframe）
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
//  2) localStorage helpers
//  - ✅ writeCache 延後寫入：避免手機同步 setItem 大字串卡頓
// ==========================================
function readCache() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } catch { return null; }
}
function writeCache(obj) {
  // ✅ 重要：延後到 idle/下一輪 event loop（避免主執行緒瞬間凍結）
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
//  4) fetch JSON with timeout (✅ 更穩)
//  - ✅ 防：非 JSON / 502 HTML / 0 byte / abort
//  - ✅ 回傳 null 而不是丟例外，降低例外成本
// ==========================================
async function fetchJSON(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {}),
        "Accept": "application/json"
      }
    });

    let data = null;
    try { data = await res.json(); } catch { data = null; }

    return data;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ==========================================
//  4.5) URL builder（避免兩個 ? / 拼參數錯）
// ==========================================
function buildAdsUrl({ version, meta, refresh } = {}) {
  const u = new URL(ADS_GAS_URL);

  if (meta) {
    u.searchParams.set("meta", "1");
    return u.toString();
  }

  // A Rule：有 version => PROBE（帶 v），無 version => FULL（不帶 v）
  if (version != null && String(version).trim() !== "") {
    u.searchParams.set("v", String(version));
  }

  if (refresh) {
    u.searchParams.set("refresh", "1");
  }

  return u.toString();
}

// ==========================================
//  4.6) Auto Cache Bust helpers（✅ 新增重點）
// ==========================================
function appendV(url, v) {
  if (!url || !v) return url;
  const s = String(url).trim();
  if (!s) return s;

  // 排除 javascript:, data: 之類（避免污染）
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

// ✅ bustHtmlUrls 先 check（超低成本高回報）
function bustHtmlUrls(html, v) {
  if (!html || !v) return html;

  const s = String(html);
  // ✅ 低成本快檢：沒有 src= 就不用 regex replace
  if (s.indexOf("src=") === -1 && s.indexOf("SRC=") === -1) return s;

  const srcRe = /(\bsrc=["'])([^"']+)(["'])/gi;
  return s.replace(srcRe, (m, p1, url, p3) => p1 + appendV(url, v) + p3);
}

// ✅ 取得資料
async function fetchAdsByClientVersion(cachedVersion, bypassCache = false) {
  const url = buildAdsUrl({
    version: cachedVersion,
    meta: false,
    refresh: !!bypassCache
  });

  const fetchOptions = bypassCache ? { cache: "reload" } : { cache: "no-cache" };
  return await fetchJSON(url, fetchOptions, FETCH_TIMEOUT_MS);
}

// ✅ meta 版本檢查（超輕量）
async function fetchMetaVersion() {
  const url = buildAdsUrl({ meta: true });
  return await fetchJSON(url, { cache: "no-cache" }, META_TIMEOUT_MS);
}

// ==========================================
//  5) render slot（✅ 加入 apiVersion 自動 bust）
//  - ✅ YouTube：回到「data-src + lazy load」預設方式
//  - ✅ Image：只有 link 有值才包 <a>，否則純圖片
// ==========================================
function renderSlot(slot, adData, apiVersion) {
  // ✅ 1. 永遠回到「乾淨基礎狀態」
  if (slot.dataset.baseClass != null) {
    slot.className = slot.dataset.baseClass;
  } else {
    slot.className = "";
  }

  // 清內容
  slot.innerHTML = "";
  slot.style.display = "none";

  // ✅ 2. 沒資料 = 乾淨空 slot
  if (!adData) return;

  // ✅ 3. 本次 render 才決定要不要加 class
  if (adData.class) {
    String(adData.class)
      .split(/\s+/)
      .map(c => c.trim())
      .filter(Boolean)
      .forEach(c => slot.classList.add(c));
  }

  let hasContent = false;

  // --- image ---
  if (adData.type === "image" && adData.img) {
    const img = document.createElement("img");
    img.src = appendV(adData.img, apiVersion); // ✅ bust
    img.loading = "lazy";
    img.setAttribute("decoding", "async");
    img.alt = adData.alt || adData.title || "房產廣告";

    const link = (adData.link != null) ? String(adData.link).trim() : "";

    // ✅ 只有 link 有值才包 <a>，否則純圖片
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

  // --- youtube (back to default lazy iframe) ---
  } else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", appendV(adData.video, apiVersion)); // ✅ bust
    iframe.allowFullscreen = true;
    iframe.title = adData.title || "video";
    iframe.setAttribute("loading", "lazy");
    iframe.referrerPolicy = "strict-origin-when-cross-origin";

    wrapper.appendChild(iframe);
    slot.appendChild(wrapper);
    hasContent = true;

  // --- html ---
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
//  6) Smart cache logic (Meta Stable) ✅ 回傳 {data, version}
//  - ✅ writeCache 已延後（避免手機卡）
// ==========================================
async function getAdsSmart(forceRefresh) {
  const cached = readCache();

  // 首次/強制：1 次請求（不帶 v；若 forceRefresh 則 refresh=1）
  if (!cached || forceRefresh) {
    const full = await fetchAdsByClientVersion("", forceRefresh);
    if (full && full.code === 200 && full.data) {
      const v = String(full.version || "0");
      writeCache({ version: v, data: full.data, timestamp: Date.now() });
      return { data: full.data, version: v };
    }
    return cached ? { data: cached.data, version: String(cached.version || "0") } : null;
  }

  // TTL 內：0 請求
  if (cached.timestamp && (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS)) {
    return { data: cached.data, version: String(cached.version || "0") };
  }

  // TTL 後：先 meta 檢查
  const meta = await fetchMetaVersion();
  const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";
  const oldV = String(cached.version || "0");

  // 版本沒變：續命 timestamp（延後寫入）
  if (latest && oldV === latest) {
    writeCache({ ...cached, timestamp: Date.now() });
    return { data: cached.data, version: oldV };
  }

  // 版本有變：refresh=1 拉 full
  const full = await fetchAdsByClientVersion("", true);
  if (full && full.code === 200 && full.data) {
    const v = String(full.version || latest || "0");
    writeCache({ version: v, data: full.data, timestamp: Date.now() });
    return { data: full.data, version: v };
  }

  // 失敗：退回舊資料（續命 timestamp）
  writeCache({ ...cached, timestamp: Date.now() });
  return { data: cached.data, version: oldV };
}

// ==========================================
//  7) YouTube lazy load（✅ 這就是「原本預設方法」）
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
  }, { rootMargin: "200px 0px" });

  frames.forEach(f => io.observe(f));
}

// ==========================================
//  8) Main
//  - ✅ readyState 啟動（首屏速度）
//  - ✅ pageshow/BFCache：從快取返回也會重跑（不更新最關鍵）
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
    try {
      renderSlot(slot, result.data[slotId], result.version);
    } catch (e) {
      console.error("renderSlot failed:", slotId, e);
    }
  });

  // ✅ YouTube back to default: 這行現在「必要」
  setupLazyIframes();
}

// ✅ readyState：能更早啟動（若 DOM 已 ready 就不等）
function bootAds() {
  try { insertAds(); } catch (e) { console.error(e); }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAds, { once: true });
} else {
  bootAds();
}

// ✅ pageshow/BFCache：從上一頁返回時，DOMContentLoaded 不會再跑
window.addEventListener("pageshow", (ev) => {
  if (ev && ev.persisted) {
    bootAds();
  }
});
