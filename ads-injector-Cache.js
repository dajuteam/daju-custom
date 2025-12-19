/**
 * Daju Ad Management System (V3.9 - UX Hardened)
 * 核心：骨架屏載入、零版面跳動 (CLS Optimized)、智慧快取
 */

const ADS_GAS_URL = "https://script.google.com/macros/s/AKfycbzvA6Q69iJK4BCBmyhv2BLNClxqJw3Fk6i3KZqQwU5BSda1Ls4BSoFQDyC8ikL12HRJ/exec";
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY_MS = 15 * 60 * 1000; 

// 1) 注入 CSS (含骨架屏與轉圈)
function injectStyles() {
  if (document.getElementById("daju-ad-manager-styles")) return;
  const style = document.createElement("style");
  style.id = "daju-ad-manager-styles";
  style.textContent = `
    .ad-slot { width: 100%; margin: 20px 0; display: none; overflow: hidden; position: relative; }
    .ad-slot img { display: block; width: 100%; height: auto; object-fit: cover; }
    
    /* Loading 狀態與預留高度 */
    .ad-slot.is-loading {
      display: block;
      min-height: 120px; 
      background: #f9f9f9;
      border-radius: 6px;
    }

    /* 骨架屏閃爍動畫 */
    .ad-skeleton {
      position: absolute; inset: 0;
      background: linear-gradient(90deg, #f3f3f3 25%, #ededed 37%, #f3f3f3 63%);
      background-size: 400% 100%;
      animation: adShimmer 1.4s ease infinite;
    }
    @keyframes adShimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }

    /* 微型轉圈 */
    .ad-loading-spinner {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 20px; height: 20px;
      border: 2px solid #eee; border-top-color: #aaa;
      border-radius: 50%; animation: adSpin 0.8s linear infinite;
    }
    @keyframes adSpin { to { transform: rotate(360deg); } }

    .ad-video-wrapper { position: relative; width: 100%; padding-bottom: 56.25%; background: #000; }
    .ad-video-wrapper iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    .ad-fade-in { animation: adFadeIn 0.5s ease-in forwards; }
    @keyframes adFadeIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

// 2) 輔助函式
function readCache() { try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY)); } catch { return null; } }
function writeCache(obj) { try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {} }

// 3) 初始化 SlotMap 並加上 Loading 層
function buildSlotMap() {
  const nodes = document.querySelectorAll(".ad-slot");
  const map = new Map();
  nodes.forEach(el => {
    if (!el.dataset.baseClass) el.dataset.baseClass = el.className;
    
    // ✅ 進入載入狀態
    el.classList.add("is-loading");
    el.innerHTML = '<div class="ad-skeleton"></div><div class="ad-loading-spinner"></div>';
    
    const slotId = el.dataset.slotId;
    if (slotId) map.set(slotId, el);
  });
  return map;
}

// 4) 取得資料 URL 處理
async function fetchAdsByClientVersion(cachedVersion) {
  const v = (cachedVersion != null && String(cachedVersion).trim() !== "") ? encodeURIComponent(String(cachedVersion)) : "";
  const url = v ? `${ADS_GAS_URL}?v=${v}` : ADS_GAS_URL;
  const res = await fetch(url, { cache: "no-store" });
  return await res.json();
}

// 5) 渲染單一插槽
function renderSlot(slot, adData) {
  // 移除 Loading 狀態
  slot.classList.remove("is-loading");
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;

  if (!adData) {
    slot.style.display = "none";
    slot.innerHTML = "";
    return;
  }

  slot.innerHTML = ""; // 清空 Skeleton

  if (adData.class) {
    adData.class.split(/\s+/).forEach(cls => { if (cls.trim()) slot.classList.add(cls.trim()); });
  }

  let hasContent = false;
  if (adData.type === "image" && adData.img) {
    const a = document.createElement("a");
    a.href = adData.link || "#"; a.target = "_blank"; a.rel = "noopener noreferrer";
    const img = document.createElement("img");
    img.src = adData.img; img.alt = adData.alt || "廣告"; img.loading = "lazy";
    a.appendChild(img); slot.appendChild(a); hasContent = true;
  } else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";
    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", adData.video);
    iframe.allowFullscreen = true;
    wrapper.appendChild(iframe); slot.appendChild(wrapper); hasContent = true;
  } else if (adData.type === "html" && adData.html) {
    slot.innerHTML = adData.html; hasContent = true;
  }

  if (hasContent) {
    slot.style.display = "block";
    slot.classList.add("ad-fade-in");
  } else {
    slot.style.display = "none";
  }
}

// 6) 智慧快取請求
async function getAdsSmart(forceRefresh) {
  const cached = readCache();
  if (!cached || forceRefresh) {
    try {
      const full = await fetchAdsByClientVersion("");
      if (full && full.code === 200) {
        writeCache({ version: String(full.version), data: full.data, timestamp: Date.now() });
        return full.data;
      }
    } catch (e) { console.error("Load failed", e); }
    return cached ? cached.data : null;
  }

  if (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS) return cached.data;

  try {
    const check = await fetchAdsByClientVersion(cached.version);
    if (check && (check.code === 304 || check.notModified)) {
      writeCache({ ...cached, timestamp: Date.now() });
      return cached.data;
    }
    if (check && check.code === 200 && check.data) {
      writeCache({ version: String(check.version), data: check.data, timestamp: Date.now() });
      return check.data;
    }
  } catch (err) { return cached.data; }
  return cached.data;
}

// 7) YouTube Lazy Load
function setupLazyIframes() {
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const iframe = entry.target;
      iframe.src = iframe.getAttribute("data-src");
      iframe.removeAttribute("data-src");
      obs.unobserve(iframe);
    });
  }, { rootMargin: "200px 0px" });
  document.querySelectorAll("iframe[data-src]").forEach(f => io.observe(f));
}

// 8) 主流程
async function insertAds() {
  injectStyles();
  const forceRefresh = new URLSearchParams(window.location.search).has("refresh");
  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  const ads = await getAdsSmart(forceRefresh);
  if (!ads) {
    slotMap.forEach(slot => { slot.style.display = "none"; slot.innerHTML = ""; });
    return;
  }

  slotMap.forEach((slot, slotId) => { renderSlot(slot, ads[slotId]); });
  setupLazyIframes();
}

document.addEventListener("DOMContentLoaded", insertAds);
