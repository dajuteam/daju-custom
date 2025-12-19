/**
 * Daju Ad Management System (V4.0 - UX Clean Final)
 * 核心：不顯示九宮格灰塊、不製造 CLS、智慧快取、版本協議、YouTube Lazy
 *
 * ✅ UX 原則：
 * - 預設不動任何 .ad-slot（維持 display:none），避免 9 個灰塊跳動
 * - 只有「需要打網路」時顯示 1 個全域小提示（右下角）
 * - 有廣告的 slot 資料回來才顯示 + 淡入
 *
 * ✅ 快取原則：
 * - 首次/refresh：抓全量
 * - 15 分鐘內：0 請求
 * - 15 分鐘後：打 1 次 ?v=cached.version（304 續命 / 200 更新）
 */

const ADS_GAS_URL = "https://script.google.com/macros/s/AKfycbzvA6Q69iJK4BCBmyhv2BLNClxqJw3Fk6i3KZqQwU5BSda1Ls4BSoFQDyC8ikL12HRJ/exec";
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY_MS = 15 * 60 * 1000; // 15 分鐘

// ==========================================
//  1) CSS 注入（含全域 loading 提示）
// ==========================================
function injectStyles() {
  if (document.getElementById("daju-ad-manager-styles")) return;

  const style = document.createElement("style");
  style.id = "daju-ad-manager-styles";
  style.textContent = `
    /* slot 基礎 */
    .ad-slot { width: 100%; margin: 20px 0; display: none; overflow: hidden; }
    .ad-slot img { display: block; width: 100%; height: auto; object-fit: cover; }
    .ad-video-wrapper { position: relative; width: 100%; padding-bottom: 56.25%; background: #000; }
    .ad-video-wrapper iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    .ad-fade-in { animation: adFadeIn 0.35s ease-in forwards; }
    @keyframes adFadeIn { from { opacity: 0; } to { opacity: 1; } }

    /* ✅ 全域小提示（不佔版面、不跳動） */
    .daju-ads-loading {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(0,0,0,0.62);
      color: #fff;
      font-size: 12px;
      line-height: 1;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity .18s ease, transform .18s ease;
      pointer-events: none;
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
    }
    .daju-ads-loading.show {
      opacity: 1;
      transform: translateY(0);
    }
    .daju-ads-loading .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.35);
      border-top-color: rgba(255,255,255,0.95);
      border-radius: 50%;
      animation: dajuAdsSpin .8s linear infinite;
      flex: 0 0 auto;
    }
    @keyframes dajuAdsSpin { to { transform: rotate(360deg); } }
  `;

  document.head.appendChild(style);
}

// ==========================================
//  2) localStorage helpers
// ==========================================
function readCache() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}
function writeCache(obj) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

// ==========================================
//  3) 全域 loading UI（只顯示一個）
// ==========================================
function showGlobalLoading() {
  if (document.getElementById("daju-ads-loading")) return;

  const el = document.createElement("div");
  el.id = "daju-ads-loading";
  el.className = "daju-ads-loading";
  el.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>廣告載入中…</span>`;

  // body 可能還沒 ready（極少數），保底塞到 documentElement
  (document.body || document.documentElement).appendChild(el);

  requestAnimationFrame(() => el.classList.add("show"));
}

function hideGlobalLoading() {
  const el = document.getElementById("daju-ads-loading");
  if (!el) return;
  el.classList.remove("show");
  setTimeout(() => {
    try { el.remove(); } catch {}
  }, 220);
}

// ==========================================
//  4) slotMap（不塞 skeleton，避免 9 灰塊）
// ==========================================
function buildSlotMap() {
  const nodes = document.querySelectorAll(".ad-slot");
  const map = new Map();

  nodes.forEach(el => {
    if (!el.dataset.baseClass) el.dataset.baseClass = el.className;
    const slotId = el.dataset.slotId;
    if (slotId) map.set(slotId, el);
  });

  return map;
}

// ==========================================
//  5) 取得資料（空版本就打主網址，不帶 ?v=）
// ==========================================
async function fetchAdsByClientVersion(cachedVersion) {
  const hasV = cachedVersion != null && String(cachedVersion).trim() !== "";
  const url = hasV ? `${ADS_GAS_URL}?v=${encodeURIComponent(String(cachedVersion))}` : ADS_GAS_URL;

  const res = await fetch(url, { cache: "no-store" });
  return await res.json();
}

// ==========================================
//  6) YouTube lazy
// ==========================================
function setupLazyIframes() {
  const iframes = document.querySelectorAll("iframe[data-src]");
  if (!iframes.length) return;

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const iframe = entry.target;
      iframe.src = iframe.getAttribute("data-src");
      iframe.removeAttribute("data-src");
      obs.unobserve(iframe);
    });
  }, { rootMargin: "200px 0px" });

  iframes.forEach(f => io.observe(f));
}

// ==========================================
//  7) 渲染單一 slot
// ==========================================
function renderSlot(slot, adData) {
  // 還原 base class（避免多次 render 汙染 class）
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;

  if (!adData) {
    slot.style.display = "none";
    slot.innerHTML = "";
    return;
  }

  // 清空內容
  slot.innerHTML = "";

  // 安全注入 class
  if (adData.class) {
    String(adData.class).split(/\s+/).forEach(cls => {
      if (cls && cls.trim()) slot.classList.add(cls.trim());
    });
  }

  let hasContent = false;

  // A) image
  if (adData.type === "image" && adData.img) {
    const a = document.createElement("a");
    a.href = adData.link || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const img = document.createElement("img");
    img.src = adData.img;
    img.alt = adData.alt || adData.title || "房產廣告";
    img.loading = "lazy";
    img.setAttribute("decoding", "async");

    a.appendChild(img);
    slot.appendChild(a);
    hasContent = true;
  }
  // B) youtube (lazy)
  else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", adData.video);
    iframe.allowFullscreen = true;
    iframe.title = adData.title || "video";

    wrapper.appendChild(iframe);
    slot.appendChild(wrapper);
    hasContent = true;
  }
  // C) html
  else if (adData.type === "html" && adData.html) {
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
//  8) 智慧快取（一次請求協議）
// ==========================================
async function getAdsSmart(forceRefresh) {
  const cached = readCache();

  // 首次/強制：抓全量（1 次）
  if (!cached || forceRefresh) {
    try {
      const full = await fetchAdsByClientVersion("");
      if (full && full.code === 200 && full.data) {
        writeCache({ version: String(full.version || "0"), data: full.data, timestamp: Date.now() });
        return full.data;
      }
    } catch (e) {
      console.error("Initial/force load failed:", e);
    }
    return cached ? cached.data : null;
  }

  // 15 分鐘內：不打網路
  if (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS) {
    return cached.data;
  }

  // 15 分鐘後：打 1 次 ?v=（304 續命 / 200 更新）
  try {
    const check = await fetchAdsByClientVersion(cached.version);

    if (check && (check.code === 304 || check.notModified)) {
      writeCache({ ...cached, timestamp: Date.now() }); // ✅ 304 續命
      return cached.data;
    }

    if (check && check.code === 200 && check.data) {
      writeCache({ version: String(check.version || "0"), data: check.data, timestamp: Date.now() });
      return check.data;
    }

    return cached.data;
  } catch (err) {
    return cached.data;
  }
}

// ==========================================
//  9) 主流程（只有需要打網路才顯示全域提示）
// ==========================================
async function insertAds() {
  injectStyles();

  const forceRefresh = new URLSearchParams(window.location.search).has("refresh");
  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  // ✅ 預估是否會打網路：首次/過期/強制
  const cached = readCache();
  const likelyFetch =
    forceRefresh ||
    !cached ||
    (cached && (Date.now() - cached.timestamp >= LOCAL_CACHE_EXPIRY_MS));

  if (likelyFetch) showGlobalLoading();

  const ads = await getAdsSmart(forceRefresh);

  if (likelyFetch) hideGlobalLoading();

  if (!ads) return;

  slotMap.forEach((slot, slotId) => {
    renderSlot(slot, ads[slotId]);
  });

  setupLazyIframes();
}

document.addEventListener("DOMContentLoaded", insertAds);
