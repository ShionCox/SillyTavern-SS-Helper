import { buildCompareKey, compareKeysNearMatch, supportsCompareKey } from './compare-key';

/**
 * 功能：定义账本更新决策动作。
 */
export type LedgerUpdateAction = 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'NOOP';

/**
 * 功能：定义统一账本更新决策。
 */
export interface LedgerUpdateDecision {
    compareKey: string;
    action: LedgerUpdateAction;
    reasonCodes: string[];
    previousVersionId?: string;
    sourceBatchId?: string;
}

/**
 * 功能：账本更新决策所需输入。
 */
export interface ResolveLedgerUpdateDecisionInput {
    entryType: string;
    title: string;
    fields?: Record<string, unknown>;
    existing?: {
        entryId?: string;
        title?: string;
        compareKey?: string;
        aliases?: string[];
    } | null;
    sourceBatchId?: string;
}

/**
 * 功能：根据当前对象和已知对象生成统一账本更新决策。
 * @param input 决策输入。
 * @returns 账本更新决策。
 */
export function resolveLedgerUpdateDecision(input: ResolveLedgerUpdateDecisionInput): LedgerUpdateDecision {
    const entryType = normalizeText(input.entryType);
    const compareKey = supportsCompareKey(entryType)
        ? buildCompareKey(entryType, input.title, input.fields)
        : `${entryType}:${normalizeText(input.title)}`;
    const existing = input.existing;

    if (!existing?.entryId) {
        return {
            compareKey,
            action: 'ADD',
            reasonCodes: ['new_record_add'],
            sourceBatchId: input.sourceBatchId,
        };
    }

    const existingCompareKey = normalizeText(existing.compareKey);
    if (existingCompareKey && compareKey && existingCompareKey === compareKey) {
        return {
            compareKey,
            action: 'UPDATE',
            reasonCodes: ['compare_key_match_update'],
            previousVersionId: existing.entryId,
            sourceBatchId: input.sourceBatchId,
        };
    }

    if (existingCompareKey && compareKey && compareKeysNearMatch(existingCompareKey, compareKey)) {
        return {
            compareKey,
            action: 'MERGE',
            reasonCodes: ['compare_key_near_match_merge'],
            previousVersionId: existing.entryId,
            sourceBatchId: input.sourceBatchId,
        };
    }

    if (isAliasOrTitleMatch(input.title, existing.title, existing.aliases)) {
        return {
            compareKey,
            action: 'MERGE',
            reasonCodes: ['title_alias_match_merge'],
            previousVersionId: existing.entryId,
            sourceBatchId: input.sourceBatchId,
        };
    }

    return {
        compareKey,
        action: 'UPDATE',
        reasonCodes: ['existing_record_update'],
        previousVersionId: existing.entryId,
        sourceBatchId: input.sourceBatchId,
    };
}

/**
 * 功能：判断标题是否与已有标题或别名命中。
 * @param title 当前标题。
 * @param existingTitle 已有标题。
 * @param aliases 已有别名列表。
 * @returns 是否命中。
 */
function isAliasOrTitleMatch(title: string, existingTitle?: string, aliases?: string[]): boolean {
    const normalizedTitle = normalizeComparableText(title);
    if (!normalizedTitle) {
        return false;
    }
    if (normalizedTitle === normalizeComparableText(existingTitle)) {
        return true;
    }
    return (aliases ?? []).some((item: string): boolean => normalizeComparableText(item) === normalizedTitle);
}

/**
 * 功能：规范化用于比较的文本。
 * @param value 原始文本。
 * @returns 归一化文本。
 */
function normalizeComparableText(value: string | undefined): string {
    return normalizeText(value).replace(/\s+/g, '').toLowerCase();
}

/**
 * 功能：规范化文本。
 * @param value 原始文本。
 * @returns 去空白后的文本。
 */
function normalizeText(value: string | undefined): string {
    return String(value ?? '').trim();
}
