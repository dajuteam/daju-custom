/**
 * 大橘廣告管理系統API版本 (V4.5 - Meta Stable Version)
 * Daju Ad Management System (V4.5 - Meta Stable Version)
 * 核心：釋放 Cloudflare Edge Cache、?refresh 真正繞過快取、請求超時保護、零 CLS 跳動
 * 變更（相容不破壞）：
 * 1) 15 分鐘後改為「meta=1 版本檢查」→ 版本不同直接 refresh=1 拉 full（更穩，不依賴 304）
 * 2) 其餘 render / slot / lazy iframe / CSS 完全保留原邏輯
 *
 * ✅ 使用方式
 * 1) 把 ADS_GAS_URL 指向你的 Cloudflare Worker URL
 * 2) HTML <head> 建議加 preconnect（可選）：
 * <link rel="preconnect" href="https://daju-ads-injector-api.dajuteam88.workers.dev" crossorigin>
 *
 * ✅ 強制更新
 * 網址帶 ?refresh 會繞過 Edge 快取並強制回源拿最新：
 * https://yoursite.com/page?refresh
 */

// ==========================================
//  0) 全域設定
// ==========================================
const ADS_GAS_URL = "https://daju-ads-injector-api.dajuteam88.workers.dev"; // ← 改成你的 Worker
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY_MS = 15 * 60 * 1000; // 15 分鐘

// 🌐 fetch 超時保護
const FETCH_TIMEOUT_MS = 8000;

// ==========================================
//  1) CSS 注入 (僅保留廣告核心樣式)
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
// ==========================================
function readCache() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } catch { return null; }
}
function writeCache(obj) {
  try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
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
//  4) fetch JSON with timeout
// ==========================================
async function fetchJSON(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ✅ 取得資料：移除 no-store，釋放 Edge Cache
// ✅ ?refresh：真正繞過快取（URL 也變，確保 CF cache key 不同）
async function fetchAdsByClientVersion(cachedVersion, bypassCache = false) {
  const hasV = cachedVersion != null && String(cachedVersion).trim() !== "";
  const baseUrl = hasV ? `${ADS_GAS_URL}?v=${encodeURIComponent(String(cachedVersion))}` : ADS_GAS_URL;

  const url = bypassCache
    ? (baseUrl + (baseUrl.includes("?") ? "&" : "?") + "refresh=1")
    : baseUrl;

  // 瀏覽器端提示：若 refresh 則用 reload（但真正繞過靠 URL + Worker）
  const fetchOptions = bypassCache ? { cache: "reload" } : {};
  return await fetchJSON(url, fetchOptions);
}

// ✅ 新增：meta 版本檢查（超輕量）
async function fetchMetaVersion() {
  // meta 本身很省，timeout 可以短一點
  return await fetchJSON(`${ADS_GAS_URL}?meta=1`, {}, 4000);
}

// ==========================================
//  5) render slot
// ==========================================
function renderSlot(slot, adData) {
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;

  if (!adData) {
    slot.style.display = "none";
    slot.innerHTML = "";
    return;
  }

  slot.innerHTML = "";

  if (adData.class) {
    String(adData.class).split(/\s+/).forEach(cls => {
      if (cls.trim()) slot.classList.add(cls.trim());
    });
  }

  let hasContent = false;

  if (adData.type === "image" && adData.img) {
    const a = document.createElement("a");
    a.href = adData.link || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const img = document.createElement("img");
    img.src = adData.img;
    img.loading = "lazy";
    img.setAttribute("decoding", "async");
    img.alt = adData.alt || adData.title || "房產廣告";

    a.appendChild(img);
    slot.appendChild(a);
    hasContent = true;

  } else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", adData.video);
    iframe.allowFullscreen = true;
    iframe.title = adData.title || "video";

    wrapper.appendChild(iframe);
    slot.appendChild(wrapper);
    hasContent = true;

  } else if (adData.type === "html" && adData.html) {
    // ⚠️ 注意：此處會直接插入 HTML（請確保 GAS 表格內容可控）
    slot.innerHTML = adData.html;
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
// ==========================================
async function getAdsSmart(forceRefresh) {
  const cached = readCache();

  // 首次/強制：1 次請求（不帶 v；若 forceRefresh 則 refresh=1）
  if (!cached || forceRefresh) {
    try {
      const full = await fetchAdsByClientVersion("", forceRefresh);
      if (full && full.code === 200 && full.data) {
        writeCache({ version: String(full.version || "0"), data: full.data, timestamp: Date.now() });
        return full.data;
      }
    } catch (e) {
      console.error("Load failed:", e);
    }
    return cached ? cached.data : null;
  }

  // 15 分鐘內：0 請求
  if (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS) {
    return cached.data;
  }

  // 15 分鐘後：✅ 先 meta 檢查（更穩，不依賴 304）
  try {
    const meta = await fetchMetaVersion();
    const latest = meta && meta.code === 200 ? String(meta.version || "0") : "";

    // 版本沒變：續命 timestamp（避免每次都打 full）
    if (latest && String(cached.version || "0") === latest) {
      writeCache({ ...cached, timestamp: Date.now() });
      return cached.data;
    }

    // 版本有變：直接 refresh=1 拉 full（保證立刻更新，不需使用者加 ?refresh）
    const full = await fetchAdsByClientVersion("", true);
    if (full && full.code === 200 && full.data) {
      writeCache({ version: String(full.version || "0"), data: full.data, timestamp: Date.now() });
      return full.data;
    }

    // meta 失敗或 full 失敗：退回舊資料（穩）
    writeCache({ ...cached, timestamp: Date.now() });
    return cached.data;

  } catch (err) {
    // 任何錯誤：退回舊資料（穩）
    writeCache({ ...cached, timestamp: Date.now() });
    return cached.data;
  }
}

// ==========================================
//  7) YouTube lazy load
// ==========================================
function setupLazyIframes() {
  if (!("IntersectionObserver" in window)) {
    // fallback：直接載入（舊瀏覽器）
    document.querySelectorAll("iframe[data-src]").forEach(f => {
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

  document.querySelectorAll("iframe[data-src]").forEach(f => io.observe(f));
}

// ==========================================
//  8) Main
// ==========================================
async function insertAds() {
  injectStyles();

  const params = new URLSearchParams(window.location.search);
  const forceRefresh = params.has("refresh");

  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  const ads = await getAdsSmart(forceRefresh);
  if (!ads) return;

  slotMap.forEach((slot, slotId) => renderSlot(slot, ads[slotId]));
  setupLazyIframes();
}

document.addEventListener("DOMContentLoaded", insertAds);
