/**
 * Daju Ad Management System (V3.8 - Final Optimized)
 * 優化重點：移除多餘 Meta 請求、修正 304 續命 Bug、提升瀏覽器相容性
 */

const ADS_GAS_URL = "https://script.google.com/macros/s/AKfycbzvA6Q69iJK4BCBmyhv2BLNClxqJw3Fk6i3KZqQwU5BSda1Ls4BSoFQDyC8ikL12HRJ/exec";
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY_MS = 15 * 60 * 1000; // 15 分鐘

// 1) 自動注入 CSS
function injectStyles() {
  if (document.getElementById("daju-ad-manager-styles")) return;
  const style = document.createElement("style");
  style.id = "daju-ad-manager-styles";
  style.textContent = `
    .ad-slot { width: 100%; margin: 20px 0; display: none; overflow: hidden; }
    .ad-slot img { display: block; width: 100%; height: auto; object-fit: cover; }
    .ad-video-wrapper {
      position: relative; width: 100%; height: 0;
      padding-bottom: 56.25%; overflow: hidden; background: #000;
    }
    .ad-video-wrapper iframe {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;
    }
    .ad-fade-in { animation: adFadeIn 0.5s ease-in forwards; }
    @keyframes adFadeIn { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(style);
}

// 2) localStorage helpers
function readCache() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "null"); } 
  catch { return null; }
}

function writeCache(obj) {
  try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(obj)); } catch {}
}

// 3) slotMap
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

// 4) 取得資料 (優化 URL 處理)
async function fetchAdsByClientVersion(cachedVersion) {
  const v = (cachedVersion != null && String(cachedVersion).trim() !== "") ? encodeURIComponent(String(cachedVersion)) : "";
  // ✅ 優化點 1：空版本時直接打主網址，不帶多餘的 ?v=
  const url = v ? `${ADS_GAS_URL}?v=${v}` : ADS_GAS_URL;
  const res = await fetch(url, { cache: "no-store" });
  return await res.json();
}

// 5) YouTube lazy
function setupLazyIframes() {
  const iframes = document.querySelectorAll("iframe[data-src]");
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

// 6) 渲染
function renderSlot(slot, adData) {
  if (slot.dataset.baseClass != null) slot.className = slot.dataset.baseClass;
  if (!adData) { slot.style.display = "none"; return; }

  // ✅ 優化點 4：相容性更好的清空方式
  slot.innerHTML = ""; 

  if (adData.class) {
    adData.class.split(/\s+/).forEach(cls => {
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
    img.alt = adData.alt || "房產廣告";
    img.loading = "lazy";
    a.appendChild(img);
    slot.appendChild(a);
    hasContent = true;
  } else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";
    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", adData.video);
    iframe.allowFullscreen = true;
    wrapper.appendChild(iframe);
    slot.appendChild(wrapper);
    hasContent = true;
  } else if (adData.type === "html" && adData.html) {
    slot.innerHTML = adData.html;
    hasContent = true;
  }

  if (hasContent) {
    slot.style.display = "block";
    slot.classList.add("ad-fade-in");
  }
}

// 7) 智慧快取與請求核心 (優化點 2 & 3)
async function getAdsSmart(forceRefresh) {
  const cached = readCache();

  // 🚀 首次/強制載入：1 次請求 (不帶 v，直接拿全量)
  if (!cached || forceRefresh) {
    console.log("⚡ 首次/強制載入");
    try {
      const full = await fetchAdsByClientVersion("");
      if (full && full.code === 200 && full.data) {
        writeCache({ version: String(full.version), data: full.data, timestamp: Date.now() });
        return full.data;
      }
    } catch (e) { console.error("Initial load failed", e); }
    return cached ? cached.data : null;
  }

  // 🚀 15 分鐘內：0 請求 (秒開)
  if (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS) {
    return cached.data;
  }

  // 🚀 15 分鐘後：1 次請求 (?v=版本協議)
  try {
    const check = await fetchAdsByClientVersion(cached.version);

    // ✅ 優化點 3：304 狀態也必須寫回 timestamp，避免後續每次載入都打 API
    if (check && (check.code === 304 || check.notModified)) {
      writeCache({ ...cached, timestamp: Date.now() }); 
      return cached.data;
    }

    // 版本不同 (200 OK + data)
    if (check && check.code === 200 && check.data) {
      writeCache({ version: String(check.version), data: check.data, timestamp: Date.now() });
      return check.data;
    }

    return cached.data; // 失敗時保底回傳舊的
  } catch (err) {
    return cached.data;
  }
}

// 8) 主流程
async function insertAds() {
  injectStyles();
  const forceRefresh = new URLSearchParams(window.location.search).has("refresh");
  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  const ads = await getAdsSmart(forceRefresh);
  if (!ads) return;

  slotMap.forEach((slot, slotId) => {
    renderSlot(slot, ads[slotId]);
  });
  setupLazyIframes();
}

document.addEventListener("DOMContentLoaded", insertAds);
