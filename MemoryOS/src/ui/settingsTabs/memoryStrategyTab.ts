import { refreshSharedSelectOptions } from '../../../../_Components/sharedSelect';
import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';
import { ensureChatStrategyPanel, initializeChatStrategyPanel } from '../chatStrategyPanel';
import { DEFAULT_MEMORY_TUNING_PROFILE, type MemoryTuningProfile } from '../../types';
import {
    bindNumberInput,
    bindToggle,
    collectTaskPresentationSettings,
    readTaskPresentationSettings,
    saveTaskPresentationSettings,
    writeTaskPresentationInputs,
} from './sharedRuntime';

interface MemoryStrategyTabBindOptions {
    ids: MemoryOSSettingsIds;
    refreshExperiencePanels: () => Promise<void>;
}

/**
 * 功能：构建“记忆策略”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildMemoryStrategyTabPanel(ids: MemoryOSSettingsIds): string {
    return `
      <div id="${ids.panelAiId}" class="stx-ui-panel stx-ui-advanced-subpanel" hidden>
        <div class="stx-ui-divider">
          <i class="fa-solid fa-bars-staggered"></i>
          <span>上下文规则</span>
          <div class="stx-ui-divider-line"></div>
        </div>

        <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="max tokens context injection">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">上下文最大 Token 限制</div>
            <div class="stx-ui-item-desc">限制每次注入给 AI 的记忆长度。</div>
          </div>
          <div class="stx-ui-row">
            <input id="${ids.contextMaxTokensId}" data-tip="限制注入给 AI 的记忆长度。" class="text_pole stx-ui-input" type="number" min="500" max="8000" step="100" />
          </div>
        </div>

        <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="injection preview logger prompt context">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">开启注入预览</div>
            <div class="stx-ui-item-desc">开启后，每次 AI 生成前都会在日志中显示本轮注入内容，便于排查实际垫入了哪些记忆。</div>
          </div>
          <div class="stx-ui-inline">
            <input id="${ids.injectionPreviewEnabledId}" type="checkbox" />
          </div>
        </label>

        <div class="stx-ui-divider">
          <i class="fa-solid fa-layer-group"></i>
          <span>任务显示</span>
          <div class="stx-ui-divider-line"></div>
        </div>

        <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="task surface llm queue overlay toast composer">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">全局表现</div>
            <div class="stx-ui-item-desc">设置后台任务是否显示右下角任务卡、阻塞任务默认显示方式、结束后停留秒数，以及阻塞时是否锁定发送区。</div>
          </div>
          <div class="stx-ui-row stx-ui-grid-form">
            <label>
              <span style="display:block;font-size:12px;margin-bottom:4px;">阻塞默认显示</span>
              <select id="${ids.taskSurfaceBlockingDefaultId}" class="stx-ui-input">
                <option value="fullscreen_blocking">全屏阻塞</option>
                <option value="toast_blocking">Toast 阻塞</option>
              </select>
            </label>
            <label>
              <span style="display:block;font-size:12px;margin-bottom:4px;">结束后停留（秒）</span>
              <input id="${ids.taskSurfaceAutoCloseSecondsId}" class="text_pole stx-ui-input" type="number" min="0" max="30" step="1" data-tip="任务完成或失败后，任务卡继续停留的秒数；填 0 表示立即关闭。" />
            </label>
            <div class="stx-ui-field stx-ui-inline-toggle-field">
              <span class="stx-ui-field-label">后台任务显示卡片</span>
              <input id="${ids.taskSurfaceBackgroundToastId}" type="checkbox" />
            </div>
            <div class="stx-ui-field stx-ui-inline-toggle-field">
              <span class="stx-ui-field-label">阻塞时锁定发送区</span>
              <input id="${ids.taskSurfaceDisableComposerId}" type="checkbox" />
            </div>
          </div>
        </div>

        <div class="stx-ui-divider">
          <i class="fa-solid fa-sliders"></i>
          <span>聊天策略面板</span>
          <div class="stx-ui-divider-line"></div>
        </div>

        <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="chat strategy panel memory strategy summary profile retention">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">聊天策略概览</div>
            <div class="stx-ui-item-desc">继续使用现有聊天策略面板，查看当前聊天概况并进入详细编辑。</div>
          </div>
        </div>

        <div class="stx-ui-divider">
          <i class="fa-solid fa-wave-square"></i>
          <span>调参设置</span>
          <div class="stx-ui-divider-line"></div>
        </div>

        <div class="stx-ui-experience-grid">
          <section class="stx-ui-experience-card stx-ui-experience-card-wide stx-ui-search-item" data-stx-ui-search="memory tuning profile threshold relationship emotion recency continuity distortion retention">
            <div class="stx-ui-experience-card-head">
              <h3>调参设置</h3>
              <p>这里用于调整候选阈值、召回偏置和保留数量。修改后需要手动保存。</p>
            </div>
            <div class="stx-ui-form-grid stx-ui-memory-tuning-grid">
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">候选阈值偏置</span>
                <input id="${ids.tuningCandidateAcceptThresholdBiasId}" class="text_pole stx-ui-input" type="number" min="-0.2" max="0.2" step="0.01" />
              </label>
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">关系召回权重</span>
                <input id="${ids.tuningRecallRelationshipBiasId}" class="text_pole stx-ui-input" type="number" min="0" max="1" step="0.01" />
              </label>
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">情绪召回权重</span>
                <input id="${ids.tuningRecallEmotionBiasId}" class="text_pole stx-ui-input" type="number" min="0" max="1" step="0.01" />
              </label>
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">最近性权重</span>
                <input id="${ids.tuningRecallRecencyBiasId}" class="text_pole stx-ui-input" type="number" min="0" max="1" step="0.01" />
              </label>
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">连续性权重</span>
                <input id="${ids.tuningRecallContinuityBiasId}" class="text_pole stx-ui-input" type="number" min="0" max="1" step="0.01" />
              </label>
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">扭曲保护权重</span>
                <input id="${ids.tuningDistortionProtectionBiasId}" class="text_pole stx-ui-input" type="number" min="0" max="1" step="0.01" />
              </label>
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">召回日志上限</span>
                <input id="${ids.tuningRecallRetentionLimitId}" class="text_pole stx-ui-input" type="number" min="40" max="320" step="1" />
              </label>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.tuningRefreshBtnId}" type="button" class="stx-ui-btn secondary" data-tip="重新读取当前调参值。">
                <i class="fa-solid fa-rotate"></i>&nbsp;刷新当前参数
              </button>
              <button id="${ids.tuningResetBtnId}" type="button" class="stx-ui-btn secondary" data-tip="把表单恢复为默认调参画像。">
                <i class="fa-solid fa-rotate-left"></i>&nbsp;恢复默认值
              </button>
              <button id="${ids.tuningSaveBtnId}" type="button" class="stx-ui-btn" data-tip="保存当前调参设置。">
                <i class="fa-solid fa-floppy-disk"></i>&nbsp;保存参数
              </button>
            </div>
          </section>
        </div>
      </div>
    `.trim();
}

/**
 * 功能：把调参画像写回表单。
 * @param ids 控件 ID 集合。
 * @param profile 调参画像。
 * @returns 无返回值。
 */
function writeTuningInputs(ids: MemoryOSSettingsIds, profile: MemoryTuningProfile): void {
    const tuningFields: Array<{ inputId: string; value: number }> = [
        { inputId: ids.tuningCandidateAcceptThresholdBiasId, value: profile.candidateAcceptThresholdBias },
        { inputId: ids.tuningRecallRelationshipBiasId, value: profile.recallRelationshipBias },
        { inputId: ids.tuningRecallEmotionBiasId, value: profile.recallEmotionBias },
        { inputId: ids.tuningRecallRecencyBiasId, value: profile.recallRecencyBias },
        { inputId: ids.tuningRecallContinuityBiasId, value: profile.recallContinuityBias },
        { inputId: ids.tuningDistortionProtectionBiasId, value: profile.distortionProtectionBias },
        { inputId: ids.tuningRecallRetentionLimitId, value: profile.recallRetentionLimit },
    ];
    tuningFields.forEach((field: { inputId: string; value: number }): void => {
        const element = document.getElementById(field.inputId) as HTMLInputElement | null;
        if (element) {
            element.value = String(field.value);
        }
    });
}

/**
 * 功能：从表单收集调参画像补丁。
 * @param ids 控件 ID 集合。
 * @returns 调参画像补丁。
 */
function collectTuningProfilePatch(ids: MemoryOSSettingsIds): Partial<MemoryTuningProfile> {
    const readValue = (inputId: string, fallback: number): number => {
        const element = document.getElementById(inputId) as HTMLInputElement | null;
        const parsedValue = Number(element?.value);
        return Number.isFinite(parsedValue) ? parsedValue : fallback;
    };
    return {
        candidateAcceptThresholdBias: readValue(ids.tuningCandidateAcceptThresholdBiasId, DEFAULT_MEMORY_TUNING_PROFILE.candidateAcceptThresholdBias),
        recallRelationshipBias: readValue(ids.tuningRecallRelationshipBiasId, DEFAULT_MEMORY_TUNING_PROFILE.recallRelationshipBias),
        recallEmotionBias: readValue(ids.tuningRecallEmotionBiasId, DEFAULT_MEMORY_TUNING_PROFILE.recallEmotionBias),
        recallRecencyBias: readValue(ids.tuningRecallRecencyBiasId, DEFAULT_MEMORY_TUNING_PROFILE.recallRecencyBias),
        recallContinuityBias: readValue(ids.tuningRecallContinuityBiasId, DEFAULT_MEMORY_TUNING_PROFILE.recallContinuityBias),
        distortionProtectionBias: readValue(ids.tuningDistortionProtectionBiasId, DEFAULT_MEMORY_TUNING_PROFILE.distortionProtectionBias),
        recallRetentionLimit: readValue(ids.tuningRecallRetentionLimitId, DEFAULT_MEMORY_TUNING_PROFILE.recallRetentionLimit),
    };
}

/**
 * 功能：为任务展示控件绑定持久化保存。
 * @param ids 控件 ID 集合。
 * @returns 无返回值。
 */
function bindTaskPresentationInputs(ids: MemoryOSSettingsIds): void {
    const bindInput = (inputId: string, eventName: 'change' | 'blur' = 'change'): void => {
        const element = document.getElementById(inputId) as HTMLInputElement | HTMLSelectElement | null;
        if (!element) {
            return;
        }
        element.addEventListener(eventName, (): void => {
            saveTaskPresentationSettings(collectTaskPresentationSettings(ids));
        });
    };
    bindInput(ids.taskSurfaceBackgroundToastId, 'change');
    bindInput(ids.taskSurfaceDisableComposerId, 'change');
    bindInput(ids.taskSurfaceBlockingDefaultId, 'change');
    bindInput(ids.taskSurfaceAutoCloseSecondsId, 'change');
    bindInput(ids.taskSurfaceAutoCloseSecondsId, 'blur');
}

/**
 * 功能：绑定“记忆策略”页签事件。
 * @param options 绑定参数。
 * @returns 无返回值。
 */
export function bindMemoryStrategyTab(options: MemoryStrategyTabBindOptions): void {
    const { ids, refreshExperiencePanels } = options;
    bindNumberInput(ids.contextMaxTokensId, 'contextMaxTokens', 1200, 500, 8000);
    bindToggle(ids.injectionPreviewEnabledId, 'injectionPreviewEnabled');
    writeTaskPresentationInputs(ids, readTaskPresentationSettings(), refreshSharedSelectOptions);
    bindTaskPresentationInputs(ids);

    const aiPanel = document.getElementById(ids.panelAiId) as HTMLElement | null;
    if (aiPanel) {
        ensureChatStrategyPanel(aiPanel);
        void initializeChatStrategyPanel();
    }

    const tuningRefreshButton = document.getElementById(ids.tuningRefreshBtnId);
    if (tuningRefreshButton) {
        tuningRefreshButton.addEventListener('click', async (): Promise<void> => {
            await refreshExperiencePanels();
        });
    }

    const tuningResetButton = document.getElementById(ids.tuningResetBtnId);
    if (tuningResetButton) {
        tuningResetButton.addEventListener('click', (): void => {
            writeTuningInputs(ids, DEFAULT_MEMORY_TUNING_PROFILE);
        });
    }

    const tuningSaveButton = document.getElementById(ids.tuningSaveBtnId) as HTMLButtonElement | null;
    if (tuningSaveButton) {
        tuningSaveButton.addEventListener('click', async (): Promise<void> => {
            const memory = (window as unknown as Window & {
                STX?: {
                    memory?: {
                        chatState?: {
                            setMemoryTuningProfile?: (patch: Partial<MemoryTuningProfile>) => Promise<MemoryTuningProfile>;
                        };
                    };
                };
            }).STX?.memory;
            if (!memory?.chatState?.setMemoryTuningProfile) {
                alert('请先启动 Memory OS。');
                return;
            }
            tuningSaveButton.setAttribute('disabled', 'true');
            try {
                await memory.chatState.setMemoryTuningProfile(collectTuningProfilePatch(ids));
                await refreshExperiencePanels();
                alert('记忆调参已保存。');
            } catch (error) {
                alert(`保存调参失败：${String(error)}`);
            } finally {
                tuningSaveButton.removeAttribute('disabled');
            }
        });
    }
}
