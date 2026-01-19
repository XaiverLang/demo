// ==UserScript==
// @name         网站阅读优化脚本（重构版）
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  移除隐藏内容，提取小说正文，创建简洁阅读界面。特别处理class="jammer"的font元素。新增简繁转换功能。
// @author       Roo
// @match        *://*/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/opencc-js.min.js
// ==/UserScript==

(function() {
    'use strict';

    // 配置常量
    const CONFIG = {
        VERSION: '2.0',
        NOVEL_KEYWORDS: ['小说', '文學區'],
        CONTENT_SELECTOR: 'td.t_f',
        TITLE_SELECTOR: '#thread_subject',
        PAGE_ID_SELECTOR: '#pt',
        DETECTION_THRESHOLD: 0.05,
        DETECTION_SAMPLE_SIZE: 200,
        NOTIFICATION_DURATION: 2000
    };

    // 简繁字符对照表
    const CHINESE_CHARS = {
        TRADITIONAL: ['麼', '裡', '後', '麵', '發', '鬱', '龜', '體', '國', '學', '會'],
        SIMPLIFIED: ['么', '里', '后', '面', '发', '郁', '龟', '体', '国', '学', '会']
    };

    // 应用状态
    const AppState = {
        pageTraditional: null,
        converter: null,
        isInitialized: false
    };

    // 日志工具
    const Logger = {
        log: (message, ...args) => console.log(`[阅读优化] ${message}`, ...args),
        error: (message, ...args) => console.error(`[阅读优化] ${message}`, ...args),
        warn: (message, ...args) => console.warn(`[阅读优化] ${message}`, ...args)
    };

    // 简繁转换器模块
    const ChineseConverter = {
        async init() {
            if (AppState.converter) {
                return AppState.converter;
            }

            if (typeof OpenCC !== 'undefined') {
                try {
                    AppState.converter = {
                        s2t: OpenCC.Converter({ from: 'cn', to: 'tw' }),
                        t2s: OpenCC.Converter({ from: 'tw', to: 'cn' })
                    };
                    Logger.log('简繁转换器初始化成功');
                    return AppState.converter;
                } catch (error) {
                    Logger.error('简繁转换器初始化失败:', error);
                    throw error;
                }
            } else {
                const error = new Error('OpenCC库未加载');
                Logger.error(error.message);
                throw error;
            }
        },

        async convert(text, toTraditional) {
            if (!text) return text;

            try {
                await this.init();
                return toTraditional ? AppState.converter.s2t(text) : AppState.converter.t2s(text);
            } catch (error) {
                Logger.error('简繁转换失败:', error);
                return text;
            }
        },

        calculateTextDifference(text1, text2) {
            if (text1.length !== text2.length) {
                return 1;
            }

            let diffCount = 0;
            for (let i = 0; i < text1.length; i++) {
                if (text1[i] !== text2[i]) {
                    diffCount++;
                }
            }

            return diffCount / text1.length;
        },

        async detectChineseType(text) {
            if (!text || text.length < 10) {
                Logger.log('文本太短，使用启发式检测');
                return this.detectChineseTypeHeuristic(text);
            }

            try {
                await this.init();
                const sample = text.substring(0, Math.min(CONFIG.DETECTION_SAMPLE_SIZE, text.length));
                const s2tResult = await this.convert(sample, true);
                const t2sResult = await this.convert(sample, false);

                const s2tDiff = this.calculateTextDifference(sample, s2tResult);
                const t2sDiff = this.calculateTextDifference(sample, t2sResult);

                Logger.log(`简繁检测结果: s2t差异=${s2tDiff.toFixed(3)}, t2s差异=${t2sDiff.toFixed(3)}`);

                if (Math.abs(s2tDiff - t2sDiff) < CONFIG.DETECTION_THRESHOLD) {
                    Logger.log('差异太小，使用启发式检测');
                    return this.detectChineseTypeHeuristic(sample);
                }

                return t2sDiff > s2tDiff;
            } catch (error) {
                Logger.error('简繁检测失败，使用启发式检测:', error);
                return this.detectChineseTypeHeuristic(text);
            }
        },

        detectChineseTypeHeuristic(text) {
            if (!text || text.length < 5) {
                return true;
            }

            let traditionalCount = 0;
            let simplifiedCount = 0;

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                if (CHINESE_CHARS.TRADITIONAL.includes(char)) {
                    traditionalCount++;
                }
                if (CHINESE_CHARS.SIMPLIFIED.includes(char)) {
                    simplifiedCount++;
                }
            }

            Logger.log(`启发式检测: 繁体字符数=${traditionalCount}, 简体字符数=${simplifiedCount}`);

            if (traditionalCount > simplifiedCount * 1.5) {
                return true;
            }
            if (simplifiedCount > traditionalCount * 1.5) {
                return false;
            }

            const hasChinese = /[\u4e00-\u9fff]/.test(text);
            return hasChinese;
        }
    };

    // 内容提取模块
    const ContentExtractor = {
        isNovelPage() {
            const ptElement = document.querySelector(CONFIG.PAGE_ID_SELECTOR);
            return ptElement && ptElement.textContent &&
                   CONFIG.NOVEL_KEYWORDS.some(keyword => ptElement.textContent.includes(keyword));
        },

        removeHiddenSpans() {
            const hiddenSpans = document.querySelectorAll('span[style*="display:none"]');
            Logger.log(`找到 ${hiddenSpans.length} 个隐藏的span元素`);
            hiddenSpans.forEach(span => span.remove());
        },

        removeJammerFonts() {
            const jammerFonts = document.querySelectorAll('font.jammer, font[class*="jammer"], font[class~="jammer"]');
            Logger.log(`找到 ${jammerFonts.length} 个class="jammer"的font元素`);
            jammerFonts.forEach(font => font.remove());
        },

        extractNovelContent() {
            const contentElements = document.querySelectorAll(CONFIG.CONTENT_SELECTOR);
            if (contentElements.length === 0) {
                return null;
            }

            let fullText = '';

            contentElements.forEach((element, index) => {
                const clone = element.cloneNode(true);

                // 移除所有span标签
                clone.querySelectorAll('span').forEach(span => span.remove());

                // 处理font标签
                clone.querySelectorAll('font').forEach(font => {
                    if (font.classList && font.classList.contains('jammer')) {
                        font.remove();
                    } else {
                        const text = document.createTextNode(font.textContent);
                        font.parentNode.replaceChild(text, font);
                    }
                });

                // 处理div标签
                clone.querySelectorAll('div').forEach(div => {
                    const text = document.createTextNode(div.textContent);
                    div.parentNode.replaceChild(text, div);
                });

                // 处理br标签
                /* clone.querySelectorAll('br').forEach(br => {
                    br.parentNode.replaceChild(document.createTextNode('\n'), br);
                }); */

                let text = clone.textContent || clone.innerText;
                text = text.replace(/^[ \t]+|[ \t]+$/gm, '');
                text = text.replace(/[ \t]{2,}/g, ' ');

                /* if (text && index > 0) {
                    fullText += '\n';
                } */

                fullText += text;
            });

            return fullText;
        },

        getNovelTitle() {
            const titleElement = document.querySelector(CONFIG.TITLE_SELECTOR);
            return titleElement ? titleElement.textContent.trim() : '未知标题';
        }
    };

    // 阅读模式模块
    const ReadingMode = {
        container: null,
        contentDiv: null,
        titleDiv: null,

        create(content, title) {
            if (this.container) {
                this.container.remove();
            }

            this.container = document.createElement('div');
            this.container.id = 'novel-reading-mode';
            this.container.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: white;
                z-index: 9999;
                padding: 20px;
                overflow-y: auto;
                font-family: 'Microsoft YaHei', 'SimSun', sans-serif;
                line-height: 1.8;
                font-size: 18px;
                color: #333;
                display: none;
            `;

            const contentWrapper = document.createElement('div');
            contentWrapper.style.cssText = `
                max-width: 800px;
                margin: 0 auto;
            `;

            this.titleDiv = this.createTitle(title);
            this.contentDiv = this.createContent(content);

            contentWrapper.appendChild(this.titleDiv);
            contentWrapper.appendChild(this.contentDiv);
            this.container.appendChild(contentWrapper);
            document.body.appendChild(this.container);
        },

        createTitle(title) {
            const titleDiv = document.createElement('div');
            titleDiv.style.cssText = `
                text-align: center;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid #eee;
            `;

            const titleHeading = document.createElement('h1');
            titleHeading.id = 'novel-title';
            titleHeading.textContent = title;
            titleHeading.style.cssText = `
                font-size: 28px;
                font-weight: bold;
                color: #333;
                margin: 0;
                padding: 0;
            `;

            titleDiv.setAttribute('data-traditional', AppState.pageTraditional.toString());
            titleDiv.appendChild(titleHeading);
            return titleDiv;
        },

        createContent(content) {
            const contentDiv = document.createElement('div');
            contentDiv.id = 'novel-content';
            contentDiv.style.cssText = `
                white-space: pre-wrap;
                word-wrap: break-word;
            `;
            contentDiv.setAttribute('data-traditional', AppState.pageTraditional.toString());
            contentDiv.textContent = content;
            return contentDiv;
        },

        async updateContent() {
            if (!this.contentDiv) return;

            const novelContent = ContentExtractor.extractNovelContent();
            const titleContent = ContentExtractor.getNovelTitle();

            if (!novelContent) return;

            if (AppState.pageTraditional) {
                const convertedTitle = await ChineseConverter.convert(titleContent, true);
                const convertedText = await ChineseConverter.convert(novelContent, true);
                this.contentDiv.textContent = convertedText;
                this.titleDiv.querySelector('h1').textContent = convertedTitle;
            } else {
                this.contentDiv.textContent = novelContent;
                this.titleDiv.querySelector('h1').textContent = titleContent;
            }

            this.contentDiv.setAttribute('data-traditional', AppState.pageTraditional.toString());
        },

        toggle() {
            if (!this.container) return;

            const isVisible = this.container.style.display === 'block';
            const toggleBtn = document.querySelector('#reading-control-panel button');

            if (!isVisible) {
                this.container.style.display = 'block';
                if (toggleBtn) {
                    toggleBtn.textContent = '关闭阅读模式';
                    toggleBtn.style.background = '#f44336';
                }

                document.body.style.overflow = 'hidden';
                document.querySelectorAll('body > *').forEach(el => {
                    if (el.id !== 'novel-reading-mode' && el.id !== 'reading-control-panel') {
                        el.style.visibility = 'hidden';
                        el.style.position = 'absolute';
                    }
                });
            } else {
                this.container.style.display = 'none';
                if (toggleBtn) {
                    toggleBtn.textContent = '开启阅读模式';
                    toggleBtn.style.background = '#4CAF50';
                }

                document.body.style.overflow = '';
                document.querySelectorAll('body > *').forEach(el => {
                    if (el.id !== 'novel-reading-mode' && el.id !== 'reading-control-panel') {
                        el.style.visibility = '';
                        el.style.position = '';
                    }
                });
            }
        },

        async convertContent() {
            if (!this.contentDiv || !this.titleDiv) {
                throw new Error('未找到阅读模式内容');
            }

            const isTraditional = this.contentDiv.getAttribute('data-traditional') === 'true';
            const originalTitle = this.titleDiv.querySelector('h1').textContent;
            const originalText = this.contentDiv.textContent;

            const convertedTitle = await ChineseConverter.convert(originalTitle, !isTraditional);
            const convertedText = await ChineseConverter.convert(originalText, !isTraditional);

            this.titleDiv.querySelector('h1').textContent = convertedTitle;
            this.contentDiv.textContent = convertedText;

            this.titleDiv.setAttribute('data-traditional', (!isTraditional).toString());
            this.contentDiv.setAttribute('data-traditional', (!isTraditional).toString());


            Notification.show(AppState.pageTraditional ? '已转换为繁体中文' : '已转换为简体中文');
        }
    };

    // 控制面板模块
    const ControlPanel = {
        panel: null,

        create() {
            if (this.panel) {
                this.panel.remove();
            }

            this.panel = document.createElement('div');
            this.panel.id = 'reading-control-panel';
            this.panel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.85);
                color: white;
                padding: 12px;
                border-radius: 6px;
                z-index: 10000;
                font-family: Arial, sans-serif;
                font-size: 13px;
                box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                min-width: 140px;
                max-width: 160px;
            `;

            this.panel.appendChild(this.createTitle());
            this.panel.appendChild(this.createStatus());
            this.panel.appendChild(this.createButtons());
            this.panel.appendChild(this.createCloseButton());

            document.body.appendChild(this.panel);
        },

        createTitle() {
            const title = document.createElement('div');
            title.textContent = `阅读优化工具 ${CONFIG.VERSION}`;
            title.style.cssText = `
                font-weight: bold;
                margin-bottom: 8px;
                font-size: 14px;
                color: #4CAF50;
            `;
            return title;
        },

        createStatus() {
            const statusDiv = document.createElement('div');
            statusDiv.id = 'reading-status';
            const novelTitle = ContentExtractor.getNovelTitle();
            statusDiv.textContent = `当前小说: ${novelTitle}`;
            statusDiv.style.cssText = `
                margin-bottom: 8px;
                font-size: 11px;
                color: #ccc;
                max-width: 140px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            return statusDiv;
        },

        createButtons() {
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 6px;
            `;

            buttonContainer.appendChild(this.createButton('开启阅读模式', '#4CAF50', ReadingMode.toggle.bind(ReadingMode)));
            buttonContainer.appendChild(this.createButton('复制全文', '#2196F3', this.copyAllText));
            buttonContainer.appendChild(this.createButton('下载', '#9C27B0', this.downloadNovel));
            buttonContainer.appendChild(this.createButton('重新提取', '#FF9800', this.refreshContent));
            buttonContainer.appendChild(this.createButton(this.getConvertButtonText(), '#795548', this.toggleChineseConversion));

            return buttonContainer;
        },

        createButton(text, color, onClick) {
            const button = document.createElement('button');
            button.textContent = text;
            button.style.cssText = `
                background: ${color};
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                width: 100%;
            `;
            button.onclick = onClick;
            return button;
        },

        createCloseButton() {
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.style.cssText = `
                position: absolute;
                top: 5px;
                right: 5px;
                background: transparent;
                color: white;
                border: none;
                font-size: 18px;
                cursor: pointer;
                width: 24px;
                height: 24px;
                line-height: 24px;
                text-align: center;
            `;
            closeBtn.onclick = () => this.panel.style.display = 'none';
            return closeBtn;
        },

        getConvertButtonText() {
            return AppState.pageTraditional ? '繁体→简体' : '简体→繁体';
        },

        updateConvertButton() {
            const convertBtn = document.querySelector('#reading-control-panel button:last-child');
            if (convertBtn) {
                convertBtn.textContent = this.getConvertButtonText();
            }
        },

        async copyAllText() {
            const contentDiv = document.getElementById('novel-content');
            if (!contentDiv) return;

            const text = contentDiv.textContent;

            if (navigator.clipboard && window.isSecureContext) {
                try {
                    await navigator.clipboard.writeText(text);
                    Notification.show('文本已复制到剪贴板！');
                } catch (err) {
                    Logger.error('复制失败:', err);
                    this.fallbackCopyText(text);
                }
            } else {
                this.fallbackCopyText(text);
            }
        },

        fallbackCopyText(text) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    Notification.show('文本已复制到剪贴板！');
                } else {
                    Notification.show('复制失败，请手动选择文本复制。');
                }
            } catch (err) {
                Logger.error('复制失败:', err);
                Notification.show('复制失败，请手动选择文本复制。');
            }

            document.body.removeChild(textArea);
        },

        async downloadNovel() {
            const titleElement = document.querySelector(CONFIG.TITLE_SELECTOR);
            let novelTitle = titleElement ? titleElement.textContent.trim() : '未知标题';
            novelTitle = novelTitle.replace(/[\\/:*?"<>|]/g, '_');

            let text = '';
            const isReadingModeActive = ReadingMode.container && ReadingMode.container.style.display === 'block';

            if (isReadingModeActive) {
                const contentDiv = document.getElementById('novel-content');
                if (!contentDiv) {
                    Notification.show('未找到小说内容！');
                    return;
                }
                text = contentDiv.textContent;
            } else {
                const novelContent = ContentExtractor.extractNovelContent();
                if (!novelContent) {
                    Notification.show('未找到小说内容！');
                    return;
                }
                text = await ChineseConverter.convert(novelContent, AppState.pageTraditional);
            }

            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const downloadLink = document.createElement('a');
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = `${novelTitle}.txt`;
            downloadLink.style.display = 'none';

            document.body.appendChild(downloadLink);
            downloadLink.click();

            setTimeout(() => {
                document.body.removeChild(downloadLink);
                URL.revokeObjectURL(downloadLink.href);
                Notification.show(`小说已下载: ${novelTitle}.txt`);
            }, 100);
        },

        async refreshContent() {
            await ReadingMode.updateContent();
            Notification.show('内容已重新提取！');
        },

        async toggleChineseConversion() {
            const convertBtn = document.querySelector('#reading-control-panel button:last-child');
            if (convertBtn) {
                convertBtn.textContent = '转换中...';
                convertBtn.disabled = true;
            }

            try {
                // const isReadingModeActive = ReadingMode.container && ReadingMode.container.style.display === 'block';

                /* if (isReadingModeActive) {
                    await ReadingMode.convertContent();
                } else {
                    await ControlPanel.convertOriginalPage();
                } */

                await ReadingMode.convertContent();
                await ControlPanel.convertOriginalPage();
                AppState.pageTraditional = !AppState.pageTraditional;
                Notification.show(AppState.pageTraditional ? '已转换为繁体中文' : '已转换为简体中文');
                ControlPanel.updateConvertButton();
            } catch (error) {
                Logger.error('简繁转换失败:', error);
                Notification.show('转换失败，请重试');
            } finally {
                if (convertBtn) {
                    ControlPanel.updateConvertButton();
                    convertBtn.disabled = false;
                }
            }
        },

        async convertOriginalPage() {
            const newTraditionalState = !AppState.pageTraditional;

            const title = document.querySelector(CONFIG.TITLE_SELECTOR);
            if (title) {
                const convertTitle = await ChineseConverter.convert(title.textContent, newTraditionalState);
                title.textContent = convertTitle;
            }

            const contentElements = document.querySelectorAll(CONFIG.CONTENT_SELECTOR);
            if (contentElements.length === 0) {
                return;
            }

            Logger.log(`转换原始页面内容，目标: ${newTraditionalState ? '繁体' : '简体'}`);

            for (const element of contentElements) {
                await this.convertTextNodes(element, newTraditionalState);
            }

            //AppState.pageTraditional = newTraditionalState;

        },

        async convertTextNodes(element, toTraditional) {
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.trim()) {
                    textNodes.push(node);
                }
            }

            for (const textNode of textNodes) {
                const originalText = textNode.textContent;
                const convertedText = await ChineseConverter.convert(originalText, toTraditional);
                if (convertedText !== originalText) {
                    textNode.textContent = convertedText;
                }
            }
        }
    };

    // 通知模块
    const Notification = {
        show(message) {
            const existingNotification = document.getElementById('copy-notification');
            if (existingNotification) {
                existingNotification.remove();
            }

            const notification = document.createElement('div');
            notification.id = 'copy-notification';
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 12px 24px;
                border-radius: 4px;
                z-index: 10001;
                font-family: Arial, sans-serif;
                font-size: 14px;
                animation: fadeInOut 2s ease-in-out;
            `;

            const style = document.createElement('style');
            style.textContent = `
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    20% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    80% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                }
            `;
            document.head.appendChild(style);

            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, CONFIG.NOTIFICATION_DURATION);
        }
    };

    // 主应用
    const ReadingOptimizer = {
        async init() {
            if (AppState.isInitialized) {
                Logger.log('应用已初始化，跳过');
                return;
            }

            Logger.log('开始优化网站阅读体验...');

            if (!ContentExtractor.isNovelPage()) {
                Logger.log('非小说页面，不显示阅读优化面板');
                return;
            }

            try {
                ContentExtractor.removeHiddenSpans();
                ContentExtractor.removeJammerFonts();

                const novelContent = ContentExtractor.extractNovelContent();
                if (!novelContent) {
                    Logger.warn('未找到小说内容，使用原始页面');
                    AppState.pageTraditional = true;
                    return;
                }

                AppState.pageTraditional = await ChineseConverter.detectChineseType(novelContent);
                Logger.log(`检测到页面内容为: ${AppState.pageTraditional ? '繁体中文' : '简体中文'}`);

                const novelTitle = ContentExtractor.getNovelTitle();
                await ReadingMode.create(novelContent, novelTitle);
                ControlPanel.create();

                AppState.isInitialized = true;
                Logger.log('网站阅读优化脚本初始化完成！');
            } catch (error) {
                Logger.error('初始化失败:', error);
            }
        }
    };

    // 启动应用
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ReadingOptimizer.init().catch(error => {
                Logger.error('初始化失败:', error);
            });
        });
    } else {
        ReadingOptimizer.init().catch(error => {
            Logger.error('初始化失败:', error);
        });
    }
})();