(function() {
    // ================= 設定區 =================
    const CONFIG = {
        password: "MDgyMQ==", 
        
        targets: "article.cases .aerial-panorama-iframe, article.cases .youtube-video-iframe"
    };
    // =========================================

    function initVideoLock() {
        const frames = document.querySelectorAll(CONFIG.targets);
        if (frames.length === 0) return;

   // 1. 注入鎖定畫面 CSS
        const style = document.createElement('style');
        style.innerHTML = `
            .js-lock-overlay {
                padding: 15px 15px;
                border-radius: 8px;
                max-width: 1000px;
                font-family: sans-serif;
                color: #555;
                position: relative;
                z-index: 10;
            }
            .js-lock-input { padding: 10px; border: 1px solid #ddd; border-radius: 4px; width: 180px; font-size: 16px; }
            .js-lock-btn { 
                padding: 10px 30px; 
                background: #e6e6e6; 
                color:  #8c8c8c; 
                border: none; 
                border-radius: 4px; 
                cursor: pointer; 
                font-size: 18px; 
                margin-left: 5px;
            }
            .js-lock-btn:hover { background: #0056b3; }
            .js-lock-error { color: #8c8c8c; margin-top: 10px; display: none; }
        `;
        document.head.appendChild(style);

        let hasValidVideo = false;


        // 2. 逐一處理影片
        frames.forEach(function(el) {
            el.style.display = 'none'; // 先隱藏

            // 取得原始 src
            const rawSrc = el.getAttribute('src');

            // 嚴格檢查
            if (rawSrc && rawSrc.trim() !== "" && rawSrc.trim() !== "#") {
                try {
                      el.dataset.secret = btoa(rawSrc); 
                    
                    hasValidVideo = true;
                } catch (e) {
                    console.error("網址編碼失敗", e);
                }
                // 移除原始 src
                el.removeAttribute('src'); 
            } else {
                el.removeAttribute('src');
            }
        });

        if (!hasValidVideo) return;

        // 3. 建立鎖定畫面
        const lockDiv = document.createElement('div');
        lockDiv.className = 'js-lock-overlay';
        lockDiv.innerHTML = `
            <div>
                <input type="password" class="js-lock-input" placeholder="輸入密碼">
                <button type="button" class="js-lock-btn">解鎖</button>
            </div>
            <div class="js-lock-error">暫不開放，有問題請洽大橘總機</div>
        `;

        frames[0].parentNode.insertBefore(lockDiv, frames[0]);

        // 4. 解鎖邏輯
        const btn = lockDiv.querySelector('.js-lock-btn');
        const input = lockDiv.querySelector('.js-lock-input');
        const errorMsg = lockDiv.querySelector('.js-lock-error');

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            // 密碼比對
            if (input.value === atob(CONFIG.password)) {
                
                lockDiv.style.display = 'none';

                frames.forEach(function(el) {
                    if (el.dataset.secret) {
                        try {
                            // === 關鍵修改：使用 atob 解開 Base64 ===
                            const originalUrl = atob(el.dataset.secret);
                            
                            el.style.display = 'block';
                            
                            // 延遲載入 (解決 360 黑畫面)
                            setTimeout(function() {
                                el.src = originalUrl;
                                window.dispatchEvent(new Event('resize'));
                            }, 100);
                        } catch(err) { console.error("解碼失敗", err); }
                    }
                });
            } else {
                errorMsg.style.display = 'block';
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVideoLock);
    } else {
        initVideoLock();
    }
})();
