import fs from 'node:fs';
import path from 'node:path';

/**
 * 功能：读取文本文件内容。
 * @param filePath 相对仓库根目录的文件路径。
 * @returns 文件文本内容。
 */
function readText(filePath) {
    const abs = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(abs, 'utf8');
}

/**
 * 功能：执行单条断言并返回结果。
 * @param name 断言名称。
 * @param predicate 断言函数。
 * @returns 断言执行结果。
 */
function runCheck(name, predicate) {
    try {
        return { name, pass: Boolean(predicate()) };
    } catch (error) {
        return { name, pass: false, error: String(error) };
    }
}

const sdkText = readText('SDK/stx.d.ts');
const memoryIndexText = readText('MemoryOS/src/index.ts');
const registryText = readText('MemoryOS/src/registry/registry.ts');
const llmIndexText = readText('LLMHub/src/index.ts');
const routerText = readText('LLMHub/src/router/router.ts');
const discoveryText = readText('LLMHub/src/discovery/consumer-discovery.ts');
const llmUiText = readText('LLMHub/src/ui/index.ts');
const llmHtmlText = readText('LLMHub/src/ui/settingsCardHtmlTemplate.ts');
const llmTypeText = readText('LLMHub/src/ui/settingsCardTemplateTypes.ts');
const injectionText = readText('MemoryOS/src/injection/injection-manager.ts');
const extractText = readText('MemoryOS/src/core/extract-manager.ts');
const auditText = readText('MemoryOS/src/core/audit-manager.ts');
const memoryUiText = readText('MemoryOS/src/ui/index.ts');
const memoryUiTypeText = readText('MemoryOS/src/ui/settingsCardTemplateTypes.ts');
const memoryUiHtmlText = readText('MemoryOS/src/ui/settingsCardHtmlTemplate.ts');
const memoryTooltipText = readText('MemoryOS/src/ui/settingsTooltipCatalog.ts');
const recordFilterText = readText('MemoryOS/src/core/record-filter.ts');
const hybridSearchText = readText('MemoryOS/src/vector/hybrid-search.ts');
const dbText = readText('MemoryOS/src/db/db.ts');
const rollIndexText = readText('RollHelper/index.ts');

const checks = [
    runCheck('STXRegistry 已扩展 register/list/get/onChanged', () =>
        /interface STXRegistry[\s\S]*register\([\s\S]*\)\s*:\s*\{[\s\S]*list\(\)\s*:\s*PluginManifest\[\][\s\S]*get\(pluginId:\s*string\)[\s\S]*onChanged\?/.test(sdkText)),
    runCheck('MemorySDK 注入入参已扩展 query/sectionBudgets/preferSummary', () =>
        /buildContext\(opts\?:\s*\{[\s\S]*query\?:\s*string[\s\S]*sectionBudgets\?:[\s\S]*preferSummary\?:\s*boolean/.test(sdkText)),
    runCheck('DBMeta 已增加 lastExtract 字段', () =>
        /lastExtractTs\?:\s*number[\s\S]*lastExtractEventCount\?:\s*number[\s\S]*lastExtractUserMsgCount\?:\s*number[\s\S]*lastExtractWindowHash\?:\s*string/.test(dbText)),
    runCheck('MemoryOS 已挂载 PluginRegistry 并自注册', () =>
        /new PluginRegistry\(\)/.test(memoryIndexText) &&
        /registerSelfManifest/.test(memoryIndexText) &&
        /MEMORY_OS_MANIFEST/.test(memoryIndexText)),
    runCheck('PluginRegistry 提供 list/get/onChanged', () =>
        /class PluginRegistry[\s\S]*list\(\):\s*PluginManifest\[\][\s\S]*get\(pluginId:\s*string\)[\s\S]*onChanged\(/.test(registryText)),
    runCheck('LLMHub 启动时注册自身 manifest', () =>
        /LLMHUB_MANIFEST/.test(llmIndexText) && /registry\?\.register\?\.\(LLMHUB_MANIFEST\)/.test(llmIndexText)),
    runCheck('RollHelper 启动时注册自身 manifest', () =>
        /ROLLHELPER_MANIFEST/.test(rollIndexText) && /registerRollHelperManifest/.test(rollIndexText)),
    runCheck('TaskRouter 支持 consumer+* 与优先级层', () =>
        /findMatchedPolicy/.test(routerText) &&
        /findPolicy\(\[consumer\], '\*'\)/.test(routerText) &&
        /policy\.consumer === '\*'/.test(routerText)),
    runCheck('discoverConsumers 模块已实现 registry/settings/ping 合并', () =>
        /export async function discoverConsumers/.test(discoveryText) &&
        /readRegistryConsumers/.test(discoveryText) &&
        /readSettingsConsumers/.test(discoveryText) &&
        /pingConsumer/.test(discoveryText)),
    runCheck('LLMHub 设置页已接入插件映射 Tab', () =>
        /tabConsumerMapId/.test(llmTypeText) &&
        /panelConsumerMapId/.test(llmTypeText) &&
        /tabConsumerMapId/.test(llmHtmlText) &&
        /data-consumer-map-list/.test(llmHtmlText) &&
        /renderConsumerMappings/.test(llmUiText)),
    runCheck('注入管理器已实现预算与相关性策略', () =>
        /resolveSectionBudgets/.test(injectionText) &&
        /buildFactsSection/.test(injectionText) &&
        /buildSummarySection/.test(injectionText) &&
        /estimateTokens/.test(injectionText)),
    runCheck('抽取管理器已实现阈值与去重并传 budget', () =>
        /minUserMessageDelta/.test(extractText) &&
        /minEventDelta/.test(extractText) &&
        /markLastExtract/.test(extractText) &&
        /budget:\s*\{/.test(extractText)),
    runCheck('审计快照已覆盖全量核心 store', () =>
        /events[\s\S]*facts[\s\S]*states[\s\S]*summaries[\s\S]*templates[\s\S]*meta[\s\S]*binding/.test(auditText) &&
        /template_bindings/.test(auditText)),
    runCheck('MemoryOS UI 导出导入已包含 state/templates/meta/binding 与 merge/replace', () =>
        /state/.test(memoryUiText) &&
        /templates/.test(memoryUiText) &&
        /mode\s*=\s*confirm/.test(memoryUiText) &&
        /template_bindings/.test(memoryUiText)),
    runCheck('记录过滤模块已提供核心类型与入口函数', () =>
        /export type RecordFilterSettings/.test(recordFilterText) &&
        /export const DEFAULT_RECORD_FILTER_SETTINGS/.test(recordFilterText) &&
        /export function normalizeRecordFilterSettings/.test(recordFilterText) &&
        /export function filterRecordText/.test(recordFilterText)),
    runCheck('消息采集前已接入过滤并写入 sourceMessageId', () =>
        /import\s+\{\s*filterRecordText\s*\}\s+from\s+'\.\/core\/record-filter'/.test(memoryIndexText) &&
        /appendFilteredMessageEvent/.test(memoryIndexText) &&
        /filterRecordText\(msgText,\s*readRecordFilterSettings\(\)\)/.test(memoryIndexText) &&
        /sourceMessageId/.test(memoryIndexText) &&
        /\{\s*text:\s*result\.filteredText\s*\}/.test(memoryIndexText)),
    runCheck('MemoryOS 设置类型已包含记录过滤控件 ID', () =>
        /recordFilterEnabledId/.test(memoryUiTypeText) &&
        /recordFilterTypeJsonId/.test(memoryUiTypeText) &&
        /recordFilterCustomRegexRulesId/.test(memoryUiTypeText) &&
        /recordFilterPreviewOutputId/.test(memoryUiTypeText)),
    runCheck('MemoryOS 设置页已渲染记录过滤表单与预览区', () =>
        /id="\$\{ids\.recordFilterEnabledId\}"/.test(memoryUiHtmlText) &&
        /id="\$\{ids\.recordFilterTypeHtmlId\}"/.test(memoryUiHtmlText) &&
        /id="\$\{ids\.recordFilterTypeXmlId\}"/.test(memoryUiHtmlText) &&
        /id="\$\{ids\.recordFilterTypeJsonId\}"/.test(memoryUiHtmlText) &&
        /id="\$\{ids\.recordFilterTypeCodeblockId\}"/.test(memoryUiHtmlText) &&
        /id="\$\{ids\.recordFilterTypeMarkdownId\}"/.test(memoryUiHtmlText) &&
        /id="\$\{ids\.recordFilterPreviewBtnId\}"/.test(memoryUiHtmlText) &&
        /id="\$\{ids\.recordFilterPreviewOutputId\}"/.test(memoryUiHtmlText)),
    runCheck('MemoryOS 设置逻辑已绑定过滤项保存与预览', () =>
        /normalizeRecordFilterSettings/.test(memoryUiText) &&
        /saveRecordFilterSettings/.test(memoryUiText) &&
        /collectRecordFilterFormValues/.test(memoryUiText) &&
        /persistRecordFilterForm/.test(memoryUiText) &&
        /recordFilterPreviewBtn\.addEventListener\('click'/.test(memoryUiText) &&
        /filterRecordText\(recordFilterPreviewInputEl\.value,\s*currentSettings\)/.test(memoryUiText)),
    runCheck('下游消费已优先读取清洗文本字段', () =>
        /getEventPayloadText/.test(extractText) &&
        /readEventPayloadText/.test(injectionText) &&
        /readEventPayloadText/.test(hybridSearchText)),
    runCheck('记录过滤新增项已补充中文 tooltip 目录', () =>
        /recordFilterEnabledId/.test(memoryTooltipText) &&
        /recordFilterJsonModeId/.test(memoryTooltipText) &&
        /recordFilterPreviewBtnId/.test(memoryTooltipText)),
];

let failed = 0;
for (const result of checks) {
    if (result.pass) {
        console.log(`[PASS] ${result.name}`);
    } else {
        failed += 1;
        console.error(`[FAIL] ${result.name}${result.error ? `: ${result.error}` : ''}`);
    }
}

if (failed > 0) {
    console.error(`\n冒烟检查失败：${failed} 项未通过。`);
    process.exit(1);
}

console.log('\n冒烟检查通过：全部断言通过。');
