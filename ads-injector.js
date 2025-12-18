/**
 * Daju Ad Management System (V3.2) - 整合 CSS 注入版
 * 功能：雙重快取、YouTube RWD、CSS 自動注入、多頁面支持
 */

const ADS_GAS_URL = "https://script.google.com/macros/s/AKfycbzvA6Q69iJK4BCBmyhv2BLNClxqJw3Fk6i3KZqQwU5BSda1Ls4BSoFQDyC8ikL12HRJ/exec";
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY = 60;

// 1. 自動注入 CSS 樣式
function injectStyles() {
    if (document.getElementById('daju-ad-manager-styles')) return;
    const style = document.createElement('style');
    style.id = 'daju-ad-manager-styles';
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

// 2. 核心注入邏輯
async function insertAds() {
    injectStyles(); // 啟動時先注入 CSS
    
    let ads = null;
    const forceRefresh = new URLSearchParams(window.location.search).has('refresh');

    // 嘗試讀取本地快取
    const cached = localStorage.getItem(LOCAL_CACHE_KEY);
    if (cached && !forceRefresh) {
        const cacheObj = JSON.parse(cached);
        if (Date.now() - cacheObj.timestamp < LOCAL_CACHE_EXPIRY) {
            ads = cacheObj.data;
        }
    }

    // 抓取遠端資料 (若無快取)
    if (!ads) {
        try {
            const res = await fetch(ADS_GAS_URL);
            ads = await res.json();
            localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ data: ads, timestamp: Date.now() }));
        } catch (err) { return; }
    }

    // 渲染廣告
    document.querySelectorAll('.ad-slot').forEach(slot => {
        const slotId = slot.dataset.slotId;
        const adData = ads[slotId];

        if (adData) {
            slot.textContent = ''; 
            let hasContent = false;

            // 處理 Class 注入
            if (adData.class) {
                adData.class.split(' ').forEach(cls => { if(cls) slot.classList.add(cls.trim()); });
            }

            // A. 圖片渲染 (D 欄)
            if (adData.type === "image" && adData.img) {
                const a = document.createElement('a');
                a.href = adData.link || "#";
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                const img = document.createElement('img');
                img.src = adData.img;
                img.alt = adData.alt || "廣告圖片";
                a.appendChild(img);
                slot.appendChild(a);
                hasContent = true;
            } 
            // B. YouTube RWD 渲染 (F 欄)
            else if (adData.type === "youtube" && adData.video) {
                const wrapper = document.createElement('div');
                wrapper.className = "ad-video-wrapper";
                wrapper.innerHTML = `<iframe src="${adData.video}" allowfullscreen title="${adData.title || 'video'}"></iframe>`;
                slot.appendChild(wrapper);
                hasContent = true;
            } 
            // C. HTML 渲染 (G 欄)
            else if (adData.type === "html" && adData.html) {
                slot.innerHTML = adData.html;
                hasContent = true;
            }

            if (hasContent) slot.style.display = 'block';
        } else {
            slot.style.display = 'none';
        }
    });
}

// 監聽 DOM 載入
document.addEventListener("DOMContentLoaded", insertAds);
