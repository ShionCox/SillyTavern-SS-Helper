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
const registryText = readText('SDK/bus/registry.ts');
const uiIndexText = readText('LLMHub/src/ui/index.ts');
const hubIndexText = readText('LLMHub/src/index.ts');
const busText = readText('SDK/bus/bus.ts');
const sdkToolbarText = readText('SDK/toolbar.ts');
const sharedTooltipText = readText('_Components/sharedTooltip.ts');
const sharedTooltipCssText = readText('_Components/sharedTooltip.css');
const memoryIndexText = readText('MemoryOS/src/index.ts');
const memoryRuntimeEntryText = readText('MemoryOS/src/runtime-entry.ts');
const memoryRuntimeAppText = readText('MemoryOS/src/runtime/runtime-app.ts');
const memoryUiText = readText('MemoryOS/src/ui/index.ts');
const memoryToolbarText = readText('MemoryOS/src/runtime/chatToolbar.ts');
const memoryStrategyText = readText('MemoryOS/src/ui/chatStrategyPanel.ts');
const memoryEditorText = readText('MemoryOS/src/sdk/editor-facade.ts');
const memoryMainlineTestText = readText('MemoryOS/test/mainline-trace.spec.ts');
const rollHooksText = readText('RollHelper/src/events/hooksEvent.ts');
const rollUiText = readText('RollHelper/src/settings/uiCardEvent.ts');

const checks = [
    runCheck('MemorySDK 已收口 postGeneration 子域', () => /postGeneration:\s*\{[\s\S]*scheduleRoundProcessing/.test(sdkText)),
    runCheck('MemorySDK 已收口 mutation 子域', () => /mutation:\s*\{[\s\S]*applyMutationDocument[\s\S]*applyMutationRequest/.test(sdkText)),
    runCheck('MemoryOS index ???????????runtime-entry ???', () =>
        /startMemoryOSRuntime/.test(memoryIndexText) &&
        /startMemoryOSRuntime\(\)/.test(memoryIndexText) &&
        !/class\s+MemoryOS/.test(memoryIndexText) &&
        !/new Logger/.test(memoryIndexText) &&
        !/new Toast/.test(memoryIndexText)),
    runCheck('MemoryOS runtime-entry ???????????????', () =>
        /new MemoryOS\(\)/.test(memoryRuntimeEntryText) &&
        /renderSettingsUi/.test(memoryRuntimeEntryText) &&
        /from '\.\/runtime\/runtime-app'/.test(memoryRuntimeEntryText) &&
        /from '\.\/runtime\/runtime-services'/.test(memoryRuntimeEntryText) &&
        !/from '\.\/index'/.test(memoryRuntimeEntryText)),
    runCheck('MemoryOS runtime-app ??????????????', () =>
        /class MemoryOS/.test(memoryRuntimeAppText) &&
        /bindHostEvents/.test(memoryRuntimeAppText) &&
        /new Logger/.test(memoryRuntimeAppText) === false &&
        /new Toast/.test(memoryRuntimeAppText) === false),
    runCheck('MemorySDK 已扩展 template/vector/compaction/worldInfo 子域', () => /template:\s*\{[\s\S]*vector:\s*\{[\s\S]*compaction:\s*\{[\s\S]*worldInfo:\s*\{/.test(sdkText)),
    runCheck('UI 含路由管理处理', () => /applyGlobalAssignments/.test(uiIndexText) && /applyPluginAssignments/.test(uiIndexText) && /applyTaskAssignments/.test(uiIndexText)),
    runCheck('UI 含预算增删处理', () => /setBudgetConfig/.test(uiIndexText) && /removeBudgetConfig/.test(uiIndexText)),
    runCheck('LLMHub Runtime 含 setBudgetConfig/removeBudgetConfig', () =>
        /setBudgetConfig/.test(hubIndexText) &&
        /removeBudgetConfig/.test(hubIndexText)),
    runCheck('LLMHub Runtime 无旧版 defaultProvider 字段', () =>
        !/private defaultProvider/.test(hubIndexText)),
    runCheck('LLMHub Runtime 无旧版 setRoutePolicies', () =>
        !/setRoutePolicies/.test(hubIndexText)),
    runCheck('EventBus 默认 pluginId 使用 stx_memory_os', () => /pluginId:\s*'stx_memory_os'/.test(busText)),
    runCheck('SDK 已导出共享聊天区 toolbar 能力', () =>
        /export function ensureSdkFloatingToolbar/.test(sdkToolbarText) &&
        /export function removeSdkFloatingToolbarGroup/.test(sdkToolbarText) &&
        /export const SDK_FLOATING_TOOLBAR_ID\s*=\s*"SSHELPERTOOL"/.test(sdkToolbarText)),
    runCheck('RollHelper 聊天区工具栏已改用 SDK', () =>
        /ensureSdkFloatingToolbar/.test(rollHooksText) &&
        /SDK_FLOATING_TOOLBAR_ID/.test(rollHooksText) &&
        !/function buildSSToolbarTemplateEvent/.test(rollHooksText)),
    runCheck('MemoryOS 聊天区工具栏已接入 SDK', () =>
        /ensureSdkFloatingToolbar/.test(memoryToolbarText) &&
        /openChatStrategyEditor/.test(memoryToolbarText) &&
        /openRecordEditor/.test(memoryToolbarText)),
    runCheck('_Components 共享 tooltip 导出 ensureSharedTooltip', () =>
        /export function ensureSharedTooltip/.test(sharedTooltipText)),
    runCheck('MemoryOS UI 使用 _Components/sharedTooltip', () =>
        /_Components\/sharedTooltip/.test(memoryUiText) &&
        /ensureSharedTooltip/.test(memoryUiText)),
    runCheck('LLMHub UI 使用 _Components/sharedTooltip', () =>
        /_Components\/sharedTooltip/.test(uiIndexText) &&
        /ensureSharedTooltip/.test(uiIndexText)),
    runCheck('RollHelper 设置 UI 使用 _Components/sharedTooltip', () =>
        /_Components\/sharedTooltip/.test(rollUiText) &&
        /ensureSharedTooltip/.test(rollUiText)),
    runCheck('tooltip 不含 __stxSharedTooltipStateV1', () =>
        !/__stxSharedTooltipStateV1/.test(sharedTooltipText)),
    runCheck('tooltip 不含 __stxSharedTooltipStateV2', () =>
        !/__stxSharedTooltipStateV2/.test(sharedTooltipText)),
    runCheck('tooltip 不含 st-roll-shared-tooltip', () =>
        !/st-roll-shared-tooltip/.test(sharedTooltipText)),
    runCheck('tooltip 不含 is-roll-card-target', () =>
        !/is-roll-card-target/.test(sharedTooltipText) &&
        !/is-roll-card-target/.test(sharedTooltipCssText)),
    runCheck('tooltip 不含 is-shared-checkbox-target', () =>
        !/is-shared-checkbox-target/.test(sharedTooltipText) &&
        !/is-shared-checkbox-target/.test(sharedTooltipCssText)),
    runCheck('tooltip 不含 .stx-global-tooltip-body', () =>
        !/stx-global-tooltip-body/.test(sharedTooltipText) &&
        !/stx-global-tooltip-body/.test(sharedTooltipCssText)),
    runCheck('tooltip 不含 data-stx-tooltip-runtime（旧属性名）', () =>
        !/data-stx-tooltip-runtime[^-]/.test(sharedTooltipText)),
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

function countMatches(text, pattern) {
    const matches = String(text).match(pattern);
    return matches ? matches.length : 0;
}

function formatAuditValue(value) {
    return value ? 'yes' : 'no';
}

const runtimeAudits = [
    {
        module: 'MemoryOS 主链 trace / prompt injection',
        exported: /runMemoryPromptInjection/.test(sdkText) && /MemoryMainlineTraceSnapshot/.test(sdkText),
        referenced: countMatches(memoryIndexText, /runMemoryPromptInjection/g) > 0 && countMatches(memoryStrategyText, /mainlineTraceSnapshot/g) > 0,
        exercised: /CHAT_COMPLETION_PROMPT_READY/.test(memoryIndexText) && /runMemoryPromptInjection\(/.test(memoryIndexText),
        coveredByTest: fs.existsSync(path.resolve(process.cwd(), 'MemoryOS/test/mainline-trace.spec.ts')),
        recommendation: '保留',
    },
    {
        module: 'MemoryOS AI Health 证据卡',
        exported: /mainlineTraceSnapshot/.test(sdkText) && /mainlineTraceSnapshot/.test(memoryEditorText),
        referenced: /qualityTraceEvidenceId/.test(memoryStrategyText) && /buildMainlineTraceEvidenceMarkup/.test(memoryStrategyText),
        exercised: /updateQualityPanel/.test(memoryStrategyText) && /traceEvidenceElement\.innerHTML = buildMainlineTraceEvidenceMarkup/.test(memoryStrategyText),
        coveredByTest: fs.existsSync(path.resolve(process.cwd(), 'MemoryOS/test/mainline-trace-view.spec.ts')),
        recommendation: '保留',
    },
    {
        module: 'plugin:request:memory_append_outcome',
        exported: /plugin:request:memory_append_outcome/.test(registryText),
        referenced: false,
        exercised: false,
        coveredByTest: fs.existsSync(path.resolve(process.cwd(), 'MemoryOS/test/mainline-trace.spec.ts')),
        recommendation: '下线',
    },
];

console.log('\n[Runtime Audit]');
for (const audit of runtimeAudits) {
    console.log(`- ${audit.module}`);
    console.log(`  exported: ${formatAuditValue(audit.exported)}`);
    console.log(`  referenced: ${formatAuditValue(audit.referenced)}`);
    console.log(`  exercised in runtime: ${formatAuditValue(audit.exercised)}`);
    console.log(`  covered by test: ${formatAuditValue(audit.coveredByTest)}`);
    console.log(`  recommendation: ${audit.recommendation}`);
}

console.log('\n冒烟检查通过：全部断言通过。');
