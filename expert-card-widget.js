        /**
         * Expert Card Injection System - 改進版本（強化：時間區間、連結/電話淨化、IO 降級補圖、圖片優化）20250811V3
         */
        (function (window, document) {
            'use strict';

            if (window.ExpertCardSystem) return;

            const ExpertCardSystem = {
                // 儲存觀察者以便清理
                observers: [],

                // 供首張圖高優先
                imageSeq: 0,

                LEVELS: {
                    "社區人氣王": { icon: "fa-fire", title: "【社區人氣王】", mark: "POP" },
                    "社區專家": { icon: "fa-trophy", title: "【社區專家】", mark: "PRO+" },
                    "社區大師": { icon: "fa-crown", title: "【社區大師】", mark: "MASTER" }
                },

                getTaiwanTime() {
                    try {
                        const now = new Date();
                        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
                        return new Date(utc + (8 * 3600000));
                    } catch (error) {
                        console.warn('ExpertCard: 時間計算錯誤', error);
                        return new Date();
                    }
                },

                // ✅ 強化：時間區間（支援只填 start 或只填 end，並視為台灣時間）
                isInTimeRange(start, end) {
                    const parseTW = (val) => {
                        if (!val) return null;
                        if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

                        let s = String(val).trim();
                        s = s.replace(/\//g, '-');                // 支援 YYYY/MM/DD
                        if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T'); // 空白→T
                        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';              // 只有日期→補時間
                        if (!/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) s += '+08:00';             // 補上台灣時區
                        const d = new Date(s);
                        return isNaN(d.getTime()) ? null : d;
                    };

                    try {
                        const now = this.getTaiwanTime();
                        const s = parseTW(start);
                        const e = parseTW(end);
                        if (s && e) return now >= s && now <= e;
                        if (s && !e) return now >= s;
                        if (!s && e) return now <= e;
                        return true;
                    } catch (error) {
                        console.warn('ExpertCard: 時間範圍檢查錯誤', error);
                        return true;
                    }
                },

                escapeHtml(str) {
                    if (!str) return '';
                    const div = document.createElement('div');
                    div.textContent = str;
                    return div.innerHTML;
                },

                // ✅ 新增：電話/連結淨化（避免奇怪符號與危險協定）
                sanitizeTel(raw) {
                    return raw ? String(raw).replace(/[^\d+]/g, '') : '';
                },
                sanitizeHref(raw, allowLine = false) {
                    if (!raw) return '';
                    const s = String(raw).trim();
                    if (/^https?:\/\//i.test(s)) return s;                           // http(s)
                    if (/^tel:/i.test(s)) return s;                                  // tel:
                    if (allowLine && /^https?:\/\/(line\.me|lin\.ee)\//i.test(s))    // LINE
                        return s;
                    return '';
                },

                generateCardHTML(opt) {
                    try {
                        // 檢查等級是否存在
                        const lvl = this.LEVELS[opt.level];
                        if (!lvl) {
                            console.warn('ExpertCard: 未知等級', opt.level);
                            return '';
                        }

                        const imageSrc = this.escapeHtml(opt.image);

                        // ✅ 先淨化電話與連結（顯示文字仍用原字串的 escapeHtml）
                        const telClean = this.sanitizeTel(opt.phone);
                        const telHref = telClean ? `tel:${telClean}` : '';
                        const lineHref = this.sanitizeHref(opt.line, true);

                        // ✅ 圖片：首張高優先（縮短白屏），其餘 lazy
                        const isFirst = (this.imageSeq++ === 0);
                        const loading = isFirst ? 'eager' : 'lazy';
                        const fetchPri = isFirst ? 'high' : 'auto';

                        return `
<div class="expert-card-wrapper expert-platinum expert-card-hidden" data-animate="flipInY">
  <div class="expert-card expert-platinum">
    <div class="expert-badge"><i class="fas ${lvl.icon}"></i></div>
    <img
      alt="頭像"
      class="expert-profile"
      src=""
      data-src="${imageSrc}"
      loading="${loading}"
      decoding="async"
      fetchpriority="${fetchPri}"
      referrerpolicy="no-referrer"
      width="120" height="120"
    />
    <div class="expert-info">
      <div class="expert-title"><i class="fas ${lvl.icon}"></i>${lvl.title}</div>
      <div class="expert-name-row">
        <div class="expert-name">${this.escapeHtml(opt.name)}</div>
        <div class="expert-contact">
          ${telHref ? `
            <a class="expert-contact-phone" href="${telHref}">
              <i class="fas fa-phone-alt"></i><span>${this.escapeHtml(opt.phone)}</span>
            </a>` : ''}
          ${lineHref ? `
            <a class="expert-contact-line" href="${lineHref}" target="_blank" rel="noopener noreferrer">
              <i class="fab fa-line"></i><span>LINE</span>
            </a>` : ''}
        </div>
      </div>
      <div class="expert-footer">證號：${this.escapeHtml(opt.license || '')}｜經紀業：${this.escapeHtml(opt.company || '')}</div>
      <div class="expert-level-mark">${lvl.mark}&nbsp;</div>
    </div>
  </div>
</div>`;
                    } catch (error) {
                        console.error('ExpertCard: HTML生成失敗', error);
                        return '';
                    }
                },

                injectExpertCard(opt) {
                    try {
                        // 檢查配置完整性
                        if (!opt || !opt.container || !opt.level || !opt.name) {
                            console.warn('ExpertCard: 配置不完整', opt);
                            return false;
                        }

                        const container = document.querySelector(opt.container);
                        if (!container) {
                            console.warn('ExpertCard: 找不到容器', opt.container);
                            return false;
                        }

                        if (!this.isInTimeRange(opt.start, opt.end)) {
                            return false;
                        }

                        const html = this.generateCardHTML(opt);
                        if (html) {
                            container.insertAdjacentHTML('beforeend', html);
                            return true;
                        }
                        return false;
                    } catch (error) {
                        console.error('ExpertCard: 卡片注入失敗', error);
                        return false;
                    }
                },

                observeAnimations() {
                    // 檢查瀏覽器支援
                    if (!('IntersectionObserver' in window)) {
                        console.warn('ExpertCard: 瀏覽器不支援 IntersectionObserver');

                        // 先把所有 lazy 圖片預載並（可）預解碼，再顯示卡片，避免閃爍
                        document.querySelectorAll('img[data-src]').forEach(img => {
                            try {
                                const src = img.dataset.src;
                                if (!src) return;
                                const pre = new Image();
                                pre.src = src;
                                (pre.decode ? pre.decode() : Promise.resolve())
                                    .catch(() => { })
                                    .finally(() => {
                                        img.src = src;
                                        img.removeAttribute('data-src');
                                    });
                            } catch (e) {
                                console.error('ExpertCard: 圖片載入失敗(降級)', e);
                            }
                        });

                        // 降級處理：直接顯示所有卡片
                        const cards = document.querySelectorAll('.expert-card-hidden');
                        cards.forEach(card => {
                            card.classList.remove('expert-card-hidden');
                            card.classList.add('expert-card-fallback');
                        });
                        return;
                    }

                    // —— 版本設定：預設 v3，若偵測到 v4 再切 —— //
                    if (!this._animSpec) {
                        // 預設採用 animate.css v3（與 WOW 版一致）
                        this._animSpec = { base: 'animated', prefix: '', v4: false };
                        // 嘗試偵測 v4（若 CSS 尚未載完，預設 v3 也能跑）
                        try {
                            const probe = document.createElement('div');
                            document.body.appendChild(probe);
                            probe.className = 'animate__animated';
                            const cs = getComputedStyle(probe);
                            const isV4 = cs.animationDuration && cs.animationDuration !== '0s';
                            document.body.removeChild(probe);
                            if (isV4) this._animSpec = { base: 'animate__animated', prefix: 'animate__', v4: true };
                        } catch (_) { /* 靜默失敗，維持 v3 預設 */ }
                    }
                    const A = this._animSpec;
                    // —— 偵測結束 —— //

                    const targets = document.querySelectorAll('.expert-card-wrapper[data-animate]:not(.expert-observed)');
                    if (targets.length === 0) return;

                    const io = new IntersectionObserver(entries => {
                        entries.forEach(entry => {
                            if (!entry.isIntersecting) return;
                            const el = entry.target;

                            try {
                                // 顯示元素
                                el.classList.remove('expert-card-hidden');

                                // 讀 data-animate（允許 v3 名稱或 v4 帶前綴；也支援多 token，例如 "flipInY delay-2s faster"）
                                const raw = (el.dataset.animate || 'flipInY').trim();
                                const tokens = raw.split(/\s+/).filter(Boolean);

                                // 正規化：移除 v4 前綴後，組出 v3 / v4 兩套類名
                                const v3Tokens = tokens.map(t => t.replace(/^animate__/, ''));
                                const v4Tokens = v3Tokens.map(t => `animate__${t}`);

                                // 先用目前設定的版本加 class
                                if (!el.classList.contains(A.base)) el.classList.add(A.base);
                                el.classList.add(...(A.v4 ? v4Tokens : v3Tokens));

                                // 設置動畫時長
                                if (A.v4) el.style.setProperty('--animate-duration', '1.5s');
                                else el.style.animationDuration = '1.5s';

                                // 檢查是否真的有動畫（避免載入時序/版本誤判）
                                let name = '';
                                try { name = getComputedStyle(el).animationName; } catch (_) { }
                                if (!name || name === 'none') {
                                    // 換另一版本或同時加兩套，確保命中
                                    el.classList.remove(...(A.v4 ? v4Tokens : v3Tokens));

                                    // 同時備妥兩個基底
                                    if (!el.classList.contains('animated')) el.classList.add('animated');
                                    if (!el.classList.contains('animate__animated')) el.classList.add('animate__animated');

                                    // 兩套類名都套上
                                    el.classList.add(...v3Tokens, ...v4Tokens);

                                    // 兩種時長都給
                                    el.style.animationDuration = '1.5s';
                                    el.style.setProperty('--animate-duration', '1.5s');
                                }
                            } catch (err) {
                                console.error('ExpertCard: 動畫觸發失敗', err);
                                el.classList.remove('expert-card-hidden');
                            } finally {
                                io.unobserve(el);
                            }
                        });
                    }, { threshold: 0.3, rootMargin: '20px' });

                    // 標記已觀察，避免重複
                    targets.forEach(el => {
                        el.classList.add('expert-observed');
                        io.observe(el);
                    });

                    // 儲存觀察者實例
                    this.observers.push(io);
                },


                lazyLoadImages() {
                    // 依網路狀態做一點點自適應（保守，不改 CSS）
                    const saveData = navigator.connection && navigator.connection.saveData;
                    const effectiveType = (navigator.connection && navigator.connection.effectiveType) || '';
                    const isSlow = /^(2g|slow-2g)$/i.test(effectiveType);
                    const aggressive = !saveData && !isSlow; // 慢網或省流量就不要太早預載

                    // 不支援 IO：直接預載 + 預解碼
                    if (!('IntersectionObserver' in window)) {
                        const images = document.querySelectorAll('img[data-src]');
                        images.forEach(img => {
                            try {
                                const src = img.dataset.src;
                                if (!src) return;
                                const pre = new Image();
                                pre.src = src;
                                (pre.decode ? pre.decode() : Promise.resolve())
                                    .catch(() => { })
                                    .finally(() => {
                                        img.src = src;
                                        img.removeAttribute('data-src');
                                    });
                            } catch (error) {
                                console.error('ExpertCard: 圖片載入失敗', error);
                            }
                        });
                        return;
                    }

                    const images = document.querySelectorAll('img[data-src]:not(.expert-image-observed)');
                    if (images.length === 0) return;

                    // ✅ 提早觀察（預載）：網路好時 500px，慢網/省流時 200px
                    const margin = aggressive ? '500px 0px' : '200px 0px';

                    const observer = new IntersectionObserver(entries => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting || entry.intersectionRatio > 0) {
                                const img = entry.target;
                                observer.unobserve(img);
                                try {
                                    const src = img.dataset.src;
                                    if (!src) return;

                                    // 預解碼再替換，避免卡頓
                                    const pre = new Image();
                                    pre.src = src;
                                    (pre.decode ? pre.decode() : Promise.resolve())
                                        .catch(() => { })
                                        .finally(() => {
                                            img.src = src;
                                            img.removeAttribute('data-src');
                                            img.classList.add('expert-img-loaded');
                                        });

                                } catch (error) {
                                    console.error('ExpertCard: 圖片載入失敗', error);
                                }
                            }
                        });
                    }, { rootMargin: margin, threshold: 0.01 });

                    images.forEach(img => {
                        img.classList.add('expert-image-observed');
                        observer.observe(img);
                    });

                    this.observers.push(observer);
                },

                // 清理資源的方法
                destroy() {
                    this.observers.forEach(observer => {
                        if (observer && typeof observer.disconnect === 'function') {
                            observer.disconnect();
                        }
                    });
                    this.observers = [];
                },

                init() {
                    try {
                        const list = window.expertCardList || [];
                        if (list.length === 0) {
                            console.warn('ExpertCard: 沒有找到 expertCardList');
                            return;
                        }

                        // 注入卡片
                        list.forEach(cfg => this.injectExpertCard(cfg));

                        // 初始化功能
                        this.lazyLoadImages();
                        this.observeAnimations();

                    } catch (error) {
                        console.error('ExpertCard: 初始化失敗', error);
                    }
                }
            };

            window.ExpertCardSystem = ExpertCardSystem;

            // 頁面卸載時清理資源
            window.addEventListener('beforeunload', () => {
                ExpertCardSystem.destroy();
            });

            // 自動初始化
            document.readyState === 'loading' ?
                document.addEventListener('DOMContentLoaded', () => ExpertCardSystem.init()) :
                ExpertCardSystem.init();

        })(window, document);
