// ==UserScript==
// @name         网站阅读优化脚本
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  移除隐藏内容，提取小说正文，创建简洁阅读界面。特别处理class="jammer"的font元素。新增简繁转换功能。
// @author       Roo
// @match        *://*/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/opencc-js.min.js
// ==/UserScript==

(function() {
    'use strict';

    // 页面简繁转换状态（将在init中根据页面内容初始化）
    // 在此段代码中， true代表繁体， false代表简体

    let pageTraditional = null;

    // 简繁转换器实例
    let converter = null;

    // 等待DOM加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init().catch(error => {
                console.error('初始化失败:', error);
            });
        });
    } else {
        init().catch(error => {
            console.error('初始化失败:', error);
        });
    }

    /**
     * 初始化简繁转换器
     * @returns {Promise} 转换器初始化完成的Promise
     */
    function initConverter() {
        return new Promise((resolve, reject) => {
            if (converter) {
                resolve(converter);
                return;
            }

            // 检查opencc-js是否已加载
            if (typeof OpenCC !== 'undefined') {
                try {
                    // 创建转换器实例
                    converter = {
                        s2t: OpenCC.Converter({ from: 'cn', to: 'tw' }),
                        t2s: OpenCC.Converter({ from: 'tw', to: 'cn' })
                    };
                    console.log('简繁转换器初始化成功');
                    resolve(converter);
                } catch (error) {
                    console.error('简繁转换器初始化失败:', error);
                    reject(error);
                }
            } else {
                console.error('OpenCC库未加载');
                reject(new Error('OpenCC库未加载'));
            }
        });
    }

    /**
     * 检测文本的简繁状态
     * @param {string} text 要检测的文本
     * @returns {Promise<boolean>} true: 繁体, false: 简体
     */
    async function detectChineseType(text) {
        if (!text || text.length < 10) {
            console.log('文本太短，使用启发式检测');
            return detectChineseTypeHeuristic(text);
        }

        try {
            await initConverter();

            // 提取前200个字符作为样本（更多字符提高准确性）
            const sample = text.substring(0, Math.min(200, text.length));

            // 尝试将样本从简体转换为繁体
            const s2tResult = converter.s2t(sample);
            // 尝试将样本从繁体转换为简体
            const t2sResult = converter.t2s(sample);

            // 计算转换后的变化程度
            const s2tDiff = calculateTextDifference(sample, s2tResult);
            const t2sDiff = calculateTextDifference(sample, t2sResult);

            console.log(`简繁检测结果: s2t差异=${s2tDiff.toFixed(3)}, t2s差异=${t2sDiff.toFixed(3)}`);

            // 添加阈值，避免微小差异导致的误判
            // 样品转繁的差异大于转简的差异 说明为简体
            // 样品转简的差异大于转繁的差异 说明为繁体
            const threshold = 0.05; // 5%的差异阈值
            if (Math.abs(s2tDiff - t2sDiff) < threshold) {
                console.log('差异太小，使用启发式检测');
                return detectChineseTypeHeuristic(sample);
            }

            return t2sDiff > s2tDiff;
        } catch (error) {
            console.error('简繁检测失败，使用启发式检测:', error);
            return detectChineseTypeHeuristic(text);
        }
    }

    /**
     * 启发式简繁检测（基于常见繁体字符）
     * @param {string} text 要检测的文本
     * @returns {boolean} true: 繁体, false: 简体
     */
    function detectChineseTypeHeuristic(text) {
        if (!text || text.length < 5) {
            return true; // 默认繁体
        }

        // 常见繁体字符（在简体中不常见或写法不同）
        const traditionalChars = ['麼', '裡', '後', '麵', '發', '鬱', '龜', '體', '國', '學', '會'];
        // 常见简体字符（在繁体中不常见或写法不同）
        const simplifiedChars = ['么', '里', '后', '面', '发', '郁', '龟', '体', '国', '学', '会'];

        let traditionalCount = 0;
        let simplifiedCount = 0;

        // 统计样本中的简繁字符
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (traditionalChars.includes(char)) {
                traditionalCount++;
            }
            if (simplifiedChars.includes(char)) {
                simplifiedCount++;
            }
        }

        console.log(`启发式检测: 繁体字符数=${traditionalCount}, 简体字符数=${simplifiedCount}`);

        // 如果找到的繁体字符明显多于简体字符，判断为繁体
        if (traditionalCount > simplifiedCount * 1.5) {
            return true;
        }
        // 如果找到的简体字符明显多于繁体字符，判断为简体
        if (simplifiedCount > traditionalCount * 1.5) {
            return false;
        }

        // 默认使用更保守的判断：如果文本包含中文，假设为繁体（因为目标网站主要是繁体）
        // 检查是否包含中文字符
        const hasChinese = /[\u4e00-\u9fff]/.test(text);
        return hasChinese; // 有中文则默认繁体，否则默认简体
    }

    /**
     * 计算两个文本的差异程度
     * @param {string} text1 文本1
     * @param {string} text2 文本2
     * @returns {number} 差异程度（0-1）
     */
    function calculateTextDifference(text1, text2) {
        if (text1.length !== text2.length) {
            return 1; // 长度不同，差异很大
        }

        let diffCount = 0;
        for (let i = 0; i < text1.length; i++) {
            if (text1[i] !== text2[i]) {
                diffCount++;
            }
        }

        return diffCount / text1.length;
    }

    /**
     * 简繁转换函数（使用opencc-js）
     * @param {string} text 要转换的文本
     * @param {boolean} toTraditional true: 简体转繁体, false: 繁体转简体
     * @returns {Promise<string>} 转换后的文本
     */
    async function convertChinese(text, toTraditional) {
        if (!text) return text;

        try {
            await initConverter();
            if (toTraditional) {
                return converter.s2t(text);
            } else {
                return converter.t2s(text);
            }
        } catch (error) {
            console.error('简繁转换失败:', error);
            return text; // 转换失败时返回原文本
        }
    }

    /**
     * 转换原始页面内容
     * @param {boolean} toTraditional true: 简体转繁体, false: 繁体转简体
     */
    async function convertOriginalPage(toTraditional) {

        const title = document.getElementById('thread_subject');
        if (title) {
            const convertTitle = await convertChinese(title.textContent, toTraditional);
            title.textContent = convertTitle;
        }

        const contentElements = document.querySelectorAll('td.t_f');
        if (contentElements.length === 0) {
            return;
        }

        console.log(`转换原始页面内容，目标: ${toTraditional ? '繁体' : '简体'}`);

        for (const element of contentElements) {
            // 转换元素内的所有文本节点
            await convertTextNodes(element, toTraditional);
        }
    }

    /**
     * 转换元素内的所有文本节点
     * @param {HTMLElement} element DOM元素
     * @param {boolean} toTraditional true: 简体转繁体, false: 繁体转简体
     */
    async function convertTextNodes(element, toTraditional) {
        // 获取元素内的所有文本节点
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.textContent.trim()) {
                textNodes.push(node);
            }
        }

        // 转换每个文本节点
        for (const textNode of textNodes) {
            const originalText = textNode.textContent;
            const convertedText = await convertChinese(originalText, toTraditional);
            if (convertedText !== originalText) {
                textNode.textContent = convertedText;
            }
        }
    }

    async function init() {
        console.log('开始优化网站阅读体验...');

        // 1. 检查是否为小说页面（id="pt"中包含"小说"）
        const ptElement = document.getElementById('pt');
        const isNovelPage = ptElement && ptElement.textContent && (ptElement.textContent.includes('小说') || ptElement.textContent.includes('文學區'));

        if (!isNovelPage) {
            console.log('非小说页面，不显示阅读优化面板');
            return;
        }

        // 2. 移除所有隐藏的span元素
        removeHiddenSpans();

        // 3. 移除所有class="jammer"的font元素
        removeJammerFonts();

        // 4. 提取小说主要内容
        const novelContent = extractNovelContent();

        if (novelContent) {
            // 5. 检测页面内容的简繁状态
            try {
                console.log('开始简繁状态检测...');
                pageTraditional = await detectChineseType(novelContent);
                console.log(`检测到页面内容为: ${pageTraditional ? '繁体中文' : '简体中文'}`);
                console.log(`pageTraditional值: ${pageTraditional}`);
            } catch (error) {
                console.error('简繁状态检测失败，使用默认值（繁体）:', error);
                pageTraditional = true; // 默认繁体
            }
            // 依据页面简繁 初始化参数
            // pageOriginalSorT 和 pageCurrentSorT 变量已移除，使用 pageTraditional 替代

            // 6. 获取小说标题
            const titleElement = document.getElementById('thread_subject');
            const novelTitle = titleElement ? titleElement.textContent.trim() : '未知标题';

            // 7. 创建阅读模式界面（包含标题）
            await createReadingMode(novelContent, novelTitle);

            // 8. 添加控制面板
            console.log('开始添加控制面板...');
            addControlPanel();
            console.log('控制面板添加完成');
        } else {
            console.warn('未找到小说内容，使用原始页面');
            // 如果没有找到小说内容，使用默认值
            pageTraditional = true;
        }
    }

    /**
     * 移除所有 style="display:none" 的span元素
     */
    function removeHiddenSpans() {
        const hiddenSpans = document.querySelectorAll('span[style*="display:none"]');
        console.log(`找到 ${hiddenSpans.length} 个隐藏的span元素`);

        hiddenSpans.forEach(span => {
            span.parentNode.removeChild(span);
        });
    }

    /**
     * 移除所有class="jammer"的font元素
     */
    function removeJammerFonts() {
        // 使用多种选择器来匹配jammer类
        const jammerFonts = document.querySelectorAll('font.jammer, font[class*="jammer"], font[class~="jammer"]');
        console.log(`找到 ${jammerFonts.length} 个class="jammer"的font元素`);

        jammerFonts.forEach(font => {
            // 直接移除元素，不保留其文本内容
            font.parentNode.removeChild(font);
        });
    }

    /**
     * 提取小说主要内容
     * @returns {string} 提取的文本内容
     */
    function extractNovelContent() {
        // 查找所有包含小说内容的td元素
        const contentElements = document.querySelectorAll('td.t_f');
        if (contentElements.length === 0) {
            return null;
        }

        let fullText = '';

        contentElements.forEach((element, index) => {
            // 克隆元素以避免修改原始DOM
            const clone = element.cloneNode(true);

            // 移除所有span标签（包括隐藏的和显示的）
            const spans = clone.querySelectorAll('span');
            spans.forEach(span => {
                span.parentNode.removeChild(span);
            });

            // 移除所有font标签，保留文本
            // 特别处理class="jammer"的font元素，直接移除不保留文本
            const fonts = clone.querySelectorAll('font');
            fonts.forEach(font => {
                if (font.classList && font.classList.contains('jammer')) {
                    // 直接移除jammer元素，不保留其文本内容
                    font.parentNode.removeChild(font);
                } else {
                    // 普通font标签，保留文本
                    const text = document.createTextNode(font.textContent);
                    font.parentNode.replaceChild(text, font);
                }
            });

            // 移除所有div标签，保留文本
            const divs = clone.querySelectorAll('div');
            divs.forEach(div => {
                const text = document.createTextNode(div.textContent);
                div.parentNode.replaceChild(text, div);
            });

            // 清理br标签，转换为换行
            const brs = clone.querySelectorAll('br');
            brs.forEach(br => {
                br.parentNode.replaceChild(document.createTextNode('\n'), br);
            });

            // 获取清理后的文本
            let text = clone.textContent || clone.innerText;

            // 保留原始的段落结构，只做最小清理：
            // 1. 清理行首行尾的空格（保留换行符）
            text = text.replace(/^[ \t]+|[ \t]+$/gm, '');

            // 2. 清理连续的空格（但保留单个空格）
            text = text.replace(/[ \t]{2,}/g, ' ');

            // 添加段落分隔
            if (text && index > 0) {
                fullText += '\n\n';
            }

            fullText += text;
        });

        return fullText;
    }

    /**
     * 创建阅读模式界面
     * @param {string} content 小说内容
     * @param {string} title 小说标题
     */
    async function createReadingMode(content, title) {
        // 创建阅读容器
        const readingContainer = document.createElement('div');
        readingContainer.id = 'novel-reading-mode';
        readingContainer.style.cssText = `
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

        // 创建内容区域容器
        const contentWrapper = document.createElement('div');
        contentWrapper.style.cssText = `
            max-width: 800px;
            margin: 0 auto;
        `;

        // 使用当前的页面简繁状态
        const isTraditional = pageTraditional;


        // 创建标题区域
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

        titleDiv.setAttribute('data-traditional', isTraditional.toString());
        titleDiv.appendChild(titleHeading);
        contentWrapper.appendChild(titleDiv);

        // 创建内容区域
        const contentDiv = document.createElement('div');
        contentDiv.id = 'novel-content';
        contentDiv.style.cssText = `
            white-space: pre-wrap;
            word-wrap: break-word;
        `;

        // 设置状态属性
        contentDiv.setAttribute('data-traditional', isTraditional.toString());

        // 初始状态 无需繁简转换，只需显示当前内容
        contentDiv.textContent = content;

        contentWrapper.appendChild(contentDiv);
        readingContainer.appendChild(contentWrapper);
        document.body.appendChild(readingContainer);
    }

    /**
     * 添加控制面板
     */
    function addControlPanel() {
        // 创建控制面板
        const controlPanel = document.createElement('div');
        controlPanel.id = 'reading-control-panel';
        controlPanel.style.cssText = `
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

        // 标题
        const title = document.createElement('div');
        title.textContent = '阅读优化工具 2.2';
        title.style.cssText = `
            font-weight: bold;
            margin-bottom: 8px;
            font-size: 14px;
            color: #4CAF50;
        `;
        controlPanel.appendChild(title);

        // 状态显示
        const statusDiv = document.createElement('div');
        statusDiv.id = 'reading-status';

        // 获取小说标题
        const titleElement = document.getElementById('thread_subject');
        const novelTitle = titleElement ? titleElement.textContent.trim() : '未知标题';

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
        controlPanel.appendChild(statusDiv);

        // 按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 6px;
        `;

        // 开启阅读模式按钮
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '开启阅读模式';
        toggleBtn.style.cssText = `
            background: #4CAF50;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            width: 100%;
        `;
        toggleBtn.onclick = toggleReadingMode;
        buttonContainer.appendChild(toggleBtn);

        // 复制全部按钮
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '复制全文';
        copyBtn.style.cssText = `
            background: #2196F3;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            width: 100%;
        `;
        copyBtn.onclick = copyAllText;
        buttonContainer.appendChild(copyBtn);

        // 下载小说按钮
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '下载';
        downloadBtn.style.cssText = `
            background: #9C27B0;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            width: 100%;
        `;
        downloadBtn.onclick = downloadNovel;
        buttonContainer.appendChild(downloadBtn);

        // 重新提取按钮
        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '重新提取';
        refreshBtn.style.cssText = `
            background: #FF9800;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            width: 100%;
        `;
        refreshBtn.onclick = async function() {
            const novelContent = extractNovelContent();
            if (novelContent) {
                const contentDiv = document.getElementById('novel-content');
                if (contentDiv) {
                    // 获取当前状态
                    const isTraditional = contentDiv.getAttribute('data-traditional') === 'true';

                    // 根据当前状态设置内容
                    if (isTraditional) {
                        // 转换整个内容为繁体
                        const convertedText = await convertChinese(novelContent, true);
                        contentDiv.textContent = convertedText;
                    } else {
                        // 页面是简体，直接使用原始内容
                        contentDiv.textContent = novelContent;
                    }
                    showNotification('内容已重新提取！');
                }
            }
        };
        buttonContainer.appendChild(refreshBtn);

        // 简繁转换按钮
        const convertBtn = document.createElement('button');
        convertBtn.id = 'convert-chinese-btn';
        // 根据当前状态设置初始文字
        const initialText = pageTraditional === null ? '简繁转换' : (pageTraditional ? '繁体→简体' : '简体→繁体');
        convertBtn.textContent = initialText;
        convertBtn.style.cssText = `
            background: #795548;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            width: 100%;
        `;
        convertBtn.onclick = toggleChineseConversion;
        buttonContainer.appendChild(convertBtn);

        // 更新按钮文字（确保使用最新状态）
        updateConvertButtonText();

        controlPanel.appendChild(buttonContainer);

        // 关闭按钮
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
        closeBtn.onclick = function() {
            controlPanel.style.display = 'none';
        };
        controlPanel.appendChild(closeBtn);

        // 添加到页面
        document.body.appendChild(controlPanel);
    }

    /**
     * 切换阅读模式
     */
    async function toggleReadingMode() {
        const readingMode = document.getElementById('novel-reading-mode');
        const toggleBtn = document.querySelector('#reading-control-panel button');

        if (readingMode.style.display === 'none' || !readingMode.style.display) {
            // 开启阅读模式前，确保内容与原始页面同步
            const contentDiv = document.getElementById('novel-content');
            if (contentDiv) {
                // 检查当前阅读模式内容的状态
                const readingModeTraditional = contentDiv.getAttribute('data-traditional') === 'true';

                // 如果阅读模式状态与当前页面状态不一致，更新内容
                if (readingModeTraditional !== pageTraditional) {
                    await updateReadingModeContent();
                }
            }

            readingMode.style.display = 'block';
            toggleBtn.textContent = '关闭阅读模式';
            toggleBtn.style.background = '#f44336';

            // 隐藏原始页面内容，但保留必要的元素
            document.body.style.overflow = 'hidden';
            document.querySelectorAll('body > *').forEach(el => {
                if (el.id !== 'novel-reading-mode' && el.id !== 'reading-control-panel') {
                    el.style.visibility = 'hidden';
                    el.style.position = 'absolute';
                }
            });
        } else {
            readingMode.style.display = 'none';
            toggleBtn.textContent = '开启阅读模式';
            toggleBtn.style.background = '#4CAF50';

            // 恢复原始页面内容
            document.body.style.overflow = '';
            document.querySelectorAll('body > *').forEach(el => {
                if (el.id !== 'novel-reading-mode' && el.id !== 'reading-control-panel') {
                    el.style.visibility = '';
                    el.style.position = '';
                }
            });
        }
    }

    /**
     * 下载小说为文本文件
     */
    async function downloadNovel() {
        // 获取小说标题
        const titleElement = document.getElementById('thread_subject');
        let novelTitle = titleElement ? titleElement.textContent.trim() : '未知标题';

        // 清理文件名：移除非法字符
        novelTitle = novelTitle.replace(/[\\/:*?"<>|]/g, '_');

        let text = '';

        // 检查阅读模式是否已开启
        const readingMode = document.getElementById('novel-reading-mode');
        const isReadingModeActive = readingMode && readingMode.style.display === 'block';

        if (isReadingModeActive) {
            // 阅读模式已开启，从阅读模式获取内容
            const contentDiv = document.getElementById('novel-content');
            if (!contentDiv) {
                showNotification('未找到小说内容！');
                return;
            }
            text = contentDiv.textContent;
        } else {
            // 阅读模式未开启，从原始页面获取内容
            const novelContent = extractNovelContent();
            if (!novelContent) {
                showNotification('未找到小说内容！');
                return;
            }

            // 根据当前页面状态转换内容
            if (pageTraditional) {
                // 页面是繁体，需要转换内容为繁体
                text = await convertChinese(novelContent, true);
            } else {
                // 页面是简体，直接使用原始内容
                text = novelContent;
            }
        }

        // 创建Blob对象
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });

        // 创建下载链接
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `${novelTitle}.txt`;
        downloadLink.style.display = 'none';

        // 添加到页面并触发点击
        document.body.appendChild(downloadLink);
        downloadLink.click();

        // 清理
        setTimeout(() => {
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(downloadLink.href);
            showNotification(`小说已下载: ${novelTitle}.txt`);
        }, 100);
    }

    /**
     * 复制全部文本
     */
    function copyAllText() {
        const contentDiv = document.getElementById('novel-content');
        if (!contentDiv) return;

        const text = contentDiv.textContent;

        // 使用现代Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                showNotification('文本已复制到剪贴板！');
            }).catch(err => {
                console.error('复制失败:', err);
                fallbackCopyText(text);
            });
        } else {
            fallbackCopyText(text);
        }
    }

    /**
     * 回退复制方法
     * @param {string} text 要复制的文本
     */
    function fallbackCopyText(text) {
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
                showNotification('文本已复制到剪贴板！');
            } else {
                showNotification('复制失败，请手动选择文本复制。');
            }
        } catch (err) {
            console.error('复制失败:', err);
            showNotification('复制失败，请手动选择文本复制。');
        }

        document.body.removeChild(textArea);
    }

    /**
     * 切换简繁转换
     */
    async function toggleChineseConversion() {
        // 显示加载状态
        const convertBtn = document.getElementById('convert-chinese-btn');
        if (convertBtn) {
            convertBtn.textContent = '转换中...';
            convertBtn.disabled = true;
        }

        try {
            const readingMode = document.getElementById('novel-reading-mode');
            const isReadingModeActive = readingMode && readingMode.style.display === 'block';

            // 计算新的状态
            const newTraditionalState = !pageTraditional;

            if (isReadingModeActive) {
                // 阅读模式已开启，转换阅读模式内容
                await convertReadingModeContent();

                // convertReadingModeContent 已经更新了 pageTraditional
                // 现在需要同步原始页面
                await convertOriginalPage(pageTraditional);
            } else {
                // 阅读模式未开启，转换原始页面内容
                await convertOriginalPage(newTraditionalState);

                // 更新页面状态
                pageTraditional = newTraditionalState;

                // 显示通知
                showNotification(pageTraditional ? '已转换为繁体中文' : '已转换为简体中文');

                // 更新按钮文字
                updateConvertButtonText();

                // 更新阅读模式内容（如果存在）
                await updateReadingModeContent();
            }

            // 确保状态属性同步
            const contentDiv = document.getElementById('novel-content');
            if (contentDiv) {
                contentDiv.setAttribute('data-traditional', pageTraditional.toString());
            }

        } catch (error) {
            console.error('简繁转换失败:', error);
            showNotification('转换失败，请重试');
        } finally {
            // 恢复按钮状态并更新文字
            if (convertBtn) {
                updateConvertButtonText();
                convertBtn.disabled = false;
            }
        }
    }

    /**
     * 转换阅读模式内容
     */
    async function convertReadingModeContent() {
        const contentDiv = document.getElementById('novel-content');
        const contentTitle = document.getElementById('novel-title');
        if (!contentDiv) {
            throw new Error('未找到阅读模式内容');
        }

        // 获取当前状态
        const isTraditional = contentDiv.getAttribute('data-traditional') === 'true';

        // 获取当前文本内容
        const originalTitle = contentTitle.textContent;
        const originalText = contentDiv.textContent;

        // 转换文本
        const convertedTitle = await convertChinese(originalTitle, !isTraditional);
        const convertedText = await convertChinese(originalText, !isTraditional);

        contentTitle.textContent = convertedTitle;
        contentDiv.textContent = convertedText;

        // 更新状态
        contentTitle.setAttribute('data-traditional', (!isTraditional).toString());
        contentDiv.setAttribute('data-traditional', (!isTraditional).toString());
        pageTraditional = !isTraditional;

        // 显示通知
        showNotification(pageTraditional ? '已转换为繁体中文' : '已转换为简体中文');
    }

    /**
     * 更新阅读模式内容以匹配当前页面状态
     */
    async function updateReadingModeContent() {
        const contentDiv = document.getElementById('novel-content');
        const contentTitle = document.getElementById('novel-title');
        if (!contentDiv) {
            return; // 阅读模式不存在，无需更新
        }

        // 获取当前页面状态
        const isTraditional = pageTraditional;

        // 获取原始内容（重新提取）
        const novelContent = extractNovelContent();
        const titleContent = document.getElementById('thread_subject') ? document.getElementById('thread_subject').textContent.trim() : '未知标题';
        if (!novelContent) {
            return;
        }

        // 根据当前状态设置内容
        if (isTraditional) {
            // 转换整个内容为繁体
            const convertedTitle = await convertChinese(titleContent, true);
            const convertedText = await convertChinese(novelContent, true);
            contentDiv.textContent = convertedText;
            contentTitle.textContent = convertedTitle;
            console.log(`updateupdatePanelTitle:名字已更新为 ${convertedTitle}`);
        } else {
            // 页面是简体，直接使用原始内容
            contentDiv.textContent = novelContent;
            contentTitle.textContent = titleContent;
            console.log(`updateupdatePanelTitle:名字已更新为 ${titleContent}`);
        }

        // 更新状态属性
        contentDiv.setAttribute('data-traditional', isTraditional.toString());

        // 更新按钮文字
        updateConvertButtonText();
    }

    /**
     * 获取当前简繁状态（处理null情况）
     * @returns {boolean} true: 繁体, false: 简体
     */
    function getCurrentTraditionalState() {
        if (pageTraditional === null) {
            // 如果pageTraditional为null，使用默认值（繁体）
            console.log('getCurrentTraditionalState: pageTraditional为null，使用默认值（繁体）');
            return true;
        }
        return pageTraditional;
    }

    /**
     * 更新简繁转换按钮文字
     */
    function updateConvertButtonText() {
        const convertBtn = document.getElementById('convert-chinese-btn');
        if (!convertBtn) {
            // 按钮可能尚未创建，这是正常情况，静默返回
            console.log('updateConvertButtonText: 按钮尚未创建，跳过更新');
            return;
        }

        // 获取当前状态
        const currentState = getCurrentTraditionalState();

        // 根据当前状态显示下一次转换的方向
        const newText = currentState ? '繁体→简体' : '简体→繁体';
        console.log(`updateConvertButtonText: 当前状态=${currentState ? '繁体' : '简体'}, 按钮文字="${newText}"`);

        if (convertBtn.textContent !== newText) {
            convertBtn.textContent = newText;
            console.log(`updateConvertButtonText: 按钮文字已更新为"${newText}"`);
        } else {
            console.log(`updateConvertButtonText: 按钮文字无需更新，当前已是"${newText}"`);
        }
    }

    // ==================== 新增：配置常量 ====================
    const CONFIG = {
        DETECTION: {
            SAMPLE_SIZE: 200,
            DIFF_THRESHOLD: 0.05,
            MIN_TEXT_LENGTH: 10,
            MIN_HEURISTIC_LENGTH: 5
        },
        CHINESE_CHARS: {
            TRADITIONAL: ['麼', '裡', '後', '麵', '發', '鬱', '龜', '體', '國', '學', '會'],
            SIMPLIFIED: ['么', '里', '后', '面', '发', '郁', '龟', '体', '国', '学', '会']
        }
    };

    // ==================== 新增：工具函数 ====================
    const Utils = {
        /**
         * 批量移除DOM元素
         * @param {string} selector - CSS选择器
         * @returns {number} 移除的元素数量
         */
        batchRemoveElements(selector) {
            const elements = document.querySelectorAll(selector);
            console.log(`Utils: 找到 ${elements.length} 个元素: ${selector}`);

            elements.forEach(element => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            });

            return elements.length;
        },

        /**
         * 清理文件名中的非法字符
         * @param {string} filename - 原始文件名
         * @returns {string} 清理后的文件名
         */
        sanitizeFilename(filename) {
            return filename.replace(/[\\/:*?"<>|]/g, '_');
        }
    };

    // ==================== 改进：移除隐藏元素函数 ====================
    function removeHiddenSpans() {
        const count = Utils.batchRemoveElements('span[style*="display:none"]');
        console.log(`改进版：移除了 ${count} 个隐藏的span元素`);
    }

    function removeJammerFonts() {
        const count = Utils.batchRemoveElements('font.jammer, font[class*="jammer"], font[class~="jammer"]');
        console.log(`改进版：移除了 ${count} 个class="jammer"的font元素`);
    }

    // ==================== 改进：简繁检测函数 ====================
    function detectChineseTypeHeuristic(text) {
        if (!text || text.length < CONFIG.DETECTION.MIN_HEURISTIC_LENGTH) {
            return true; // 默认繁体
        }

        const { TRADITIONAL, SIMPLIFIED } = CONFIG.CHINESE_CHARS;
        let traditionalCount = 0;
        let simplifiedCount = 0;

        // 统计样本中的简繁字符
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (TRADITIONAL.includes(char)) {
                traditionalCount++;
            }
            if (SIMPLIFIED.includes(char)) {
                simplifiedCount++;
            }
        }

        console.log(`改进版启发式检测: 繁体字符数=${traditionalCount}, 简体字符数=${simplifiedCount}`);

        // 如果找到的繁体字符明显多于简体字符，判断为繁体
        if (traditionalCount > simplifiedCount * 1.5) {
            return true;
        }
        // 如果找到的简体字符明显多于繁体字符，判断为简体
        if (simplifiedCount > traditionalCount * 1.5) {
            return false;
        }

        // 默认使用更保守的判断：如果文本包含中文，假设为繁体
        const hasChinese = /[\u4e00-\u9fff]/.test(text);
        return hasChinese;
    }

    async function detectChineseType(text) {
        if (!text || text.length < CONFIG.DETECTION.MIN_TEXT_LENGTH) {
            console.log('改进版：文本太短，使用启发式检测');
            return detectChineseTypeHeuristic(text);
        }

        try {
            await initConverter();

            // 提取样本字符
            const sample = text.substring(0, Math.min(CONFIG.DETECTION.SAMPLE_SIZE, text.length));

            // 尝试将样本从简体转换为繁体
            const s2tResult = converter.s2t(sample);
            // 尝试将样本从繁体转换为简体
            const t2sResult = converter.t2s(sample);

            // 计算转换后的变化程度
            const s2tDiff = calculateTextDifference(sample, s2tResult);
            const t2sDiff = calculateTextDifference(sample, t2sResult);

            console.log(`改进版简繁检测结果: s2t差异=${s2tDiff.toFixed(3)}, t2s差异=${t2sDiff.toFixed(3)}`);

            // 添加阈值，避免微小差异导致的误判
            if (Math.abs(s2tDiff - t2sDiff) < CONFIG.DETECTION.DIFF_THRESHOLD) {
                console.log('改进版：差异太小，使用启发式检测');
                return detectChineseTypeHeuristic(sample);
            }

            return t2sDiff > s2tDiff;
        } catch (error) {
            console.error('改进版：简繁检测失败，使用启发式检测:', error);
            return detectChineseTypeHeuristic(text);
        }
    }

    // ==================== 改进：下载函数 ====================
    async function downloadNovel() {
        // 获取小说标题
        const titleElement = document.getElementById('thread_subject');
        let novelTitle = titleElement ? titleElement.textContent.trim() : '未知标题';

        // 清理文件名：使用工具函数
        novelTitle = Utils.sanitizeFilename(novelTitle);

        let text = '';

        // 检查阅读模式是否已开启
        const readingMode = document.getElementById('novel-reading-mode');
        const isReadingModeActive = readingMode && readingMode.style.display === 'block';

        if (isReadingModeActive) {
            // 阅读模式已开启，从阅读模式获取内容
            const contentDiv = document.getElementById('novel-content');
            if (!contentDiv) {
                showNotification('未找到小说内容！');
                return;
            }
            text = contentDiv.textContent;
        } else {
            // 阅读模式未开启，从原始页面获取内容
            const novelContent = extractNovelContent();
            if (!novelContent) {
                showNotification('未找到小说内容！');
                return;
            }

            // 根据当前页面状态转换内容
            const currentState = getCurrentTraditionalState();
            if (currentState) {
                // 页面是繁体，需要转换内容为繁体
                text = await convertChinese(novelContent, true);
            } else {
                // 页面是简体，直接使用原始内容
                text = novelContent;
            }
        }

        // 创建Blob对象
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });

        // 创建下载链接
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `${novelTitle}.txt`;
        downloadLink.style.display = 'none';

        // 添加到页面并触发点击
        document.body.appendChild(downloadLink);
        downloadLink.click();

        // 清理
        setTimeout(() => {
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(downloadLink.href);
            showNotification(`小说已下载: ${novelTitle}.txt`);
        }, 100);
    }

    /**
     * 显示通知
     * @param {string} message 通知消息
     */
    function showNotification(message) {
        // 移除已有的通知
        const existingNotification = document.getElementById('copy-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // 创建新通知
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

        // 添加动画样式
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

        // 2秒后自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 2000);
    }

    console.log('网站阅读优化脚本加载完成！');
})();