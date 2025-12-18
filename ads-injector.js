// 1. 請再次確認這兩個名稱是否跟您其他程式碼一致
const ADS_GAS_URL = "https://script.google.com/macros/s/AKfycbzvA6Q69iJK4BCBmyhv2BLNClxqJw3Fk6i3KZqQwU5BSda1Ls4BSoFQDyC8ikL12HRJ/exec";
const LOCAL_CACHE_KEY = "daju_ads_cache";
const LOCAL_CACHE_EXPIRY = 6 * 60 * 60 * 1000; 

async function insertAds() {
    console.log("--- 廣告系統開始執行 ---");
    let ads = null;

    // 【檢查重點】強制重新整理偵測
    const forceRefresh = new URLSearchParams(window.location.search).has('refresh');

    // 1. 嘗試讀取本地快取
    try {
        const cachedData = localStorage.getItem(LOCAL_CACHE_KEY);
        if (cachedData && !forceRefresh) {
            const cacheObj = JSON.parse(cachedData);
            if (Date.now() - cacheObj.timestamp < LOCAL_CACHE_EXPIRY) {
                ads = cacheObj.data;
                console.log("✅ 成功讀取本地快取資料");
            }
        }
    } catch (e) {
        console.warn("⚠️ 無法讀取 LocalStorage", e);
    }

    // 2. 如果沒快取，則抓取 GAS
    if (!ads) {
        try {
            console.log("🌐 正在連線 GAS 抓取最新廣告...");
            const res = await fetch(ADS_GAS_URL);
            if (!res.ok) throw new Error("網路請求失敗");
            
            ads = await res.json();
            console.log("📥 GAS 回傳原始資料:", ads);

            // 【關鍵點】嘗試寫入快取並立即檢查
            const cacheToSave = { data: ads, timestamp: Date.now() };
            localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cacheToSave));
            
            if (localStorage.getItem(LOCAL_CACHE_KEY)) {
                console.log("✨ LocalStorage 寫入成功！");
            } else {
                console.error("❌ LocalStorage 寫入失敗（原因不明）");
            }
        } catch (err) {
            console.error("❌ GAS 抓取失敗:", err);
            return;
        }
    }

    // 3. 渲染邏輯
    const slots = document.querySelectorAll('.ad-slot');
    slots.forEach(slot => {
        const slotId = slot.dataset.slotId;
        const adData = ads[slotId];

        if (adData) {
            console.log(`🎯 匹配成功: [${slotId}]，開始渲染內容`);
            slot.textContent = ''; // 清空內容
            
            // 執行渲染 (這裡直接寫在裡面確保不報錯)
            if (adData.type === "image" && adData.img) {
                const a = document.createElement('a');
                a.href = adData.link || "#";
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                const img = document.createElement('img');
                img.src = adData.img;
                img.style.width = "100%";
                img.alt = adData.alt || "廣告";
                a.appendChild(img);
                slot.appendChild(a);
            } else if (adData.type === "youtube" && adData.video) {
                slot.innerHTML = `<iframe width="100%" height="315" src="${adData.video}" frameborder="0" allowfullscreen></iframe>`;
            } else if (adData.type === "html" && adData.html) {
                slot.innerHTML = adData.html;
            }
            slot.style.display = 'block';
        } else {
            // 如果沒資料就隱藏
            slot.style.display = 'none';
        }
    });
}

// 啟動 (確保 HTML 載入完畢)
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", insertAds);
} else {
    insertAds();
}
