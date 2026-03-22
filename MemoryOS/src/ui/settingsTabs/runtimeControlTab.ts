import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';
import { broadcast, logger, request, subscribe, toast } from '../../index';
import { getHealthSnapshot, setAiModeEnabled } from '../../llm/ai-health-center';
import { bindToggle, ensureMemorySettings, getStContext, syncCardDisabledState } from './sharedRuntime';

interface RuntimeControlTabBindOptions {
    ids: MemoryOSSettingsIds;
}

/**
 * 功能：构建“运行控制”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildRuntimeControlTabPanel(ids: MemoryOSSettingsIds): string {
    return `
      <div id="${ids.panelMainId}" class="stx-ui-panel stx-ui-advanced-subpanel">
        <div class="stx-ui-divider">
          <i class="fa-solid fa-power-off"></i>
          <span>基础开关</span>
          <div class="stx-ui-divider-line"></div>
        </div>

        <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="enable memory os switch">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">启用 Memory OS</div>
            <div class="stx-ui-item-desc">总开关。关闭后不再记录记忆。</div>
          </div>
          <div class="stx-ui-inline">
            <input id="${ids.enabledId}" type="checkbox" />
          </div>
        </label>

        <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="ai mode rule extraction">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">
              启用 AI 模式
              <i id="${ids.aiModeStatusLightId}" data-tip="显示与 LLMHub 的连接状态。" class="fa-solid fa-circle-question" style="color:#666;font-size:11px;margin-left:6px;" title="通信中..."></i>
            </div>
            <div class="stx-ui-item-desc">开启后使用 AI 提取事实；关闭后只使用规则模式。</div>
          </div>
          <div class="stx-ui-inline">
            <input id="${ids.aiModeEnabledId}" type="checkbox" />
          </div>
        </label>
      </div>
    `.trim();
}

/**
 * 功能：根据健康状态更新 AI 模式状态灯。
 * @param ids 控件 ID 集合。
 * @param alive 是否在线。
 * @param llmHubEnabled 是否可用。
 * @returns 无返回值。
 */
function updateLinkStatus(ids: MemoryOSSettingsIds, alive: boolean, llmHubEnabled: boolean): void {
    const aiLightEl = document.getElementById(ids.aiModeStatusLightId) as HTMLElement | null;
    const aiToggleEl = document.getElementById(ids.aiModeEnabledId) as HTMLInputElement | null;
    if (!aiLightEl || !aiToggleEl) {
        return;
    }
    if (alive && llmHubEnabled) {
        const snapshot = getHealthSnapshot();
        if (snapshot.diagnosisLevel === 'fully_operational') {
            aiLightEl.className = 'fa-solid fa-link';
            aiLightEl.style.color = 'var(--stx-memory-success)';
            aiLightEl.setAttribute('data-tip', snapshot.diagnosisText);
        } else if (
            snapshot.diagnosisLevel === 'online_partial_capabilities'
            || snapshot.diagnosisLevel === 'mounted_not_registered'
            || snapshot.diagnosisLevel === 'ai_mode_disabled'
        ) {
            aiLightEl.className = 'fa-solid fa-link';
            aiLightEl.style.color = 'var(--stx-memory-warning, #ff9800)';
            aiLightEl.setAttribute('data-tip', snapshot.diagnosisText);
        } else {
            aiLightEl.className = 'fa-solid fa-link';
            aiLightEl.style.color = 'var(--stx-memory-success)';
            aiLightEl.setAttribute('data-tip', 'LLMHub 通信正常。');
        }
        aiLightEl.removeAttribute('title');
        aiToggleEl.disabled = false;
        return;
    }
    const snapshot = getHealthSnapshot();
    aiLightEl.className = 'fa-solid fa-link-slash';
    aiLightEl.style.color = 'var(--stx-memory-danger-contrast)';
    aiLightEl.setAttribute(
        'data-tip',
        snapshot.diagnosisText || (alive
            ? 'LLMHub 当前处于关闭状态，AI 任务暂不可用；已保留当前 AI 模式开关设置。'
            : '未检测到 LLMHub，AI 任务暂不可用；已保留当前 AI 模式开关设置。'),
    );
    aiLightEl.removeAttribute('title');
    aiToggleEl.disabled = true;
}

/**
 * 功能：主动探测 LLMHub 状态。
 * @param ids 控件 ID 集合。
 * @param retries 剩余重试次数。
 * @returns 无返回值。
 */
function checkLLMHubStatus(ids: MemoryOSSettingsIds, retries: number = 5): void {
    request('plugin:request:ping', {}, 'stx_memory_os', { to: 'stx_llmhub', timeoutMs: 2000 })
        .then((response: { alive: boolean; isEnabled: boolean }): void => {
            updateLinkStatus(ids, response.alive, response.isEnabled);
        })
        .catch((error: Error): void => {
            if (retries > 0) {
                logger.warn(`[Network] LLMHub 尚未接管通信总线（${error.message}），等待重试。剩余次数：${retries}`);
                window.setTimeout((): void => checkLLMHubStatus(ids, retries - 1), 2500);
                return;
            }
            logger.error('[Network] 彻底放弃探测 LLMHub 实例', error);
            updateLinkStatus(ids, false, false);
        });
}

/**
 * 功能：绑定“运行控制”页签事件。
 * @param options 绑定参数。
 * @returns 无返回值。
 */
export function bindRuntimeControlTab(options: RuntimeControlTabBindOptions): void {
    const { ids } = options;
    bindToggle(ids.enabledId, 'enabled', (value: boolean): void => {
        syncCardDisabledState(ids.cardId, value);
        broadcast(
            'plugin:broadcast:state_changed',
            {
                pluginId: 'stx_memory_os',
                isEnabled: value,
            },
            'stx_memory_os',
        );
        if (!value) {
            return;
        }
        const plugin = (window as Window & {
            MemoryOSPlugin?: {
                refreshCurrentChatBinding?: () => Promise<void>;
            };
        }).MemoryOSPlugin;
        plugin?.refreshCurrentChatBinding?.().catch((error: unknown): void => {
            logger.error('启用后立即初始化当前聊天失败', error);
        });
    });
    syncCardDisabledState(ids.cardId, document.getElementById(ids.enabledId) instanceof HTMLInputElement
        ? (document.getElementById(ids.enabledId) as HTMLInputElement).checked
        : false);

    const aiToggleEl = document.getElementById(ids.aiModeEnabledId) as HTMLInputElement | null;
    if (aiToggleEl) {
        const initContext = getStContext();
        const initSettings = ensureMemorySettings(initContext);
        aiToggleEl.checked = initSettings.aiMode === true;
        setAiModeEnabled(aiToggleEl.checked);
        aiToggleEl.addEventListener('change', (event: Event): void => {
            if (aiToggleEl.disabled) {
                event.preventDefault();
                aiToggleEl.checked = false;
                toast.warning('微服务桥接失效：LLMHub 尚未启用或运行异常，无法使用 AI 集成功能。');
                return;
            }
            const currentContext = getStContext();
            if (currentContext) {
                const currentSettings = ensureMemorySettings(currentContext);
                currentSettings.aiMode = aiToggleEl.checked;
                currentContext.saveSettingsDebounced?.();
            }
            setAiModeEnabled(aiToggleEl.checked);
        });
    }

    subscribe(
        'plugin:broadcast:state_changed',
        (data: { isEnabled?: boolean }): void => {
            updateLinkStatus(ids, true, data?.isEnabled === true);
        },
        { from: 'stx_llmhub' },
    );
    checkLLMHubStatus(ids);
}
