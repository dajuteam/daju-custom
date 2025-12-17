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
                background: #f8f9fa;
                border: 2px dashed #ccc;
                padding: 40px 20px;
                text-align: center;
                margin: 20px auto;
                border-radius: 8px;
                max-width: 600px;
                font-family: sans-serif;
                color: #555;
                position: relative;
                z-index: 10;
            }
            .js-lock-title { font-size: 1.2em; margin-bottom: 10px; font-weight: bold; color: #333; }
            .js-lock-input { padding: 10px; border: 1px solid #ddd; border-radius: 4px; width: 180px; font-size: 16px; }
            .js-lock-btn { 
                padding: 10px 20px; 
                background: #007bff; 
                color: white; 
                border: none; 
                border-radius: 4px; 
                cursor: pointer; 
                font-size: 16px; 
                margin-left: 5px;
            }
            .js-lock-btn:hover { background: #0056b3; }
            .js-lock-error { color: #dc3545; margin-top: 10px; display: none; }
        `;
        document.head.appendChild(style);

        let hasValidVideo = false;

        // 2. 逐一處理影片
        frames.forEach(function(el) {
            el.style.display = 'none'; // 先隱藏

            const rawSrc = el.getAttribute('src');

            // 嚴格檢查：必須有內容且不為空
            if (rawSrc && rawSrc.trim() !== "" && rawSrc.trim() !== "#") {
                el.dataset.secret = encodeURIComponent(rawSrc); // 網址維持用 URI 編碼
                el.removeAttribute('src'); 
                hasValidVideo = true;
            } else {
                el.removeAttribute('src'); // 空的就移除，避免載入當前頁面
            }
        });

        if (!hasValidVideo) return;

        // 3. 建立鎖定畫面
        const lockDiv = document.createElement('div');
        lockDiv.className = 'js-lock-overlay';
        lockDiv.innerHTML = `
            <div class="js-lock-title">🔒 內容已加密</div>
            <div style="margin-bottom:15px;">此內容受密碼保護，請輸入密碼觀看。</div>
            <div>
                <input type="password" class="js-lock-input" placeholder="輸入密碼">
                <button type="button" class="js-lock-btn">解鎖</button>
            </div>
            <div class="js-lock-error">密碼錯誤</div>
        `;

        frames[0].parentNode.insertBefore(lockDiv, frames[0]);

        // 4. 解鎖邏輯
        const btn = lockDiv.querySelector('.js-lock-btn');
        const input = lockDiv.querySelector('.js-lock-input');
        const errorMsg = lockDiv.querySelector('.js-lock-error');

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            // === 密碼比對邏輯修改 ===
            // 將 CONFIG 裡的亂碼還原成明文，再跟使用者輸入的比對
            // atob('ODg4OA==') 會變成 '8888'
            if (input.value === atob(CONFIG.password)) {
                
                lockDiv.style.display = 'none';

                frames.forEach(function(el) {
                    if (el.dataset.secret) {
                        try {
                            const originalUrl = decodeURIComponent(el.dataset.secret);
                            el.style.display = 'block';
                            setTimeout(function() {
                                el.src = originalUrl;
                                window.dispatchEvent(new Event('resize'));
                            }, 100);
                        } catch(err) { console.error(err); }
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
