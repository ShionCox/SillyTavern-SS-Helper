import type { MemorySDK } from '../../../SDK/stx';
import { logger } from '../index';
import type { ColdStartLorebookSelection } from '../types';
import { openWorldbookInitPanel } from '../ui/index';
const ACTIVE_COLD_START_PANEL_TASKS = new Map<string, Promise<void>>();
const ACTIVE_COLD_START_BOOTSTRAP_TASKS = new Map<string, Promise<void>>();
const EMPTY_COLD_START_LOREBOOK_SELECTION: ColdStartLorebookSelection = { books: [], entries: [] };

/**
 * 功能：为一次冷启动引导生成稳定的请求标识。
 * @param chatKey 当前聊天键。
 * @returns 本次冷启动任务的请求标识。
 */
function buildColdStartBootstrapRequestId(chatKey: string): string {
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    return `cold-start:${chatKey}:${Date.now()}:${randomSuffix}`;
}

/**
 * 功能：判断给定选择是否表示“跳过世界书初始化”。
 * @param selection 世界书选择结果。
 * @returns 是否为空选择。
 */
function isSkippedColdStartSelection(selection: ColdStartLorebookSelection): boolean {
    return selection.books.length <= 0 && selection.entries.length <= 0;
}

/**
 * 功能：启动或复用当前聊天的冷启动执行任务。
 * @param memory 当前聊天对应的 MemorySDK 实例。
 * @returns 异步执行结果。
 */
async function ensureColdStartBootstrapTask(memory: MemorySDK): Promise<void> {
    const chatKey = String(memory.getChatKey?.() ?? '').trim();
    if (!chatKey) {
        return;
    }
    const existingTask = ACTIVE_COLD_START_BOOTSTRAP_TASKS.get(chatKey);
    if (existingTask) {
        await existingTask;
        return;
    }
    const task = memory.chatState.bootstrapSemanticSeed()
        .catch(async (error: unknown): Promise<void> => {
            logger.error('[ColdStart][BootstrapTaskFailed]', { chatKey, error });
            throw error;
        })
        .finally((): void => {
            if (ACTIVE_COLD_START_BOOTSTRAP_TASKS.get(chatKey) === task) {
                ACTIVE_COLD_START_BOOTSTRAP_TASKS.delete(chatKey);
            }
        });
    ACTIVE_COLD_START_BOOTSTRAP_TASKS.set(chatKey, task);
    await task;
}

/**
 * 功能：打开或复用当前聊天的冷启动选择弹窗，并在确认后登记执行任务。
 * @param memory 当前聊天对应的 MemorySDK 实例。
 * @param reason 本次对账的触发原因。
 * @returns 异步执行结果。
 */
async function ensureColdStartSelectionPanel(memory: MemorySDK, reason: string): Promise<void> {
    const chatKey = String(memory.getChatKey?.() ?? '').trim();
    if (!chatKey) {
        return;
    }
    const existingTask = ACTIVE_COLD_START_PANEL_TASKS.get(chatKey);
    if (existingTask) {
        await existingTask;
        return;
    }
    const task = (async (): Promise<void> => {
        const [savedSelection, skipped] = await Promise.all([
            memory.chatState.getColdStartLorebookSelection(),
            memory.chatState.isColdStartLorebookSelectionSkipped(),
        ]);
        const initialSelection = skipped ? EMPTY_COLD_START_LOREBOOK_SELECTION : savedSelection;
        const selectedLorebooks = await openWorldbookInitPanel({ initialSelection });
        if (selectedLorebooks === null) {
            await memory.chatState.failColdStartBootstrap(`cold_start_selection_cancelled:${reason}`);
            return;
        }
        const requestId = buildColdStartBootstrapRequestId(chatKey);
        const skippedSelection = isSkippedColdStartSelection(selectedLorebooks);
        await memory.chatState.beginColdStartBootstrap(requestId, selectedLorebooks, skippedSelection);
        await ensureColdStartBootstrapTask(memory);
    })().finally((): void => {
        if (ACTIVE_COLD_START_PANEL_TASKS.get(chatKey) === task) {
            ACTIVE_COLD_START_PANEL_TASKS.delete(chatKey);
        }
    });
    ACTIVE_COLD_START_PANEL_TASKS.set(chatKey, task);
    await task;
}

/**
 * 功能：在聊天绑定完成后对账冷启动状态，并统一决定是否弹窗或继续执行。
 * @param memory 当前聊天对应的 MemorySDK 实例。
 * @param reason 本次对账的触发原因。
 * @returns 异步执行结果。
 */
export async function reconcileColdStartBootstrap(memory: MemorySDK, reason: string): Promise<void> {
    const chatKey = String(memory.getChatKey?.() ?? '').trim();
    if (!chatKey) {
        return;
    }
    const status = await memory.chatState.getColdStartBootstrapStatus();
    if (status.state === 'ready') {
        return;
    }
    if (status.state === 'bootstrapping') {
        await ensureColdStartBootstrapTask(memory);
        return;
    }
    await ensureColdStartSelectionPanel(memory, reason);
}
