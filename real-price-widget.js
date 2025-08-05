document.addEventListener("DOMContentLoaded", function () {
  if (!window.realPriceUrl) return;

  const container = document.querySelector("#real-price-section-container");
  if (!container) return;

  const cardHTML = `
    <div class="real-price-section">
      <div class="real-price-body">
        <!-- 左欄 -->
        <div class="real-price-left">
          <img alt="price icon" class="real-price-icon" src="https://www.dajuteam.com.tw/upload/web/images/assets/real-price-pic.png" />
          <div class="real-price-text">
            <h5 class="real-price-title">查看本案最新實價登錄</h5>
            <p class="real-price-subtext">您將前往樂居網站，本資料由樂居網站提供。</p>
          </div>
        </div>
        <!-- 右欄 -->
        <a class="real-price-button" href="${window.realPriceUrl}" target="_blank">
          <i class="fas fa-external-link-alt"></i> 前往樂居網站
        </a>
      </div>
    </div>
  `;

  container.innerHTML = cardHTML;
});
