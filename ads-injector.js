/**
 * Daju Ad Management System (V3.5) - GAS Version Protocol
 * 功能：修快取(ms)、slotMap、YouTube lazy、CSS 自動注入、多頁面支持、版本協議(meta/v)
 */

const ADS_GAS_URL = "https://script.google.com/macros/s/AKfycbzvA6Q69iJK4BCBmyhv2BLNClxqJw3Fk6i3KZqQwU5BSda1Ls4BSoFQDyC8ikL12HRJ/exec";
const LOCAL_CACHE_KEY = "daju_ads_cache";

// ✅ 修正：原本 60 是毫秒，會幾乎每次都重抓。這裡改成「毫秒」。
// 你可以依需求調整，例如 10 分鐘：10 * 60 * 1000
const LOCAL_CACHE_EXPIRY_MS = 60 * 1000; // 60 秒

// 1) 自動注入 CSS 樣式
function injectStyles() {
  if (document.getElementById("daju-ad-manager-styles")) return;

  const style = document.createElement("style");
  style.id = "daju-ad-manager-styles";
  style.textContent = `
    /* 基礎插槽樣式 */
    .ad-slot { width: 100%; margin: 20px 0; display: none; }
    .ad-slot img { display: block; width: 100%; height: auto; object-fit: cover; }

    /* YouTube RWD 響應式容器 */
    .ad-video-wrapper {
      position: relative; width: 100%; height: 0;
      padding-bottom: 56.25%; overflow: hidden;
    }
    .ad-video-wrapper iframe {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;
    }

    /* 選項：預設的 contact-btn 樣式 */
    .contact-btn { border-radius: 8px; transition: transform 0.2s; }
    .contact-btn:hover { transform: translateY(-2px); }
  `;
  document.head.appendChild(style);
}

// 2) localStorage helpers
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

// 3) slotMap（一次掃描 DOM）
function buildSlotMap() {
  const nodes = document.querySelectorAll(".ad-slot");
  const map = new Map();
  nodes.forEach(el => {
    // ✅ 記住原始 class（避免後續 render 累積 class）
    if (!el.dataset.baseClass) el.dataset.baseClass = el.className;

    const slotId = el.dataset.slotId;
    if (slotId) map.set(slotId, el);
  });
  return map;
}


// 4) GAS 版本協議：只拿版本（小封包）
async function fetchMetaVersion() {
  const res = await fetch(`${ADS_GAS_URL}?meta=1`, { cache: "no-store" });
  const json = await res.json();
  return json && json.version ? String(json.version) : "0";
}

// 5) GAS 版本協議：帶 v=舊版本問是否更新（類 304）
async function fetchAdsByClientVersion(cachedVersion) {
  const v = cachedVersion ? encodeURIComponent(String(cachedVersion)) : "";
  const res = await fetch(`${ADS_GAS_URL}?v=${v}`, { cache: "no-store" });
  return await res.json();
}

// 6) YouTube lazy：進入視窗才設定 iframe src
function setupLazyIframes() {
  const iframes = document.querySelectorAll("iframe[data-src]");
  if (!iframes.length) return;

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const iframe = entry.target;
      const src = iframe.getAttribute("data-src");
      if (src) iframe.setAttribute("src", src);
      iframe.removeAttribute("data-src");
      obs.unobserve(iframe);
    });
  }, { rootMargin: "200px 0px" });

  iframes.forEach(f => io.observe(f));
}

// 7) 渲染單一 slot
function renderSlot(slot, adData) {
  // ✅ 先還原 slot 的原始 class，避免每次 render 都把舊 class 累積起來
  if (slot.dataset.baseClass != null) {
    slot.className = slot.dataset.baseClass;
  }

  if (!adData) {
    slot.style.display = "none";
    return;
  }

  // 清空內容（比 textContent 更乾淨）
  slot.replaceChildren();

  // Class 注入（保留原本行為，但不再累積）
  if (adData.class) {
    adData.class.split(/\s+/).forEach(cls => {
      const c = (cls || "").trim();
      if (c) slot.classList.add(c);
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
    img.alt = adData.alt || "廣告圖片";
    img.loading = "lazy";
    img.decoding = "async";

    a.appendChild(img);
    slot.appendChild(a);
    hasContent = true;
  }

  // B) youtube（延遲載入 src）
  else if (adData.type === "youtube" && adData.video) {
    const wrapper = document.createElement("div");
    wrapper.className = "ad-video-wrapper";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-src", adData.video); // ✅ lazy
    iframe.allowFullscreen = true;
    iframe.title = adData.title || "video";

    wrapper.appendChild(iframe);
    slot.appendChild(wrapper);
    hasContent = true;
  }

  // C) html
  else if (adData.type === "html" && adData.html) {
    // ⚠️ 仍使用 innerHTML（你原本就這樣）；html 來源若只由你控制，OK
    slot.innerHTML = adData.html;
    hasContent = true;
  }

  slot.style.display = hasContent ? "block" : "none";
}

// 8) 取得 ads（極速優化版：減少往返請求次數）
async function getAdsSmart(forceRefresh) {
  const cached = readCache(); // { version, data, timestamp }

  // 🚀 優化 A：如果「完全沒有快取」或「強制更新」
  // 直接打一次完整請求，不要先打 meta，這樣可以減少一次 GAS 冷啟動等待。
  if (!cached || forceRefresh) {
    console.log("⚡ 首次載入或強制更新：執行單次全量請求");
    try {
      const full = await fetchAdsByClientVersion(""); // v="" 代表直接索取資料
      if (full && full.code === 200 && full.data) {
        writeCache({ 
          version: String(full.version || "0"), 
          data: full.data, 
          timestamp: Date.now() 
        });
        return full.data;
      }
    } catch (e) {
      console.error("Fetch full ads failed:", e);
    }
    return cached ? cached.data : null;
  }

  // 🚀 優化 B：若本地快取仍在 60 秒有效期內 → 秒開 (不與後端交涉)
  const isFresh = (Date.now() - cached.timestamp < LOCAL_CACHE_EXPIRY_MS);
  if (isFresh && cached.data) {
    return cached.data;
  }

  // 🚀 優化 C：快取過期，但我們有舊資料 → 先拿 Meta 比對版本 (小封包)
  try {
    const latestVersion = await fetchMetaVersion();
    
    // 版本一致：延長本地快取壽命，不下載 Data
    if (String(cached.version) === String(latestVersion)) {
      writeCache({ ...cached, timestamp: Date.now() });
      return cached.data;
    }

    // 版本不一致：帶 v 參數去抓新的 (後端會判斷回 200 或 304)
    const check = await fetchAdsByClientVersion(cached.version);
    if (check && check.code === 200 && check.data) {
      writeCache({ 
        version: String(check.version || latestVersion), 
        data: check.data, 
        timestamp: Date.now() 
      });
      return check.data;
    } else if (check && check.code === 304) {
      writeCache({ ...cached, timestamp: Date.now() });
      return cached.data;
    }
  } catch (err) {
    console.warn("Smart check failed, fallback to stale cache.");
    return cached.data; // 網路出錯時，至少還有舊廣告可以看
  }

  return cached.data;
}

// 9) 主流程
async function insertAds() {
  injectStyles();

  const forceRefresh = new URLSearchParams(window.location.search).has("refresh");

  // slotMap：一次掃描
  const slotMap = buildSlotMap();
  if (!slotMap.size) return;

  const ads = await getAdsSmart(forceRefresh);
  if (!ads) return;

  // 渲染
  slotMap.forEach((slot, slotId) => {
    renderSlot(slot, ads[slotId]);
  });

  // YouTube lazy 啟動
  setupLazyIframes();
}

// 監聽 DOM 載入
document.addEventListener("DOMContentLoaded", insertAds);
