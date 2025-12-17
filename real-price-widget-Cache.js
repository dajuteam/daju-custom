(function () {
  // === 設定區 ===
  const CONFIG = {
    // 請填入部署後的 GAS 網址
    GAS_API_URL: "https://script.google.com/macros/s/AKfycbyDIqujGayWOIOy8lvq8SB-y4Zf6VLVUq2v9pNcrh-pr9Bhv7WKxLW0lmGtoaSglq7s/exec",
    CONTAINER_ID: "real-price-container", // 對應 HTML ID
    STORAGE_KEY: "real_price_local_v2",
    STORAGE_TIME_KEY: "real_price_time_v2",
    EXPIRE_HOURS: 24 // 前端快取保留 24 小時
  };

  // === 1. CSS 樣式注入 (新增 disabled 樣式) ===
  const injectStyles = () => {
    const css = `
      /* === 實價登錄區塊設計 (Mobile First) === */
      .real-price-section {
        max-width: 100%;
        margin: 20px auto;
        border-radius: 12px;
        border: 2px dotted #ffda56;
        background: linear-gradient(to right, #fffaf0, #fff);
        box-sizing: border-box;
        font-family: sans-serif;
      }

      .real-price-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px;
        gap: 20px;
      }

      /* 左側內容 */
      .real-price-left {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      img.real-price-icon {
        width: 50px !important;
        height: auto;
        margin-right: 10px;
        margin-bottom: 10px;
        display: block;
      }

      .real-price-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .real-price-title {
        font-size: 1.4rem;
        font-weight: bold;
        margin: 0;
        letter-spacing: 1px;
        color: #333;
        line-height: 1.4;
      }

      .real-price-subtext {
        font-size: 0.85rem;
        color: gray;
      }

      /* 按鈕樣式 (正常狀態) */
      .real-price-button {
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #ffc107;
        color: black;
        font-size: 1.1rem;
        padding: 12px 20px;
        border-radius: 10px;
        text-decoration: none;
        transition: background-color 0.3s ease, transform 0.2s;
        gap: 10px;
        white-space: nowrap;
        font-weight: 500;
        cursor: pointer;
      }

      .real-price-button:hover {
        background-color: #ffb326;
        color: black;
        transform: translateY(-1px);
      }
      
      /* === 新增：無效按鈕樣式 (灰色/不可點) === */
      .real-price-button.disabled {
        background-color: #e0e0e0 !important; /* 灰色背景 */
        color: #999 !important; /* 灰色文字 */
        cursor: default; /* 滑鼠游標變回預設 */
        pointer-events: none; /* 禁止點擊 */
        transform: none !important; /* 禁止位移 */
        box-shadow: none !important;
      }

      .real-price-button i {
        /* FontAwesome icon */
      }

      /* === 電腦版 (min-width: 992px) === */
      @media screen and (min-width: 992px) {
        .real-price-body {
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
          padding: 20px 30px;
        }

        .real-price-left {
          flex-direction: row;
          align-items: center;
          text-align: left;
        }

        img.real-price-icon {
          margin-bottom: 0;
          margin-right: 15px;
          width: 50px;
        }

        .real-price-text {
          align-items: flex-start;
          text-align: left;
        }

        .real-price-title {
          font-size: 1.5rem;
        }

        .real-price-button {
          font-size: 1.3rem;
          padding: 15px 25px;
        }
      }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);
  };

  // === 2. 資料獲取邏輯 (維持不變) ===
  const getData = async () => {
    const now = new Date().getTime();
    const cachedData = localStorage.getItem(CONFIG.STORAGE_KEY);
    const cachedTime = localStorage.getItem(CONFIG.STORAGE_TIME_KEY);

    if (cachedData && cachedTime && (now - cachedTime < CONFIG.EXPIRE_HOURS * 60 * 60 * 1000)) {
      return JSON.parse(cachedData);
    }

    try {
      const response = await fetch(CONFIG.GAS_API_URL);
      if (!response.ok) throw new Error("API Error");
      const data = await response.json();
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem(CONFIG.STORAGE_TIME_KEY, now);
      return data;
    } catch (error) {
      console.error("實價登錄讀取失敗:", error);
      if (cachedData) return JSON.parse(cachedData);
      return null;
    }
  };

  // === 3. 渲染邏輯 (修改：判斷有無網址來改變文字與樣式) ===
  const render = (url) => {
    const container = document.getElementById(CONFIG.CONTAINER_ID);
    if (!container) return;

    // 判斷是否有網址
    const hasUrl = !!url; // 轉為布林值 (true/false)

    // 設定文字
    const titleText = hasUrl ? "查看本案最新實價登錄" : "查看本案最新實價登錄(更新中)";
    
    // 設定按鈕屬性
    const btnClass = hasUrl ? "real-price-button" : "real-price-button disabled";
    const btnHref = hasUrl ? `href="${url}" target="_blank"` : 'href="javascript:void(0)"'; // 沒網址時給空連結
    const btnIcon = hasUrl ? '<i class="fas fa-external-link-alt" aria-hidden="true"></i>' : '<i class="fas fa-tools" aria-hidden="true"></i>'; // (選擇性) 沒網址可以換個圖示或不顯示

    const html = `
      <div class="real-price-section">
        <div class="real-price-body">
          <div class="real-price-left">
            <img alt="實價登錄圖示" class="real-price-icon" 
              src="https://www.dajuteam.com.tw/upload/web/images/assets/real-price-pic.png" 
              onerror="this.style.display='none'"/>
            <div class="real-price-text">
              <h5 class="real-price-title">${titleText}</h5>
              <p class="real-price-subtext">您將前往樂居網站，本資料由樂居網站提供。</p>
            </div>
          </div>
          <a class="${btnClass}" ${btnHref} rel="noopener noreferrer" aria-label="前往樂居網站">
            ${btnIcon}
            前往樂居網站
          </a>
        </div>
      </div>
    `;
    container.innerHTML = html;
  };

  // === 主程式 (修改：強制顯示，即使沒網址) ===
  const init = async () => {
    const container = document.getElementById(CONFIG.CONTAINER_ID);
    if (!container) return;

    const caseName = container.dataset.caseName;
    if (!caseName) {
        console.warn("實價登錄區塊未設定 data-case-name");
        return;
    }

    injectStyles(); 
    const allData = await getData(); 

    // 修改邏輯：不管有沒有資料，都呼叫 render
    // 如果 allData 裡有該案名，就把網址傳進去；如果沒有，就傳 null
    const targetUrl = (allData && allData[caseName.trim()]) ? allData[caseName.trim()] : null;
    
    render(targetUrl);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
