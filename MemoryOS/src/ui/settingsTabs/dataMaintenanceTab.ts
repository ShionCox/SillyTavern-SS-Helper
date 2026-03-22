import { refreshSharedSelectOptions } from '../../../../_Components/sharedSelect';
import type {
    DBEvent,
    DBFact,
    DBMeta,
    DBSummary,
    DBTemplate,
    DBTemplateBinding,
    DBWorldState,
} from '../../db/db';
import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';
import { filterRecordText } from '../../core/record-filter';
import { logger, request, toast } from '../../index';
import { bindToggle, readRecordFilterSettings, readSettingBoolean, saveRecordFilterSettings } from './sharedRuntime';
import { openRecordEditor } from '../recordEditor';
import { bindDataMaintenanceAuditSection } from './dataMaintenanceAuditSection';
import { bindDataMaintenanceMutationHistorySection } from './dataMaintenanceMutationHistorySection';
import { bindDataMaintenanceTemplateSection } from './dataMaintenanceTemplateSection';
import { bindDataMaintenanceWorldInfoSection } from './dataMaintenanceWorldInfoSection';

interface DataMaintenanceTabBindOptions {
    ids: MemoryOSSettingsIds;
    cardId: string;
}

type RecordFilterUiSettings = ReturnType<typeof readRecordFilterSettings>;

let autoCompactionTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 功能：构建“数据维护”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildDataMaintenanceTabPanel(ids: MemoryOSSettingsIds): string {
    return `
      <div id="${ids.panelDbId}" class="stx-ui-panel stx-ui-advanced-subpanel" hidden>
        <div class="stx-ui-divider">
          <i class="fa-solid fa-database"></i>
          <span>数据维护</span>
          <div class="stx-ui-divider-line"></div>
        </div>
        <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="auto compaction archive" data-stx-db-group="compaction">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">自动事件压缩</div>
            <div class="stx-ui-item-desc">开启后，事件较多时会自动进行压缩。</div>
          </div>
          <div class="stx-ui-inline"><input id="${ids.autoCompactionId}" type="checkbox" /></div>
        </label>
        <div id="${ids.dbCompactionDividerId}" class="stx-ui-divider">
          <i class="fa-solid fa-box-archive"></i>
          <span>压缩与清理</span>
          <div class="stx-ui-divider-line"></div>
        </div>
        <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="manual actions db export clear compact" data-stx-db-group="compaction">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">维护操作</div>
            <div class="stx-ui-item-desc">手动执行压缩、导入导出、清空和原始记录维护。</div>
          </div>
          <div class="stx-ui-actions">
            <button id="${ids.dbCompactBtnId}" type="button" class="stx-ui-btn">立即压缩</button>
            <button id="${ids.recordEditorBtnId}" type="button" class="stx-ui-btn"><i class="fa-solid fa-pen-to-square"></i>&nbsp;记录编辑</button>
            <button id="${ids.dbExportBtnId}" type="button" class="stx-ui-btn secondary">导出记忆包</button>
            <button id="${ids.dbImportBtnId}" type="button" class="stx-ui-btn secondary">导入记忆包</button>
            <button id="${ids.dbClearBtnId}" type="button" class="stx-ui-btn secondary" style="color:#ff8787;border-color:rgba(255,135,135,0.3);">清空当前聊天数据</button>
          </div>
        </div>
        <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="bus inspector connection test ping hello">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">微服务通信自检（Bus Inspector）</div>
            <div class="stx-ui-item-desc">用于检查 MemoryOS 与 LLMHub 是否连通。</div>
          </div>
          <div class="stx-ui-actions">
            <button id="${ids.testPingBtnId}" type="button" class="stx-ui-btn secondary">发送 Ping 测试</button>
            <button id="${ids.testHelloBtnId}" type="button" class="stx-ui-btn secondary">向 LLMHub 打招呼</button>
          </div>
        </div>
        <div class="stx-ui-divider">
          <i class="fa-solid fa-filter"></i>
          <span>记录过滤</span>
          <div class="stx-ui-divider-line"></div>
        </div>
        <section id="${ids.recordFilterSectionId}">
          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="record filter enable">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">启用记录过滤</div>
              <div class="stx-ui-item-desc">只保留可读、有效的内容入库。</div>
            </div>
            <div class="stx-ui-inline"><input id="${ids.recordFilterEnabledId}" type="checkbox" /></div>
          </label>
          <div id="${ids.recordFilterDetailWrapId}" class="stx-ui-filter-group">
            <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="record filter level json mode pure code policy">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">过滤策略</div>
                <div class="stx-ui-item-desc">设置过滤强度、JSON 提取和纯代码处理策略。</div>
              </div>
              <div class="stx-ui-row stx-ui-grid-form">
                <label><span style="display:block;font-size:12px;margin-bottom:4px;">过滤强度</span><select id="${ids.recordFilterLevelId}" class="stx-ui-input"><option value="light">轻度</option><option value="balanced">平衡</option><option value="strict">严格</option></select></label>
                <label><span style="display:block;font-size:12px;margin-bottom:4px;">JSON 提取</span><select id="${ids.recordFilterJsonModeId}" class="stx-ui-input"><option value="off">关闭</option><option value="smart">智能提取</option><option value="all_strings">全部字符串</option></select></label>
                <label><span style="display:block;font-size:12px;margin-bottom:4px;">纯代码处理</span><select id="${ids.recordFilterPureCodePolicyId}" class="stx-ui-input"><option value="drop">丢弃</option><option value="placeholder">写入占位</option><option value="keep">保留原文</option></select></label>
              </div>
            </div>
            <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="record filter type html xml json markdown codeblock">
              <div class="stx-ui-item-main"><div class="stx-ui-item-title">过滤类型</div><div class="stx-ui-item-desc">按类型开启或关闭 HTML、XML、JSON、Markdown 和代码块过滤。</div></div>
              <div class="stx-ui-row stx-ui-grid-form">
                <label class="stx-ui-field stx-ui-inline-toggle-field"><span class="stx-ui-field-label">HTML</span><input id="${ids.recordFilterTypeHtmlId}" type="checkbox" /></label>
                <label class="stx-ui-field stx-ui-inline-toggle-field"><span class="stx-ui-field-label">XML</span><input id="${ids.recordFilterTypeXmlId}" type="checkbox" /></label>
                <label class="stx-ui-field stx-ui-inline-toggle-field"><span class="stx-ui-field-label">JSON</span><input id="${ids.recordFilterTypeJsonId}" type="checkbox" /></label>
                <label class="stx-ui-field stx-ui-inline-toggle-field"><span class="stx-ui-field-label">代码块</span><input id="${ids.recordFilterTypeCodeblockId}" type="checkbox" /></label>
                <label class="stx-ui-field stx-ui-inline-toggle-field"><span class="stx-ui-field-label">Markdown</span><input id="${ids.recordFilterTypeMarkdownId}" type="checkbox" /></label>
              </div>
            </div>
            <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="record filter custom codeblock custom regex placeholder keys">
              <div class="stx-ui-item-main"><div class="stx-ui-item-title">高级规则</div><div class="stx-ui-item-desc">控制自定义代码块标签、JSON Key、占位文案和自定义正则规则。</div></div>
              <div class="stx-ui-form-grid">
                <label class="stx-ui-field"><span class="stx-ui-field-label">JSON Keys</span><input id="${ids.recordFilterJsonKeysId}" class="text_pole stx-ui-input" type="text" /></label>
                <label class="stx-ui-field"><span class="stx-ui-field-label">占位文案</span><input id="${ids.recordFilterPlaceholderId}" class="text_pole stx-ui-input" type="text" /></label>
                <label class="stx-ui-field"><span class="stx-ui-field-label">最大文本长度</span><input id="${ids.recordFilterMaxTextLengthId}" class="text_pole stx-ui-input" type="number" /></label>
                <label class="stx-ui-field"><span class="stx-ui-field-label">最少有效字符</span><input id="${ids.recordFilterMinEffectiveCharsId}" class="text_pole stx-ui-input" type="number" /></label>
              </div>
              <div class="stx-ui-row stx-ui-grid-form">
                <div class="stx-ui-field stx-ui-inline-toggle-field"><span class="stx-ui-field-label">启用自定义代码块过滤</span><input id="${ids.recordFilterCustomCodeblockEnabledId}" type="checkbox" /></div>
                <div class="stx-ui-field stx-ui-inline-toggle-field"><span class="stx-ui-field-label">启用自定义正则清理</span><input id="${ids.recordFilterCustomRegexEnabledId}" type="checkbox" /></div>
              </div>
              <textarea id="${ids.recordFilterCustomCodeblockTagsId}" class="text_pole stx-ui-input" rows="3" style="width:100%;"></textarea>
              <textarea id="${ids.recordFilterCustomRegexRulesId}" class="text_pole stx-ui-input" rows="4" style="width:100%;margin-top:8px;"></textarea>
            </div>
            <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="record filter preview">
              <div class="stx-ui-item-main"><div class="stx-ui-item-title">过滤预览</div><div class="stx-ui-item-desc">输入原文，仅预览不过库。</div></div>
              <textarea id="${ids.recordFilterPreviewInputId}" class="text_pole stx-ui-input" rows="4" style="width:100%;"></textarea>
              <div class="stx-ui-actions"><button id="${ids.recordFilterPreviewBtnId}" type="button" class="stx-ui-btn secondary">预览过滤结果</button></div>
              <pre id="${ids.recordFilterPreviewOutputId}" style="width:100%;white-space:pre-wrap;word-break:break-word;font-size:12px;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;margin:0;"></pre>
            </div>
          </div>
        </section>
        <div class="stx-ui-divider"><i class="fa-solid fa-table-columns"></i><span>世界模板</span><div class="stx-ui-divider-line"></div></div>
        <div class="stx-ui-item stx-ui-item-stack stx-ui-template-panel stx-ui-search-item" data-stx-ui-search="template schema world template">
          <div class="stx-ui-item-main"><div class="stx-ui-item-title">当前绑定的世界 Schema</div><div class="stx-ui-item-desc">显示当前聊天使用的模板结构。</div></div>
          <div id="${ids.templateListId}" class="stx-ui-code-surface stx-ui-template-list">正在加载...</div>
          <div class="stx-ui-actions stx-ui-template-toolbar">
            <button id="${ids.templateRefreshBtnId}" type="button" class="stx-ui-btn"><i class="fa-solid fa-rotate"></i>&nbsp;刷新模板列表</button>
            <button id="${ids.templateForceRebuildBtnId}" type="button" class="stx-ui-btn secondary"><i class="fa-solid fa-wand-magic-sparkles"></i>&nbsp;强制重建模板</button>
          </div>
          <div class="stx-ui-template-activate-row">
            <select id="${ids.templateActiveSelectId}" class="stx-ui-input"><option value="">选择要激活的模板...</option></select>
            <label class="stx-ui-inline-checkbox is-compact"><input id="${ids.templateLockId}" type="checkbox" /><span>锁定模板</span></label>
            <button id="${ids.templateSetActiveBtnId}" type="button" class="stx-ui-btn stx-ui-template-apply-btn">应用</button>
          </div>
        </div>
        <div class="stx-ui-item stx-ui-search-item" style="flex-direction:column;align-items:flex-start;gap:10px;" data-stx-ui-search="world info writeback preview">
          <div class="stx-ui-item-main"><div class="stx-ui-item-title">写回到世界书</div><div class="stx-ui-item-desc">把记忆写回世界书，后续可直接注入。</div></div>
          <div id="${ids.wiPreviewId}" style="width:100%;font-size:11px;color:#aaa;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px;max-height:100px;overflow-y:auto;font-family:monospace;"></div>
          <div class="stx-ui-actions">
            <button id="${ids.wiPreviewBtnId}" type="button" class="stx-ui-btn secondary"><i class="fa-solid fa-eye"></i>&nbsp;预览写回内容</button>
            <button id="${ids.wiWritebackBtnId}" type="button" class="stx-ui-btn"><i class="fa-solid fa-upload"></i>&nbsp;写回到世界书（全部）</button>
            <button id="${ids.wiWriteSummaryBtnId}" type="button" class="stx-ui-btn secondary"><i class="fa-solid fa-file-lines"></i>&nbsp;仅写回摘要</button>
          </div>
        </div>
        <div class="stx-ui-divider"><i class="fa-solid fa-clock-rotate-left"></i><span>审计与历史</span><div class="stx-ui-divider-line"></div></div>
        <div class="stx-ui-item stx-ui-search-item" style="flex-direction:column;align-items:flex-start;gap:12px;" data-stx-ui-search="audit snapshot rollback history">
          <div class="stx-ui-item-main"><div class="stx-ui-item-title">快照操作</div><div class="stx-ui-item-desc">先保存一个快照，之后可一键回滚。</div></div>
          <div class="stx-ui-actions">
            <button id="${ids.auditCreateSnapshotBtnId}" type="button" class="stx-ui-btn"><i class="fa-solid fa-camera"></i>&nbsp;创建快照</button>
            <button id="${ids.auditRefreshBtnId}" type="button" class="stx-ui-btn secondary"><i class="fa-solid fa-rotate"></i>&nbsp;刷新审计记录</button>
          </div>
          <div id="${ids.auditListId}" style="width:100%;font-size:12px;color:var(--ss-theme-text,#ccc);background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;max-height:360px;overflow-y:auto;font-family:monospace;">正在加载审计记录...</div>
        </div>
        <div class="stx-ui-item stx-ui-search-item" style="flex-direction:column;align-items:flex-start;gap:12px;" data-stx-ui-search="mutation history long term memory">
          <div class="stx-ui-item-main"><div class="stx-ui-item-title">长期记忆变更历史</div><div class="stx-ui-item-desc">按时间倒序查看已执行的长期记忆变更，仅用于追踪和解释。</div></div>
          <div class="stx-ui-actions"><button id="${ids.mutationHistoryRefreshBtnId}" type="button" class="stx-ui-btn secondary"><i class="fa-solid fa-rotate"></i>&nbsp;刷新历史</button></div>
          <div id="${ids.mutationHistoryListId}" style="width:100%;font-size:12px;color:var(--ss-theme-text,#ccc);background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;max-height:360px;overflow-y:auto;font-family:monospace;">正在加载变更历史...</div>
        </div>
      </div>
    `.trim();
}

/**
 * 功能：同步压缩分组标题显示状态。
 * @param ids 控件 ID 集合。
 * @returns 无返回值。
 */
function syncDbCompactionDividerVisibility(ids: MemoryOSSettingsIds): void {
    const panelDbEl = document.getElementById(ids.panelDbId) as HTMLElement | null;
    const dividerEl = document.getElementById(ids.dbCompactionDividerId) as HTMLElement | null;
    if (!panelDbEl || !dividerEl) {
        return;
    }
    const hasVisibleItem = Array.from(panelDbEl.querySelectorAll<HTMLElement>('.stx-ui-search-item[data-stx-db-group="compaction"]'))
        .some((item: HTMLElement): boolean => {
            let cursor: HTMLElement | null = item;
            while (cursor && cursor !== panelDbEl) {
                if (cursor.hidden || cursor.classList.contains('is-hidden-by-search')) {
                    return false;
                }
                cursor = cursor.parentElement as HTMLElement | null;
            }
            return true;
        });
    dividerEl.hidden = !hasVisibleItem;
}

/**
 * 功能：把记录过滤配置写回表单。
 * @param ids 控件 ID 集合。
 * @param settings 配置对象。
 * @returns 无返回值。
 */
function applyRecordFilterFormValues(ids: MemoryOSSettingsIds, settings: RecordFilterUiSettings): void {
    const enabledEl = document.getElementById(ids.recordFilterEnabledId) as HTMLInputElement | null;
    const detailWrapEl = document.getElementById(ids.recordFilterDetailWrapId) as HTMLElement | null;
    const assignChecked = (inputId: string, value: boolean): void => {
        const element = document.getElementById(inputId) as HTMLInputElement | null;
        if (element) {
            element.checked = value;
        }
    };
    const assignValue = (inputId: string, value: string): void => {
        const element = document.getElementById(inputId) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
        if (element) {
            element.value = value;
        }
    };
    if (enabledEl) {
        enabledEl.checked = settings.enabled;
    }
    if (detailWrapEl) {
        detailWrapEl.hidden = settings.enabled !== true;
    }
    assignValue(ids.recordFilterLevelId, settings.level);
    assignChecked(ids.recordFilterTypeHtmlId, settings.filterTypes.includes('html'));
    assignChecked(ids.recordFilterTypeXmlId, settings.filterTypes.includes('xml'));
    assignChecked(ids.recordFilterTypeJsonId, settings.filterTypes.includes('json'));
    assignChecked(ids.recordFilterTypeCodeblockId, settings.filterTypes.includes('codeblock'));
    assignChecked(ids.recordFilterTypeMarkdownId, settings.filterTypes.includes('markdown'));
    assignChecked(ids.recordFilterCustomCodeblockEnabledId, settings.customCodeblockEnabled === true);
    assignChecked(ids.recordFilterCustomRegexEnabledId, settings.customRegexEnabled === true);
    assignValue(ids.recordFilterCustomCodeblockTagsId, settings.customCodeblockTags.join(','));
    assignValue(ids.recordFilterJsonModeId, settings.jsonExtractMode);
    assignValue(ids.recordFilterJsonKeysId, settings.jsonExtractKeys.join(','));
    assignValue(ids.recordFilterPureCodePolicyId, settings.pureCodePolicy);
    assignValue(ids.recordFilterPlaceholderId, settings.placeholderText);
    assignValue(ids.recordFilterCustomRegexRulesId, settings.customRegexRules);
    assignValue(ids.recordFilterMaxTextLengthId, String(settings.maxTextLength));
    assignValue(ids.recordFilterMinEffectiveCharsId, String(settings.minEffectiveChars));
}

/**
 * 功能：从表单收集记录过滤配置。
 * @param ids 控件 ID 集合。
 * @returns 配置对象。
 */
function collectRecordFilterFormValues(ids: MemoryOSSettingsIds): RecordFilterUiSettings {
    const current = readRecordFilterSettings();
    const readChecked = (inputId: string): boolean => (document.getElementById(inputId) as HTMLInputElement | null)?.checked === true;
    const readValue = (inputId: string): string => String((document.getElementById(inputId) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value || '');
    const filterTypes: string[] = [];
    if (readChecked(ids.recordFilterTypeHtmlId)) filterTypes.push('html');
    if (readChecked(ids.recordFilterTypeXmlId)) filterTypes.push('xml');
    if (readChecked(ids.recordFilterTypeJsonId)) filterTypes.push('json');
    if (readChecked(ids.recordFilterTypeCodeblockId)) filterTypes.push('codeblock');
    if (readChecked(ids.recordFilterTypeMarkdownId)) filterTypes.push('markdown');
    return {
        ...current,
        enabled: readChecked(ids.recordFilterEnabledId),
        level: (readValue(ids.recordFilterLevelId) || current.level) as RecordFilterUiSettings['level'],
        filterTypes: filterTypes as RecordFilterUiSettings['filterTypes'],
        customCodeblockEnabled: readChecked(ids.recordFilterCustomCodeblockEnabledId),
        customCodeblockTags: readValue(ids.recordFilterCustomCodeblockTagsId).split(/[,\n]/).map((item: string): string => item.trim()).filter(Boolean),
        jsonExtractMode: (readValue(ids.recordFilterJsonModeId) || current.jsonExtractMode) as RecordFilterUiSettings['jsonExtractMode'],
        jsonExtractKeys: readValue(ids.recordFilterJsonKeysId).split(',').map((item: string): string => item.trim()).filter(Boolean),
        pureCodePolicy: (readValue(ids.recordFilterPureCodePolicyId) || current.pureCodePolicy) as RecordFilterUiSettings['pureCodePolicy'],
        placeholderText: readValue(ids.recordFilterPlaceholderId) || current.placeholderText,
        customRegexEnabled: readChecked(ids.recordFilterCustomRegexEnabledId),
        customRegexRules: readValue(ids.recordFilterCustomRegexRulesId),
        maxTextLength: Number(readValue(ids.recordFilterMaxTextLengthId) || current.maxTextLength),
        minEffectiveChars: Number(readValue(ids.recordFilterMinEffectiveCharsId) || current.minEffectiveChars),
    };
}

/**
 * 功能：应用自动压缩调度。
 * @param enabled 是否启用自动压缩。
 * @returns 无返回值。
 */
function applyAutoCompactionScheduler(enabled: boolean): void {
    if (autoCompactionTimer) {
        clearInterval(autoCompactionTimer);
        autoCompactionTimer = null;
    }
    if (!enabled) {
        return;
    }
    autoCompactionTimer = setInterval(async (): Promise<void> => {
        const memory = (window as unknown as Window & {
            STX?: {
                memory?: {
                    compaction?: {
                        needsCompaction?: () => Promise<{ needed?: boolean }>;
                        compact?: (options: { windowSize: number; archiveProcessed: boolean }) => Promise<unknown>;
                    };
                };
            };
        }).STX?.memory;
        if (!memory?.compaction?.needsCompaction || !memory?.compaction?.compact) {
            return;
        }
        try {
            const check = await memory.compaction.needsCompaction();
            if (check?.needed) {
                await memory.compaction.compact({ windowSize: 1000, archiveProcessed: true });
            }
        } catch (error) {
            logger.warn('自动压缩任务执行失败', error);
        }
    }, 60_000);
}

/**
 * 功能：执行记忆包导出。
 * @returns 无返回值。
 */
async function handleExportPackage(): Promise<void> {
    const memory = (window as Window & {
        STX?: {
            memory?: {
                getChatKey?: () => string;
                events?: { query?: (options: { limit: number }) => Promise<unknown[]> };
                facts?: { query?: (options: { limit: number }) => Promise<unknown[]> };
                summaries?: { query?: (options: { limit: number }) => Promise<unknown[]> };
            };
        };
    }).STX?.memory;
    if (!memory) {
        alert('Memory OS 尚未就绪。');
        return;
    }
    try {
        const chatKey = memory.getChatKey?.() ?? 'unknown';
        const { db } = await import('../../db/db');
        const [events, facts, state, summaries, templates, meta, binding] = await Promise.all([
            memory.events?.query?.({ limit: 5000 }) ?? Promise.resolve([]),
            memory.facts?.query?.({ limit: 5000 }) ?? Promise.resolve([]),
            db.world_state.where('[chatKey+path]').between([chatKey, ''], [chatKey, '\uffff']).toArray(),
            memory.summaries?.query?.({ limit: 1000 }) ?? Promise.resolve([]),
            db.templates.where('[chatKey+createdAt]').between([chatKey, 0], [chatKey, Infinity]).toArray(),
            db.meta.get(chatKey),
            db.template_bindings.get(chatKey),
        ]);
        const exportData = {
            exportedAt: new Date().toISOString(),
            schemaVersion: meta?.schemaVersion ?? 1,
            chatKey,
            events,
            facts,
            state,
            summaries,
            templates,
            meta,
            binding,
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `stx_memory_os_export_${chatKey}_${Date.now()}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success('记忆包已导出。');
    } catch (error) {
        alert(`导出失败：${String(error)}`);
    }
}

/**
 * 功能：执行记忆包导入。
 * @param onAfterImport 导入成功后的刷新回调。
 * @returns 无返回值。
 */
async function handleImportPackage(onAfterImport: () => Promise<void>): Promise<void> {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.click();

    /**
     * 功能：清理临时文件选择器。
     * @returns 无返回值。
     */
    function cleanup(): void {
        fileInput.value = '';
        fileInput.remove();
    }

    fileInput.addEventListener('change', async (): Promise<void> => {
        const memory = (window as Window & {
            STX?: {
                memory?: {
                    getChatKey?: () => string;
                };
            };
        }).STX?.memory;
        const file = fileInput.files?.[0];
        if (!memory || !file) {
            cleanup();
            return;
        }
        try {
            const text = await file.text();
            const payload = JSON.parse(text) as {
                chatKey?: string;
                schemaVersion?: number;
                events?: unknown[];
                facts?: unknown[];
                state?: unknown[];
                summaries?: unknown[];
                templates?: unknown[];
                meta?: Record<string, unknown> | null;
                binding?: Record<string, unknown> | null;
            };
            const currentChatKey = memory.getChatKey?.();
            if (!currentChatKey) {
                throw new Error('当前 chatKey 不可用。');
            }
            const importedChatKey = String(payload.chatKey || '');
            if (importedChatKey && importedChatKey !== currentChatKey) {
                const shouldContinue = confirm(`导入包属于 [${importedChatKey}]，当前聊天是 [${currentChatKey}]。\n确定继续并映射到当前聊天吗？`);
                if (!shouldContinue) {
                    cleanup();
                    return;
                }
            }
            const { db, clearMemoryChatData } = await import('../../db/db');
            const events = (Array.isArray(payload.events) ? payload.events : []) as DBEvent[];
            const facts = (Array.isArray(payload.facts) ? payload.facts : []) as DBFact[];
            const summaries = (Array.isArray(payload.summaries) ? payload.summaries : []) as DBSummary[];
            const state = (Array.isArray(payload.state) ? payload.state : []) as DBWorldState[];
            const templates = (Array.isArray(payload.templates) ? payload.templates : []) as DBTemplate[];
            const meta = (payload.meta && typeof payload.meta === 'object' ? payload.meta : null) as DBMeta | null;
            const binding = (payload.binding && typeof payload.binding === 'object' ? payload.binding : null) as DBTemplateBinding | null;
            const mode = confirm('导入模式：确定为 replace 全量替换，取消为 merge 合并导入。')
                ? 'replace'
                : 'merge';
            if (mode === 'replace') {
                await clearMemoryChatData(currentChatKey);
            }
            await db.transaction(
                'rw',
                [db.events, db.facts, db.world_state, db.summaries, db.templates, db.meta, db.template_bindings],
                async (): Promise<void> => {
                    if (events.length > 0) {
                        await db.events.bulkPut(events.map((event: DBEvent) => ({
                            ...event,
                            chatKey: currentChatKey,
                        })));
                    }
                    if (facts.length > 0) {
                        await db.facts.bulkPut(facts.map((fact: DBFact) => ({
                            ...fact,
                            chatKey: currentChatKey,
                        })));
                    }
                    if (summaries.length > 0) {
                        await db.summaries.bulkPut(summaries.map((summary: DBSummary) => ({
                            ...summary,
                            chatKey: currentChatKey,
                        })));
                    }
                    if (state.length > 0) {
                        await db.world_state.bulkPut(state.map((item: DBWorldState) => ({
                            ...item,
                            chatKey: currentChatKey,
                        })));
                    }
                    if (templates.length > 0) {
                        await db.templates.bulkPut(templates.map((item: DBTemplate) => ({
                            ...item,
                            chatKey: currentChatKey,
                        })));
                    }
                    await db.meta.put({
                        ...(meta || {}),
                        chatKey: currentChatKey,
                        schemaVersion: Number(meta?.schemaVersion ?? payload.schemaVersion ?? 1),
                    });
                    if (binding) {
                        await db.template_bindings.put({
                            ...binding,
                            bindingKey: currentChatKey,
                            chatKey: currentChatKey,
                        });
                    }
                },
            );
            toast.success(`导入完成（${mode}）。`);
            await onAfterImport();
        } catch (error) {
            alert(`导入失败：${String(error)}`);
        } finally {
            cleanup();
        }
    }, { once: true });
}

/**
 * 功能：绑定“数据维护”页签事件。
 * @param options 绑定参数。
 * @returns 返回搜索同步方法。
 */
export function bindDataMaintenanceTab(options: DataMaintenanceTabBindOptions): { syncSearchState: () => void } {
    const { ids, cardId } = options;
    const { refreshTemplatePanelState } = bindDataMaintenanceTemplateSection({
        ids,
        cardId,
        refreshSharedSelectOptions,
    });
    const { refreshAuditList } = bindDataMaintenanceAuditSection({ ids });
    const { refreshMutationHistoryList } = bindDataMaintenanceMutationHistorySection({ ids });
    bindDataMaintenanceWorldInfoSection({ ids });

    /**
     * 功能：刷新数据维护页中的异步区块。
     * @returns 无返回值。
     */
    async function refreshDataMaintenancePanels(): Promise<void> {
        await refreshTemplatePanelState();
        await refreshAuditList();
        await refreshMutationHistoryList();
    }

    /**
     * 功能：持久化记录过滤表单。
     * @returns 无返回值。
     */
    function persistRecordFilterForm(): void {
        const saved = saveRecordFilterSettings(collectRecordFilterFormValues(ids));
        applyRecordFilterFormValues(ids, saved);
    }

    bindToggle(ids.autoCompactionId, 'autoCompaction', (enabled: boolean): void => {
        applyAutoCompactionScheduler(enabled);
    });
    applyAutoCompactionScheduler(readSettingBoolean('autoCompaction'));
    applyRecordFilterFormValues(ids, readRecordFilterSettings());
    syncDbCompactionDividerVisibility(ids);

    [
        ids.recordFilterEnabledId,
        ids.recordFilterLevelId,
        ids.recordFilterTypeHtmlId,
        ids.recordFilterTypeXmlId,
        ids.recordFilterTypeJsonId,
        ids.recordFilterTypeCodeblockId,
        ids.recordFilterTypeMarkdownId,
        ids.recordFilterCustomCodeblockEnabledId,
        ids.recordFilterCustomCodeblockTagsId,
        ids.recordFilterJsonModeId,
        ids.recordFilterJsonKeysId,
        ids.recordFilterPureCodePolicyId,
        ids.recordFilterPlaceholderId,
        ids.recordFilterCustomRegexEnabledId,
        ids.recordFilterCustomRegexRulesId,
        ids.recordFilterMaxTextLengthId,
        ids.recordFilterMinEffectiveCharsId,
    ].forEach((inputId: string): void => {
        const element = document.getElementById(inputId);
        if (!element) {
            return;
        }
        element.addEventListener('change', persistRecordFilterForm);
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            element.addEventListener('blur', persistRecordFilterForm);
        }
    });

    document.getElementById(ids.recordFilterPreviewBtnId)?.addEventListener('click', (): void => {
        const inputEl = document.getElementById(ids.recordFilterPreviewInputId) as HTMLTextAreaElement | null;
        const outputEl = document.getElementById(ids.recordFilterPreviewOutputId) as HTMLElement | null;
        if (!inputEl || !outputEl) {
            return;
        }
        const result = filterRecordText(inputEl.value, collectRecordFilterFormValues(ids));
        outputEl.textContent = [
            `状态：${result.dropped ? '将丢弃' : '可入库'}`,
            `原因：${result.reasonCode}`,
            `规则：${result.appliedRules.join(', ') || '(无)'}`,
            '结果：',
            result.filteredText || '(空)',
        ].join('\n');
    });

    document.getElementById(ids.dbCompactBtnId)?.addEventListener('click', async (): Promise<void> => {
        const button = document.getElementById(ids.dbCompactBtnId) as HTMLButtonElement | null;
        const memory = (window as Window & {
            STX?: {
                memory?: {
                    compaction?: {
                        needsCompaction?: () => Promise<{ needed?: boolean; eventCount?: number }>;
                        compact?: (options: { windowSize: number; archiveProcessed: boolean }) => Promise<{ summariesCreated?: number; eventsArchived?: number }>;
                    };
                };
            };
        }).STX?.memory;
        if (!button || !memory?.compaction?.needsCompaction || !memory?.compaction?.compact) {
            alert('Memory OS 尚未就绪，请刷新后重试。');
            return;
        }
        button.disabled = true;
        button.textContent = '正在压缩...';
        try {
            const check = await memory.compaction.needsCompaction();
            if (!check.needed && check.eventCount !== undefined && check.eventCount < 100) {
                alert(`当前事件数量仅 ${check.eventCount} 条，无需压缩。`);
                return;
            }
            const result = await memory.compaction.compact({ windowSize: 1000, archiveProcessed: true });
            alert(`压缩完成。\n生成摘要：${result.summariesCreated ?? 0} 条\n归档事件：${result.eventsArchived ?? 0} 条`);
        } catch (error) {
            alert(`压缩失败：${String(error)}`);
        } finally {
            button.disabled = false;
            button.textContent = '立即压缩';
        }
    });

    document.getElementById(ids.dbExportBtnId)?.addEventListener('click', (): void => {
        void handleExportPackage();
    });

    document.getElementById(ids.dbImportBtnId)?.addEventListener('click', (): void => {
        void handleImportPackage(refreshDataMaintenancePanels);
    });

    document.getElementById(ids.dbClearBtnId)?.addEventListener('click', async (): Promise<void> => {
        const memory = (window as Window & { STX?: { memory?: { getChatKey?: () => string } } }).STX?.memory;
        if (!memory) {
            alert('Memory OS 尚未就绪。');
            return;
        }
        const chatKey = memory.getChatKey?.() ?? '(未知)';
        if (!confirm(`确定要清空 [${chatKey}] 的所有记忆数据吗？\n此操作不可撤销。`)) {
            return;
        }
        try {
            const { clearMemoryChatData } = await import('../../db/db');
            await clearMemoryChatData(chatKey);
            alert(`已清空 [${chatKey}] 的所有记忆数据。`);
            await refreshDataMaintenancePanels();
        } catch (error) {
            alert(`清空失败：${String(error)}`);
        }
    });

    document.getElementById(ids.recordEditorBtnId)?.addEventListener('click', (): void => {
        openRecordEditor();
    });

    document.getElementById(ids.testPingBtnId)?.addEventListener('click', async (): Promise<void> => {
        const button = document.getElementById(ids.testPingBtnId) as HTMLButtonElement | null;
        if (!button) {
            return;
        }
        button.textContent = '探测中...';
        try {
            const response = await request('plugin:request:ping', {}, 'stx_memory_os', { to: 'stx_llmhub' });
            toast.success('网络 Ping 已通，详情已打印到控制台。');
            logger.info('[Bus Inspector Ping]', response);
        } catch (error) {
            toast.error('网络探测失败，详情请看控制台。');
            logger.error('[Bus Inspector Error]', error);
        } finally {
            button.textContent = '发送 Ping 测试';
        }
    });

    document.getElementById(ids.testHelloBtnId)?.addEventListener('click', async (): Promise<void> => {
        const button = document.getElementById(ids.testHelloBtnId) as HTMLButtonElement | null;
        if (!button) {
            return;
        }
        button.textContent = '呼叫中...';
        try {
            const response = await request('plugin:request:hello', { testPayload: 'From MemoryOS Inspector' }, 'stx_memory_os', { to: 'stx_llmhub' });
            toast.success('双向握手完成（Hello OK）。详情见控制台。');
            logger.success('[Bus Inspector Hello Reply]', response);
        } catch (error) {
            toast.error('请求 LLMHub 失败或超时，详情见控制台。');
            logger.error('[Bus Inspector Error]', error);
        } finally {
            button.textContent = '向 LLMHub 打招呼';
        }
    });

    document.getElementById(ids.tabDbId)?.addEventListener('click', (): void => {
        void refreshDataMaintenancePanels();
        syncDbCompactionDividerVisibility(ids);
    });

    return {
        syncSearchState: (): void => {
            syncDbCompactionDividerVisibility(ids);
        },
    };
}
