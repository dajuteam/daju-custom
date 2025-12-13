<script>
/* =========================================================================
 * [6] 金牌經紀人（GAS 模式 - 隨機輪播版） + Expert Card Injection System（單檔整合版）
 * ======================================================================= */

// !!【新】請貼上您在 Step 3 取得的「經紀人」 GAS 網址 !!
const AGENT_GAS_URL = "https://script.google.com/macros/s/AKfycbyNJDANOuoqxNeLDl0ygGuWt73R8MrfobTaKHWmRc9yxrIF-Om40uYdR2aqSNwfedIt/exec";

async function initExpertCards() {
  // 1. 找出頁面上的經紀人卡片容器
  const container = document.querySelector('[data-case-name]');
  if (!container || !container.id) {
    return; // 這頁沒有經紀人卡片，或沒有 id
  }

  // 2. 取得這個頁面對應的案名
  const caseName = container.dataset.caseName;
  if (!caseName) return;

  let rows = [];
  try {
    // 3. 抓取所有經紀人資料
    const res = await fetch(AGENT_GAS_URL, { mode: 'cors' });
    if (!res.ok) throw new Error(`GAS API fetch error: ${res.statusText}`);
    rows = await res.json();
  } catch (err) {
    console.error('[expert-gas] 經紀人 GAS 載入失敗：', err);
    return;
  }

  // 4. 過濾資料，只找出 case_name 符合的經紀人
  const matchingExperts = rows.filter(expert => expert.case_name === caseName);

  if (matchingExperts.length === 0) {
    container.style.display = 'none'; // 沒人則隱藏區塊
    return; 
  }

  // ===========================================================
  // ★ 修改區塊：決定要顯示哪些人 (隨機抽籤 vs 全部顯示)
  // ===========================================================
  
  // 這裡宣告一個變數來裝「最後要顯示的名單」
  let finalDisplayList = [];

  // ---【目前模式】：隨機輪播 (自動計算人數平均機率) ---
  const randomIndex = Math.floor(Math.random() * matchingExperts.length);
  finalDisplayList = [ matchingExperts[randomIndex] ]; 

  // ---【備用模式】：顯示全部 (未來想改回來請用這個) ---
  // 如果以後想改回顯示所有人，請把上面兩行刪掉或註解，並把下面這行打開：
  // finalDisplayList = matchingExperts;

  // ===========================================================
  // ★ 修改結束
  // ===========================================================


  // 5. 【關鍵】建立舊腳本 (widget) 需要的資料格式
  // 注意：這裡改用我們過濾好的 finalDisplayList 來跑 map
  window.expertCardList = finalDisplayList.map(expert => {
    return {
      level: expert.level,
      name: expert.name,
      phone: expert.phone,
      line: expert.line,
      license: expert.license,
      company: expert.company,
      image: expert.image,
      start: expert.start,
      end: expert.end,
      container: "#" + container.id // 動態填入容器 ID
    };
  });

  // 6. ✅單檔整合：直接執行本檔內建插件
  if (window.ExpertCardSystem && typeof window.ExpertCardSystem.init === 'function') {
    window.ExpertCardSystem.init();
  } else {
    console.warn('ExpertCard: ExpertCardSystem 尚未就緒');
  }
}

/**
 * Expert Card Injection System - 改進版本（強化：時間區間、連結/電話淨化、IO 降級補圖、圖片優化 不 lazy load（用 src 取代 data-src））20250817v5
 */
(function (window, document) {
  'use strict';

  if (window.ExpertCardSystem) return;

  const ExpertCardSystem = {
    observers: [],
    imageSeq: 0,

    // ✅【整合必要的功能性保護】避免 init 被呼叫兩次時重複注入
    hasInit: false,

    LEVELS: {
      "社區人氣王": { icon: "fa-fire", title: "【社區人氣王】", mark: "HOT" },
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

    isInTimeRange(start, end) {
      const parseTW = (val) => {
        if (!val) return null;
        if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

        let s = String(val).trim();
        s = s.replace(/\//g, '-');
        if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
        if (!/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) s += '+08:00';
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

    sanitizeTel(raw) {
      return raw ? String(raw).replace(/[^\d+]/g, '') : '';
    },

    sanitizeHref(raw, allowLine = false) {
      if (!raw) return '';
      const s = String(raw).trim();
      if (/^https?:\/\//i.test(s)) return s;
      if (/^tel:/i.test(s)) return s;
      if (allowLine && /^https?:\/\/(line\.me|lin\.ee)\//i.test(s)) return s;
      return '';
    },

    generateCardHTML(opt) {
      try {
        const lvl = this.LEVELS[opt.level];
        if (!lvl) {
          console.warn('ExpertCard: 未知等級', opt.level);
          return '';
        }

        const imageSrc = this.escapeHtml(opt.image);
        const telClean = this.sanitizeTel(opt.phone);
        const telHref = telClean ? `tel:${telClean}` : '';
        const lineHref = this.sanitizeHref(opt.line, true);

        // ✅ 單卡片優化：直接使用 src 載入圖片，不使用 lazy loading
        return `
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
      referrerpolicy="no-referrer"
      width="120" height="120"
    />
    <div class="expert-info">
      <div class="expert-title"><i class="fas ${lvl.icon}"></i>${lvl.title}</div>
      <div class="expert-name-row">
        <div class="expert-name">${this.escapeHtml(opt.name)}</div>
        <div class="expert-contact">
          ${telHref ? `<a class="expert-contact-phone" href="${telHref}"><i class="fas fa-phone-alt"></i><span>${this.escapeHtml(opt.phone)}</span></a>` : ''}
          ${lineHref ? `<a class="expert-contact-line" href="${lineHref}" target="_blank" rel="noopener noreferrer"><i class="fab fa-line"></i><span>LINE</span></a>` : ''}
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
        if (!opt || !opt.container || !opt.level || !opt.name) {
          console.warn('ExpertCard: 配置不完整', opt);
          return false;
        }

        const container = document.querySelector(opt.container);
        if (!container) {
          console.warn('ExpertCard: 找不到容器', opt.container);
          return false;
        }

        if (!this.isInTimeRange(opt.start, opt.end)) return false;

        const html = this.generateCardHTML(opt);
        if (html) {
          container.insertAdjacentHTML('beforeend', html);

          // ✅ 單卡片：提前預載圖片至記憶體，加快首次顯示速度
          if (opt.image) {
            const preload = new Image();
            preload.src = opt.image;
            if (preload.decode) preload.decode().catch(() => {});
          }

          return true;
        }
        return false;
      } catch (error) {
        console.error('ExpertCard: 卡片注入失敗', error);
        return false;
      }
    },

    observeAnimations() {
      if (!('IntersectionObserver' in window)) return;

      const targets = document.querySelectorAll('.expert-card-wrapper[data-animate]:not(.expert-observed)');
      if (!targets.length) return;

      const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target;

          try {
            el.classList.remove('expert-card-hidden');

            const raw = (el.dataset.animate || 'flipInY').trim();
            const tokens = raw.split(/\s+/).filter(Boolean).map(t => t.replace(/^animate__/, ''));
            if (!el.classList.contains('animated')) el.classList.add('animated');
            if (tokens.length) el.classList.add(...tokens);
            el.style.animationDuration = '1.5s';

          } catch (err) {
            console.error('ExpertCard: 動畫觸發失敗', err);
            el.classList.remove('expert-card-hidden');
          } finally {
            io.unobserve(el);
          }
        });
      }, { threshold: 0.3, rootMargin: '20px' });

      targets.forEach(el => {
        el.classList.add('expert-observed');
        io.observe(el);
      });

      this.observers.push(io);
    },

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
        // ✅【整合必要的功能性保護】避免重複注入（DOM ready 跑一次 + GAS 回來又跑一次）
        if (this.hasInit) return;

        const list = window.expertCardList || [];
        if (!list.length) {
          console.warn('ExpertCard: 沒有找到 expertCardList');
          return;
        }

        list.forEach(cfg => this.injectExpertCard(cfg));
        this.observeAnimations(); // ✅ 保留動畫觸發（不影響圖片載入）

        // ✅ 成功注入後才鎖定
        this.hasInit = true;

      } catch (error) {
        console.error('ExpertCard: 初始化失敗', error);
      }
    }
  };

  window.ExpertCardSystem = ExpertCardSystem;
  window.addEventListener('beforeunload', () => {
    ExpertCardSystem.destroy();
  });

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => ExpertCardSystem.init())
    : ExpertCardSystem.init();

})(window, document);


// ✅ 讓 GAS 初始化也在 DOM Ready 後執行（避免容器還沒出現）
document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', () => initExpertCards())
  : initExpertCards();

</script>
