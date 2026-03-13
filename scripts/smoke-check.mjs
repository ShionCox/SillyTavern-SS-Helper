import fs from 'node:fs';
import path from 'node:path';

/**
 * 功能：读取文本文件内容。
 * 参数：
 *   filePath：相对仓库根目录的文件路径。
 * 返回：
 *   string：文件内容。
 */
function readText(filePath) {
    const abs = path.resolve(process.cwd(), filePath);
    return fs.readFileSync(abs, 'utf8');
}

/**
 * 功能：执行单条断言并收集结果。
 * 参数：
 *   name：断言名称。
 *   predicate：断言函数。
 * 返回：
 *   { name: string, pass: boolean, error?: string }：断言结果。
 */
function runCheck(name, predicate) {
    try {
        const pass = Boolean(predicate());
        return { name, pass };
    } catch (error) {
        return { name, pass: false, error: String(error) };
    }
}

const sdkText = readText('SDK/stx.d.ts');
const uiIndexText = readText('LLMHub/src/ui/index.ts');
const hubIndexText = readText('LLMHub/src/index.ts');
const busText = readText('SDK/bus/bus.ts');
const sharedTooltipText = readText('_Components/sharedTooltip.ts');
const sharedTooltipCssText = readText('_Components/sharedTooltip.css');
const memoryUiText = readText('MemoryOS/src/ui/index.ts');
const rollUiText = readText('RollHelper/src/settings/uiCardEvent.ts');

const checks = [
    runCheck('MemorySDK 已扩展 extract 子域', () => /extract:\s*\{[\s\S]*kickOffExtraction/.test(sdkText)),
    runCheck('MemorySDK 已扩展 proposal 子域', () => /proposal:\s*\{[\s\S]*processProposal[\s\S]*requestWrite/.test(sdkText)),
    runCheck('MemorySDK 已扩展 template/vector/compaction/worldInfo 子域', () => /template:\s*\{[\s\S]*vector:\s*\{[\s\S]*compaction:\s*\{[\s\S]*worldInfo:\s*\{/.test(sdkText)),
    runCheck('UI 含路由增删处理', () => /setRoutePolicies/.test(uiIndexText) && /data-route-index/.test(uiIndexText)),
    runCheck('UI 含预算增删处理', () => /setBudgetConfig/.test(uiIndexText) && /removeBudgetConfig/.test(uiIndexText)),
    runCheck('LLMHub Runtime 含 setRoutePolicies/setBudgetConfig/removeBudgetConfig', () =>
        /setRoutePolicies/.test(hubIndexText) &&
        /setBudgetConfig/.test(hubIndexText) &&
        /removeBudgetConfig/.test(hubIndexText)),
    runCheck('EventBus 默认 pluginId 使用 memory_os', () => /pluginId:\s*'memory_os'/.test(busText)),
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

console.log('\n冒烟检查通过：全部断言通过。');
