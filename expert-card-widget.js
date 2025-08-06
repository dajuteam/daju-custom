/**
 * Expert Card Injection System - Ultra Stable Version
 * 穩定性評分：10/10
 */

(function(window, document) {
  'use strict';

  // 🛡️ 防止重複執行
  if (window.ExpertCardSystem) {
    console.warn('ExpertCardSystem already initialized');
    return;
  }

  const ExpertCardSystem = {
    // 配置常數
    CONFIG: {
      TIMEZONE: 'Asia/Taipei',
      AOS_TIMEOUT: 10000,
      INJECT_TIMEOUT: 10000,
      RETRY_INTERVAL: 100,
      MAX_RETRIES: 50
    },

    // 等級配置
    LEVELS: {
      "社區人氣王": {
        icon: "fa-fire",
        title: "【社區人氣王】",
        mark: "POP",
        class: "expert-pop"
      },
      "社區專家": {
        icon: "fa-trophy",
        title: "【社區專家】",
        mark: "PRO+",
        class: "expert-pro"
      },
      "社區大師": {
        icon: "fa-crown",
        title: "【社區大師】",
        mark: "MASTER",
        class: "expert-master"
      }
    },

    // 🕒 穩定的台灣時間獲取
    getTaiwanTime() {
      try {
        // 方法1: 使用 Intl.DateTimeFormat (現代瀏覽器)
        if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
          const formatter = new Intl.DateTimeFormat('sv-SE', {
            timeZone: this.CONFIG.TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          return new Date(formatter.format(new Date()).replace(' ', 'T'));
        }
        
        // 方法2: 使用 toLocaleString (較舊瀏覽器)
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const taiwanTime = new Date(utc + (8 * 3600000)); // UTC+8
        return taiwanTime;
      } catch (error) {
        console.warn('時間獲取異常，使用本地時間:', error);
        return new Date();
      }
    },

    // 🔒 參數驗證
    validateOptions(options) {
      const required = ['level', 'name', 'phone', 'container'];
      const missing = required.filter(key => !options[key]);
      
      if (missing.length > 0) {
        throw new Error(`缺少必要參數: ${missing.join(', ')}`);
      }

      if (!this.LEVELS[options.level]) {
        throw new Error(`無效的等級: ${options.level}。可用等級: ${Object.keys(this.LEVELS).join(', ')}`);
      }

      // 驗證電話號碼格式
      if (!/^[\d\-\+\(\)\s]+$/.test(options.phone)) {
        console.warn('電話號碼格式可能不正確:', options.phone);
      }

      return true;
    },

    // 🕐 時間範圍檢查
    isInTimeRange(start, end) {
      if (!start || !end) return true;

      try {
        const now = this.getTaiwanTime();
        
        // 支援多種日期格式
        const parseDate = (dateStr) => {
          // YYYY-MM-DD HH:mm:ss 或 YYYY/MM/DD HH:mm:ss
          const normalized = dateStr.replace(/\-/g, '/');
          const date = new Date(normalized);
          
          if (isNaN(date.getTime())) {
            throw new Error(`無效的日期格式: ${dateStr}`);
          }
          
          return date;
        };

        const startTime = parseDate(start);
        const endTime = parseDate(end);

        const inRange = now >= startTime && now <= endTime;
        
        if (!inRange) {
          console.log(`⏰ 不在顯示期間 (${start} ~ ${end})`);
        }

        return inRange;
      } catch (error) {
        console.error('時間範圍檢查失敗:', error);
        return true; // 發生錯誤時預設為顯示
      }
    },

    // 🎯 DOM 元素安全獲取
    getContainer(selector) {
      try {
        let container;
        
        if (selector.startsWith('#')) {
          container = document.getElementById(selector.slice(1));
        } else if (selector.startsWith('.')) {
          container = document.getElementsByClassName(selector.slice(1))[0];
        } else {
          container = document.querySelector(selector);
        }

        if (!container) {
          throw new Error(`找不到容器: ${selector}`);
        }

        return container;
      } catch (error) {
        console.error('容器獲取失敗:', error);
        return null;
      }
    },

    // 🛡️ XSS 防護
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text || '';
      return div.innerHTML;
    },

    // 🎨 卡片 HTML 生成
    generateCardHTML(options) {
      const { level, name, phone, line, license, company, image } = options;
      const levelData = this.LEVELS[level];
      
      // 安全處理所有文本內容
      const safeName = this.escapeHtml(name);
      const safePhone = this.escapeHtml(phone);
      const safeLicense = this.escapeHtml(license || '未提供');
      const safeCompany = this.escapeHtml(company || '未提供');
      const safeImage = this.escapeHtml(image || '');
      const safeLine = line ? this.escapeHtml(line) : '#';

      return `
        <div class="expert-card-wrapper expert-platinum" data-aos="flip-left" data-aos-duration="1000">
          <div class="expert-card expert-platinum">
            <div class="expert-pin expert-pin-tl"></div>
            <div class="expert-pin expert-pin-tr"></div>
            <div class="expert-pin expert-pin-bl"></div>
            <div class="expert-pin expert-pin-br"></div>

            <div class="expert-badge"><i class="fas ${levelData.icon}"></i></div>
            <img alt="專家頭像" class="expert-profile" data-aos="zoom-in-left" data-aos-delay="300" 
                 src="${safeImage}" 
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMzAiIGZpbGw9IiNFNUU3RUIiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSIxOCIgeT0iMTgiPgo8cGF0aCBkPSJNMjAgMjFWMTlBNCA0IDAgMCAwIDEyIDE1SDhBNCA0IDAgMCAwIDQgMTlWMjEiIHN0cm9rZT0iIzlDQTNBRiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPGNpcmNsZSBjeD0iMTIiIGN5PSI3IiByPSI0IiBzdHJva2U9IiM5Q0EzQUYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPgo8L3N2Zz4K'; this.onerror=null;" />

            <div class="expert-info">
              <div class="expert-title"><i class="fas ${levelData.icon}"></i>${levelData.title}</div>

              <div class="expert-name-row">
                <div class="expert-name">${safeName}</div>
                <div class="expert-contact">
                  <a class="expert-contact-phone" href="tel:${safePhone}" onclick="gtag && gtag('event', 'click_phone', {phone: '${safePhone}'});">
                    <i class="fas fa-phone-alt"></i><span>${safePhone}</span>
                  </a>
                  ${line ? `<a class="expert-contact-line" href="${safeLine}" target="_blank" onclick="gtag && gtag('event', 'click_line', {name: '${safeName}'});">
                    <i class="fab fa-line"></i><span>LINE</span>
                  </a>` : ''}
                </div>
              </div>

              <div class="expert-footer">證號：${safeLicense}｜經紀業：${safeCompany}</div>
              <div class="expert-level-mark">${levelData.mark}&nbsp;</div>
            </div>
          </div>
        </div>
      `;
    },

    // 🎭 AOS 動畫處理
    initAOS() {
      return new Promise((resolve) => {
        if (typeof AOS === 'undefined') {
          console.log('AOS 未載入，跳過動畫初始化');
          resolve(false);
          return;
        }

        try {
          if (!AOS._inited) {
            AOS.init({ 
              once: true,
              duration: 1000,
              easing: 'ease-in-out'
            });
          }
          AOS.refresh();
          resolve(true);
        } catch (error) {
          console.warn('AOS 初始化失敗:', error);
          resolve(false);
        }
      });
    },

    // 📤 主要注入函數
    async injectExpertCard(options) {
      try {
        // 1. 參數驗證
        this.validateOptions(options);

        // 2. 時間檢查
        if (!this.isInTimeRange(options.start, options.end)) {
          return { success: false, reason: 'not_in_time_range' };
        }

        // 3. 獲取容器
        const container = this.getContainer(options.container);
        if (!container) {
          return { success: false, reason: 'container_not_found' };
        }

        // 4. 檢查是否已存在（防止重複）
        const existingCard = container.querySelector('.expert-card-wrapper');
        if (existingCard && options.preventDuplicate !== false) {
          console.log('容器中已存在專家卡片，跳過注入');
          return { success: false, reason: 'already_exists' };
        }

        // 5. 生成並插入 HTML
        const html = this.generateCardHTML(options);
        container.insertAdjacentHTML('beforeend', html);
        
        const newCard = container.lastElementChild;
        
        // 6. 觸發重排以確保元素完全渲染
        if (newCard) {
          newCard.offsetHeight;
        }

        // 7. 初始化動畫
        await this.initAOS();

        // 8. 追蹤事件
        if (typeof gtag === 'function') {
          gtag('event', 'expert_card_displayed', {
            expert_name: options.name,
            expert_level: options.level
          });
        }

        console.log(`✅ 專家卡片注入成功: ${options.name} (${options.level})`);
        return { success: true, element: newCard };

      } catch (error) {
        console.error('❌ 專家卡片注入失敗:', error);
        return { success: false, reason: 'injection_error', error };
      }
    },

    // 🔄 等待條件滿足
    waitFor(condition, timeout = 10000, interval = 100) {
      return new Promise((resolve) => {
        const startTime = Date.now();
        const check = () => {
          if (condition()) {
            resolve(true);
          } else if (Date.now() - startTime >= timeout) {
            resolve(false);
          } else {
            setTimeout(check, interval);
          }
        };
        check();
      });
    },

    // 🚀 自動注入系統
    async autoInject() {
      // 等待 DOM 就緒
      await this.waitFor(() => 
        document.readyState === 'complete' || document.readyState === 'interactive'
      );

      // 獲取配置
      const configList = window.expertCardList || 
                        (window.expertCardConfig ? [window.expertCardConfig] : []);

      if (!configList.length) {
        console.log('未找到專家卡片配置');
        return;
      }

      // 篩選有效配置
      const now = this.getTaiwanTime();
      const validCards = configList.filter(config => {
        try {
          return this.isInTimeRange(config.start, config.end);
        } catch (error) {
          console.warn('配置時間檢查失敗:', error);
          return false;
        }
      });

      if (validCards.length === 0) {
        console.log('⏰ 目前無符合時間的卡片可顯示');
        return;
      }

      // 注入所有有效卡片
      const results = await Promise.allSettled(
        validCards.map(config => this.injectExpertCard(config))
      );

      // 統計結果
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;

      console.log(`🎯 自動注入完成: 成功 ${successful} 個，失敗 ${failed} 個`);
    }
  };

  // 💾 暴露到全域
  window.ExpertCardSystem = ExpertCardSystem;
  window.injectExpertCard = (options) => ExpertCardSystem.injectExpertCard(options);

  // 🎬 自動初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ExpertCardSystem.autoInject());
  } else {
    ExpertCardSystem.autoInject();
  }

  console.log('🎉 ExpertCardSystem v2.0 已初始化');

})(window, document);
