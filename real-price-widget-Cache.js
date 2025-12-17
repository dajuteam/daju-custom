(function () {
  // === 設定區 ===
  const CONFIG = {
    // 請填入部署後的 GAS 網址
    GAS_API_URL: "https://script.google.com/macros/s/您的GAS_ID/exec",
    CONTAINER_ID: "real-price-container", // 對應 HTML ID
    STORAGE_KEY: "real_price_local_v2",
    STORAGE_TIME_KEY: "real_price_time_v2",
    EXPIRE_HOURS: 24 // 前端快取保留 24 小時
  };

  // === 1. CSS 樣式注入 (Mobile First) ===
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
        font-family: sans-serif; /* 確保字體繼承或預設 */
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

      .real-price-icon {
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
        margin: 5px 0 0 0;
      }

      /* 按鈕樣式 */
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
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      .real-price-button:hover {
        background-color: #ffb326;
        color: black;
        transform: translateY(-1px);
      }
      
      .real-price-button i {
        /* 如果有引入 FontAwesome */
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

        .real-price-icon {
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
          margin-bottom: 5px;
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

  // === 2. 資料獲取邏輯 ===
  const getData = async () => {
    const now = new Date().getTime();
    const cachedData = localStorage.getItem(CONFIG.STORAGE_KEY);
    const cachedTime = localStorage.getItem(CONFIG.STORAGE_TIME_KEY);

    // 檢查 LocalStorage 是否有效
    if (cachedData && cachedTime && (now - cachedTime < CONFIG.EXPIRE_HOURS * 60 * 60 * 1000)) {
      return JSON.parse(cachedData);
    }

    try {
      const response = await fetch(CONFIG.GAS_API_URL);
      if (!response.ok) throw new Error("API Error");
      const data = await response.json();

      // 寫入 LocalStorage
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem(CONFIG.STORAGE_TIME_KEY, now);
      return data;
    } catch (error) {
      console.error("實價登錄讀取失敗:", error);
      // 失敗時若有舊資料，加減用
      if (cachedData) return JSON.parse(cachedData);
      return null;
    }
  };

  // === 3. 渲染邏輯 ===
  const render = (url) => {
    const container = document.getElementById(CONFIG.CONTAINER_ID);
    if (!container) return;

    // 這裡的 HTML class 名稱都對應上方的 CSS
    const html = `
      <div class="real-price-section">
        <div class="real-price-body">
          <div class="real-price-left">
            <img alt="實價登錄圖示" class="real-price-icon" 
              src="https://www.dajuteam.com.tw/upload/web/images/assets/real-price-pic.png" 
              onerror="this.style.display='none'"/>
            <div class="real-price-text">
              <h5 class="real-price-title">查看本案最新實價登錄</h5>
              <p class="real-price-subtext">您將前往樂居網站，本資料由樂居網站提供。</p>
            </div>
          </div>
          <a class="real-price-button" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="前往樂居網站查看實價登錄">
            <i class="fas fa-external-link-alt" aria-hidden="true"></i> 
            前往樂居網站
          </a>
        </div>
      </div>
    `;
    container.innerHTML = html;
  };

  // === 主程式 ===
  const init = async () => {
    const container = document.getElementById(CONFIG.CONTAINER_ID);
    if (!container) return; // 頁面上沒有這個 ID 就不執行

    const caseName = container.dataset.caseName;
    if (!caseName) {
        console.warn("實價登錄區塊未設定 data-case-name");
        return;
    }

    injectStyles(); // 注入 CSS
    const allData = await getData(); // 取得資料

    if (allData && allData[caseName.trim()]) {
      render(allData[caseName.trim()]); // 渲染
    } else {
      // 找不到資料時隱藏
      container.style.display = 'none';
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
