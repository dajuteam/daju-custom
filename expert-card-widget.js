/**
 * 金牌經紀人 Widget (Original Logic Restored)
 * 功能：
 * 1. 鎖定 id="expert-container"
 * 2. 注入 100% 原版 CSS (無修改)
 * 3. 邏輯修復：無資料時使用 container.style.display = 'none' 強制隱藏
 */

(function() {
  // ============================================================
  // ⚡ 設定區
  // ============================================================
  const AGENT_API_URL = "https://script.google.com/macros/s/AKfycbyNJDANOuoqxNeLDl0ygGuWt73R8MrfobTaKHWmRc9yxrIF-Om40uYdR2aqSNwfedIt/exec";

  const LEVELS = {
    "社區人氣王": { icon: "fa-fire", title: "【社區人氣王】", mark: "HOT" },
    "社區專家": { icon: "fa-trophy", title: "【社區專家】", mark: "PRO+" },
    "社區大師": { icon: "fa-crown", title: "【社區大師】", mark: "MASTER" }
  };

  // ==============================================
  // 1. 自動注入樣式
  // ==============================================
  function injectStyles() {
    // 1.1 FontAwesome
    if (!document.querySelector('link[href*="fontawesome"]')) {
      const faLink = document.createElement('link');
      faLink.rel = 'stylesheet';
      faLink.href = 'https://www.dajuteam.com.tw/js/fontawesome-free-5.15.1-web/css/all.min.css';
      document.head.appendChild(faLink);
    }

    // 1.2 Google Fonts (Shrikhand)
    if (!document.querySelector('link[href*="Shrikhand"]')) {
      const fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Shrikhand&display=swap';
      document.head.appendChild(fontLink);
    }

    // 1.3 注入 CSS (完全是您原本的代碼)
    const style = document.createElement('style');
    style.innerHTML = `
        /* 金牌業務卡片的CSS */

        /* 隱藏狀態 - 完全隱藏，不佔據空間 */
        .expert-card-hidden {
            opacity: 0 !important;
            visibility: hidden !important;
            transform: scale(0.8) !important;
            transition: none !important;
            pointer-events: none !important;
            will-change: transform, opacity;
        }

        .expert-card-fallback {
            opacity: 1 !important;
            visibility: visible !important;
            transform: scale(1) translateY(0) !important;
            transition: all .6s cubic-bezier(.4, 0, .2, 1) !important;
            will-change: transform, opacity;
        }

        /* 金牌經紀人容器 */
        .expert-card-wrapper {
            position: relative;
            border-radius: 8px;
            overflow: hidden;
            width: 100%;
            max-width: 1000px;
            z-index: 0;
            line-height: 1.5;
            letter-spacing: 0;
            margin: 20px 0;
            isolation: isolate;
        }

        .expert-card-wrapper::before {
            content: "";
            position: absolute;
            top: -3px;
            left: -3px;
            right: -3px;
            bottom: -3px;
            border-radius: inherit;
            background: linear-gradient(130deg, #fffaea, #eccb7d, #fff2d4, #f4c978, #ffedb1, #e6c079, #e7c57c);
            background-size: 400% 400%;
            animation: borderFlow 10s linear infinite;
            z-index: -2;
            box-shadow: 0 0 16px rgba(4, 255, 0, 0.715);
            pointer-events: none;
        }

        @keyframes borderFlow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        .expert-card {
            border-radius: 8px;
            padding: 10px 22px;
            position: relative;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
        }

        .expert-platinum {}

        .expert-badge { display: none; }

        .expert-card .expert-badge {
            background: radial-gradient(circle, #f5d770, #d1a106);
        }

        .expert-badge i {
            color: #fff;
            font-size: 1.8em;
        }

        @keyframes rotateBadge {
            0% { transform: rotateY(0deg); }
            100% { transform: rotateY(360deg); }
        }

        .expert-profile {
            width: 80px !important;
            height: 80px !important;
            border-radius: 12px;
            border: 3px solid #fff;
            object-fit: cover;
            margin-right: 15px !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, .1);
            display: block;
            aspect-ratio: 1/1;
        }

        .expert-info { flex: 1; }

        .expert-title {
            font-size: 1.1rem;
            font-weight: 700;
            margin-bottom: 6px;
        }

        .expert-info .expert-title { color: #9f5f00; }

        .expert-name-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 16px;
            margin-bottom: 10px;
            position: relative;
            z-index: 10;
        }

        .expert-name {
            font-size: 1.7rem;
            font-weight: bold;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .expert-contact-phone { background: linear-gradient(to right, #a45500, #ff9e36); }
        .expert-contact-line { background: linear-gradient(to right, #00a816, #67ca04); }

        .expert-contact {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }

        .expert-contact a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            min-width: 40px;
            min-height: 40px;
            border-radius: 50%;
            padding: 0;
            font-size: 1.4rem;
            line-height: 1;
            text-decoration: none;
            transition: transform .2s ease, filter .2s ease, box-shadow .2s ease;
            outline: none;
            color: #fff;
        }

        .expert-contact a:hover {
            transform: translateY(-1px);
            filter: brightness(1.05);
        }

        .expert-contact a:active {
            transform: translateY(0);
            filter: brightness(.98);
        }

        .expert-contact a:focus-visible {
            box-shadow: 0 0 0 3px rgba(255, 255, 255, .9), 0 0 0 6px rgba(164, 85, 0, .35);
        }

        .expert-contact a i.fa-phone-alt { font-size: 1.3rem; }
        .expert-contact a i.fa-line { font-size: 1.5rem; }

        .expert-name-row .expert-contact a { color: #fff; }

        .expert-footer {
            display: none;
            position: relative;
            z-index: 3;
            font-size: .5rem;
            color: #af885c;
        }

        .expert-level-mark {
            position: absolute;
            right: 18px;
            top: 10px;
            font-family: "Shrikhand", serif;
            font-style: italic;
            font-size: 1.1rem;
            color: rgba(194, 145, 67, 0.5);
            opacity: 0;
            animation: fadeSlideIn .8s ease-out forwards;
            animation-delay: 1s;
            pointer-events: none;
            z-index: 2;
            text-shadow: 0 1px 1px rgba(255, 255, 255, .4);
        }

        @keyframes fadeSlideIn {
            0% { transform: translate(0, 20px); opacity: 0; }
            100% { transform: translate(0, 0); opacity: .9; }
        }

        .expert-contact a span { display: none; }

        .expert-title i { animation: rotateBadge 3s linear infinite; }

        .expert-opacity-0 {
            opacity: 0;
            pointer-events: none;
            visibility: hidden;
            transition: opacity .2s ease;
        }

        /* RWD */
        @media (min-width:414px) {
            .expert-level-mark { font-size: 1.6rem; right: 10px; top: 6px; }
        }

        @media screen and (min-width:992px) {
            .expert-card-wrapper { border-radius: 15px; }
            .expert-card { border-radius: 15px; padding: 15px 28px; }
            .expert-title { font-size: 1.7rem; }
            .expert-title i { animation: none; }
            .expert-name-row { gap: 30px; }
            .expert-contact a {
                width: auto; height: auto; min-height: 44px;
                font-size: 1.4rem; padding: 8px 16px; gap: 8px;
                border-radius: 10px; letter-spacing: 1.1px;
            }
            .expert-contact a span { display: inline; }
            .expert-badge {
                width: 60px; height: 60px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                margin-right: 25px; flex-shrink: 0;
                box-shadow: 0 2px 8px rgba(0, 0, 0, .2);
                animation: rotateBadge 3s linear infinite;
            }
            .expert-profile {
                width: 120px !important; height: 120px !important;
                border-radius: 12px; border: 4px solid #fff;
                margin-right: 30px !important;
                box-shadow: 0 2px 5px #dcad6ccc;
            }
            .expert-name { font-size: 2.3rem; max-width: 40ch; }
            .expert-level-mark { right: -20px; top: 34px; font-size: 6.5rem; }
            .expert-footer { font-size: .85rem; }
        }

        @media (prefers-reduced-motion: reduce) {
            .expert-title i, .expert-badge, .expert-card-wrapper[data-animate], .expert-level-mark {
                animation: none !important; transition: none !important;
            }
        }
    `;
    document.head.appendChild(style);
  }

  // ==============================================
  // 2. 輔助函式
  // ==============================================
  function getTaiwanTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (8 * 3600000));
  }

  function isInTimeRange(start, end) {
    const parseTW = (val) => {
      if (!val) return null;
      let s = String(val).trim().replace(/\//g, '-').replace(' ', 'T');
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    };
    try {
      const now = getTaiwanTime();
      const s = parseTW(start);
      const e = parseTW(end);
      if (s && e) return now >= s && now <= e;
      if (s && !e) return now >= s;
      if (!s && e) return now <= e;
      return true; 
    } catch (e) { return true; }
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitizeHref(raw, isLine) {
    if (!raw) return '';
    if (isLine && !raw.includes('http')) return 'https://line.me/ti/p/' + raw;
    return raw;
  }

  // ==============================================
  // 3. 核心邏輯
  // ==============================================
  async function initExpertSystem() {
    // 鎖定目標容器
    const container = document.getElementById('expert-container');
    if (!container) return; 

    injectStyles();

    try {
      const res = await fetch(AGENT_API_URL);
      const allExperts = await res.json();
      
      const caseName = container.dataset.caseName;
      
      renderExpert(container, caseName, allExperts);
      initObserver();

    } catch (err) {
      console.error('Expert Widget Error:', err);
      // ★★★ 網路錯誤時：強制隱藏 ★★★
      if(container) container.style.display = 'none';
    }
  }

  function renderExpert(container, caseName, allExperts) {
    // 過濾資料
    const matches = allExperts.filter(ex => 
      ex.case_name === caseName && 
      isInTimeRange(ex.start, ex.end)
    );

    // ★★★ 無資料時：強制隱藏 (回復到原始邏輯) ★★★
    if (matches.length === 0) {
      container.style.display = 'none';
      return;
    }

    // --- 有資料，確保顯示 ---
    container.style.display = ''; // 清除 display:none 以防萬一

    // 隨機取一筆
    const expert = matches[Math.floor(Math.random() * matches.length)];
    const lvl = LEVELS[expert.level] || LEVELS["社區專家"];
    const imageSrc = escapeHtml(expert.image);
    const telHref = expert.phone ? `tel:${expert.phone}` : '';
    const lineHref = sanitizeHref(expert.line, true);

    // 圖片預載
    if (imageSrc) {
      const preload = new Image();
      preload.src = imageSrc;
    }

    // 產生 HTML
    const html = `
      <div class="expert-card-wrapper expert-platinum expert-card-hidden" data-animate="flipInY">
        <div class="expert-card expert-platinum">
          <div class="expert-badge"><i class="fas ${lvl.icon}"></i></div>
          
          <img 
            alt="頭像"
            class="expert-profile" 
            src="${imageSrc}" 
            loading="eager" 
            decoding="async"
            fetchpriority="high"
            width="120" height="120"
          >
          
          <div class="expert-info">
            <div class="expert-title"><i class="fas ${lvl.icon}"></i> ${lvl.title}</div>
            <div class="expert-name-row">
              <div class="expert-name">${escapeHtml(expert.name)}</div>
              <div class="expert-contact">
                ${telHref ? `<a class="expert-contact-phone" href="${telHref}"><i class="fas fa-phone-alt"></i><span>${escapeHtml(expert.phone)}</span></a>` : ''}
                ${lineHref ? `<a class="expert-contact-line" href="${lineHref}" target="_blank"><i class="fab fa-line"></i><span>LINE</span></a>` : ''}
              </div>
            </div>
            
            <div class="expert-footer">
              證號：${escapeHtml(expert.license || '')}｜經紀業：${escapeHtml(expert.company || '')}
            </div>
            <div class="expert-level-mark">${lvl.mark}&nbsp;</div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // ==============================================
  // 4. 動畫觸發器
  // ==============================================
  function initObserver() {
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          el.classList.remove('expert-card-hidden');
          el.classList.add('animate__animated', 'animate__flipInY', 'animated', 'flipInY');
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.3 });

    setTimeout(() => {
      document.querySelectorAll('.expert-card-wrapper[data-animate]').forEach(el => observer.observe(el));
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExpertSystem);
  } else {
    initExpertSystem();
  }

})();
