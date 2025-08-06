 document.addEventListener("DOMContentLoaded", function () {
            const container = document.querySelector("#real-price-section-container");
            if (!container) {
                console.warn("Real price container not found");
                return;
            }

            // 優先從 data 屬性讀取，fallback 到全域變數
            const realPriceUrl = container.dataset.realPriceUrl || window.realPriceUrl;

            if (!realPriceUrl) {
                console.warn("Real price URL not provided");
                return;
            }

            // 驗證 URL 格式
            let validUrl;
            try {
                validUrl = new URL(realPriceUrl);
            } catch (error) {
                console.error("Invalid real price URL:", realPriceUrl);
                return;
            }

            const realPriceHTML = `
    <div class="real-price-section">
      <div class="real-price-body">
        <!-- 左欄 -->
        <div class="real-price-left">
          <img 
            alt="實價登錄圖示" 
            class="real-price-icon" 
            src="https://www.dajuteam.com.tw/upload/web/images/assets/real-price-pic.png"
            onerror="this.style.display='none'"
          />
          <div class="real-price-text">
            <h5 class="real-price-title">查看本案最新實價登錄</h5>
            <p class="real-price-subtext">您將前往樂居網站，本資料由樂居網站提供。</p>
          </div>
        </div>
        <!-- 右欄 -->
        <a 
          class="real-price-button" 
          href="${validUrl.href}" 
          target="_blank"
          rel="noopener noreferrer"
          aria-label="前往樂居網站查看實價登錄"
        >
          <i class="fas fa-external-link-alt" aria-hidden="true"></i> 
          前往樂居網站
        </a>
      </div>
    </div>
  `;

            try {
                container.innerHTML = realPriceHTML;
            } catch (error) {
                console.error("Failed to render real price section:", error);
            }
        });
