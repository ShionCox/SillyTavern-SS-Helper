import { buildSettingsCardStylesTemplate } from './settingsCardStylesTemplate';
import { buildSettingsCardHtmlTemplate } from './settingsCardHtmlTemplate';
import type { TemplateSettingsIds } from './settingsCardTemplateTypes';
import manifestJson from '../../manifest.json';
import changelogData from '../../changelog.json';

// UI 组件的唯一命名空间
const NAMESPACE = 'stx-template';

// 解析生成更新日志 HTML
const generateChangelogHtml = () => {
    if (!Array.isArray(changelogData) || changelogData.length === 0) return '暂无更新记录';

    return changelogData.map(log => `
      <strong>${log.version}</strong>
      <ul>
        ${(log.changes || []).map((c: string) => `<li>${c}</li>`).join('')}
      </ul>
    `).join('');
};

const IDS: TemplateSettingsIds = {
    cardId: `${NAMESPACE}-card`,
    drawerToggleId: `${NAMESPACE}-drawer-toggle`,
    drawerContentId: `${NAMESPACE}-drawer-content`,
    drawerIconId: `${NAMESPACE}-drawer-icon`,
    displayName: manifestJson.display_name || 'SS-Helper Plugin',
    badgeId: `${NAMESPACE}-badge`,
    badgeText: `v${manifestJson.version || '1.0.0'}`,
    changelogHtml: generateChangelogHtml(),
    authorText: manifestJson.author || 'Author',
    emailText: (manifestJson as any).email || '',
    githubText: (manifestJson as any).homePage ? (manifestJson as any).homePage.replace(/^https?:\/\//i, '') : 'GitHub',
    githubUrl: (manifestJson as any).homePage || '#',
    searchId: `${NAMESPACE}-search`,

    tabMainId: `${NAMESPACE}-tab-main`,
    tabAboutId: `${NAMESPACE}-tab-about`,

    panelMainId: `${NAMESPACE}-panel-main`,
    panelAboutId: `${NAMESPACE}-panel-about`,

    enabledId: `${NAMESPACE}-enabled`,
};

/**
 * 等待元素出现在 DOM 中
 */
function waitForElement(selector: string, timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);

        const observer = new MutationObserver((mutations, obs) => {
            const el = document.querySelector(selector);
            if (el) {
                obs.disconnect();
                resolve(el);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
}

/**
 * 渲染设置卡片的主入口
 */
export async function renderTemplateSettings() {
    try {
        const container = await waitForElement('#extensions_settings');

        // 1. 注入独立 CSS
        if (!document.getElementById(`${IDS.cardId}-styles`)) {
            const styleEl = document.createElement('style');
            styleEl.id = `${IDS.cardId}-styles`;
            styleEl.innerHTML = buildSettingsCardStylesTemplate(IDS.cardId);
            document.head.appendChild(styleEl);
        }

        // 2. 注入 HTML 卡片
        let cardWrapper = document.getElementById(IDS.cardId);
        if (!cardWrapper) {
            cardWrapper = document.createElement('div');
            cardWrapper.id = IDS.cardId;
            cardWrapper.innerHTML = buildSettingsCardHtmlTemplate(IDS);
            container.appendChild(cardWrapper);
        }

        // 3. 绑定内部交互逻辑
        bindUiEvents();
    } catch (error) {
        console.error(`[TemplatePlugin] UI 渲染失败:`, error);
    }
}

/**
 * 绑定界面层交互事件
 */
function bindUiEvents() {
    // 3.1 标签页切换逻辑
    const tabs = [
        { tabId: IDS.tabMainId, panelId: IDS.panelMainId },
        { tabId: IDS.tabAboutId, panelId: IDS.panelAboutId },
    ];

    tabs.forEach(({ tabId, panelId }) => {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) return;

        tabEl.addEventListener('click', () => {
            tabs.forEach(t => {
                const tEl = document.getElementById(t.tabId);
                const pEl = document.getElementById(t.panelId);
                if (tEl) tEl.classList.remove('is-active');
                if (pEl) pEl.setAttribute('hidden', 'true');
            });

            const targetPanel = document.getElementById(panelId);
            tabEl.classList.add('is-active');
            if (targetPanel) {
                targetPanel.removeAttribute('hidden');
            }
        });
    });

    // 3.2 搜索过滤逻辑
    const searchInput = document.getElementById(IDS.searchId) as HTMLInputElement;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = (e.target as HTMLInputElement).value.toLowerCase().trim();
            const searchableItems = document.querySelectorAll('#' + IDS.cardId + ' [data-stx-ui-search]');

            searchableItems.forEach(el => {
                const keywords = el.getAttribute('data-stx-ui-search') || '';
                if (!term || keywords.toLowerCase().includes(term)) {
                    el.classList.remove('is-hidden-by-search');
                } else {
                    el.classList.add('is-hidden-by-search');
                }
            });
        });
    }

    // 在此处添加具体的配置项勾选和读写缓存逻辑
}
