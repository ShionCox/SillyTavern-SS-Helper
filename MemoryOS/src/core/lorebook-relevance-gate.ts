import type { EventEnvelope } from '../../../SDK/stx';
import { loadTavernWorldbookEntriesEvent } from '../../../SDK/tavern';
import type { LorebookGateDecision, LorebookGateMode, LogicalChatView } from '../types';

export interface LorebookEntryCandidate {
    book: string;
    entry: string;
    keywords: string[];
    content: string;
}

export interface LorebookGateInput {
    query: string;
    profileChatType?: 'solo' | 'group' | 'worldbook' | 'tool';
    visibleMessages?: LogicalChatView['visibleMessages'];
    recentEvents?: Array<EventEnvelope<unknown>>;
    worldStateText?: string;
    entries: LorebookEntryCandidate[];
}

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function readEventText(event: EventEnvelope<unknown>): string {
    const payload = event?.payload as Record<string, unknown> | string | null | undefined;
    if (typeof payload === 'string') {
        return normalizeText(payload);
    }
    if (payload && typeof payload === 'object') {
        const raw = payload.text ?? payload.content ?? payload.message ?? payload.summary;
        return normalizeText(raw);
    }
    return '';
}

function hashString(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

function lower(value: string): string {
    return normalizeText(value).toLowerCase();
}

function detectSettingQuery(query: string): boolean {
    return /设定|世界观|百科|资料|规则|地图|年表|势力|背景|地点|lore|world/.test(lower(query));
}

function detectToolQuery(query: string): boolean {
    return /怎么|如何|步骤|命令|配置|报错|修复|sdk|api|tsc|build/.test(lower(query));
}

function detectStoryProgress(query: string): boolean {
    return /继续|然后|下一步|推进|剧情|接着/.test(lower(query));
}

function buildContextText(input: LorebookGateInput): string {
    const fromView = (input.visibleMessages ?? [])
        .slice(Math.max(0, (input.visibleMessages ?? []).length - 10))
        .map((node) => `${node.role}:${normalizeText(node.text)}`)
        .join('\n');
    const fromEvents = Array.isArray(input.recentEvents)
        ? input.recentEvents.slice(0, 8).map((event) => readEventText(event)).filter(Boolean).join('\n')
        : '';
    return `${fromView}\n${fromEvents}`.trim();
}

function detectConflict(worldStateText: string, entries: LorebookEntryCandidate[]): boolean {
    const stateText = lower(worldStateText);
    if (!stateText) {
        return false;
    }
    return entries.some((entry) => {
        const content = lower(entry.content);
        if (!content) {
            return false;
        }
        const hasPositive = /是|属于|位于|可以|允许|always|must/.test(content);
        const hasNegative = /不是|不属于|禁止|不能|never|forbid/.test(content);
        if (!hasPositive && !hasNegative) {
            return false;
        }
        return hasPositive && /不是|禁止|不能|never|forbid/.test(stateText)
            || hasNegative && /是|属于|位于|可以|允许|always|must/.test(stateText);
    });
}

function scoreMode(score: number, conflictDetected: boolean): LorebookGateMode {
    let mode: LorebookGateMode = 'block';
    if (score >= 0.8) {
        mode = 'force_inject';
    } else if (score >= 0.55) {
        mode = 'soft_inject';
    } else if (score >= 0.35) {
        mode = 'summary_only';
    }
    if (!conflictDetected) {
        return mode;
    }
    if (mode === 'force_inject') {
        return 'soft_inject';
    }
    if (mode === 'soft_inject') {
        return 'summary_only';
    }
    return 'block';
}

export function evaluateLorebookRelevance(input: LorebookGateInput): LorebookGateDecision {
    const query = normalizeText(input.query);
    const contextText = lower(buildContextText(input));
    const queryLower = lower(query);
    const entries = Array.isArray(input.entries) ? input.entries : [];
    const matchedEntries = entries.filter((entry) => {
        const text = `${lower(entry.entry)} ${lower(entry.content)} ${entry.keywords.map((word) => lower(word)).join(' ')}`.trim();
        if (!text) {
            return false;
        }
        if (queryLower && text.includes(queryLower)) {
            return true;
        }
        const keywordHit = entry.keywords.some((keyword) => {
            const token = lower(keyword);
            return token.length >= 2 && (queryLower.includes(token) || contextText.includes(token));
        });
        if (keywordHit) {
            return true;
        }
        return lower(entry.entry).length >= 2 && contextText.includes(lower(entry.entry));
    });

    let score = 0;
    const reasonCodes: string[] = [];
    if (detectSettingQuery(query)) {
        score += 0.45;
        reasonCodes.push('setting_query');
    }
    if (detectStoryProgress(query)) {
        score += 0.15;
        reasonCodes.push('story_progress');
    }
    if (detectToolQuery(query)) {
        score -= 0.2;
        reasonCodes.push('tool_query');
    }
    if ((input.profileChatType ?? 'solo') === 'worldbook') {
        score += 0.2;
        reasonCodes.push('worldbook_profile');
    }
    if (matchedEntries.length > 0) {
        score += Math.min(0.35, 0.12 + matchedEntries.length * 0.04);
        reasonCodes.push('entry_matched');
    } else {
        score -= 0.25;
        reasonCodes.push('entry_not_matched');
    }
    if (entries.length <= 0) {
        score = 0;
        reasonCodes.push('no_active_lorebook');
    }

    const conflictDetected = detectConflict(input.worldStateText ?? '', matchedEntries);
    if (conflictDetected) {
        score -= 0.25;
        reasonCodes.push('world_conflict_detected');
    }
    const boundedScore = Math.max(0, Math.min(1, score));
    const mode = scoreMode(boundedScore, conflictDetected);
    if (mode === 'summary_only') {
        reasonCodes.push('summary_only_mode');
    }
    if (mode === 'block') {
        reasonCodes.push('lorebook_blocked');
    }

    return {
        mode,
        score: boundedScore,
        reasonCodes,
        matchedEntries: matchedEntries.map((entry) => `${entry.book}/${entry.entry}`).slice(0, 12),
        conflictDetected,
        shouldExtractWorldFacts: mode === 'force_inject' || mode === 'soft_inject',
        shouldWriteback: mode !== 'block' && !conflictDetected,
        generatedAt: Date.now(),
    };
}

export async function loadActiveWorldInfoEntriesFromHost(): Promise<LorebookEntryCandidate[]> {
    const entries = await loadTavernWorldbookEntriesEvent();
    return entries.map((entry): LorebookEntryCandidate => ({
        book: entry.book,
        entry: entry.entry,
        keywords: entry.keywords,
        content: entry.content,
    }));
}

export function buildLorebookSnippet(
    decision: LorebookGateDecision,
    entries: LorebookEntryCandidate[],
    maxChars: number,
): string {
    if (decision.mode === 'block' || entries.length === 0 || maxChars <= 0) {
        return '';
    }
    const matchedHashes = new Set(decision.matchedEntries.map((value: string): string => hashString(value)));
    const preferred = entries.filter((entry) => matchedHashes.has(hashString(`${entry.book}/${entry.entry}`)));
    const pool = (preferred.length > 0 ? preferred : entries).slice(0, decision.mode === 'force_inject' ? 6 : 4);
    const lines = pool.map((entry) => {
        if (decision.mode === 'summary_only') {
            const short = normalizeText(entry.content).slice(0, 72);
            return `- ${entry.entry}: ${short}`;
        }
        const limit = decision.mode === 'force_inject' ? 220 : 120;
        const body = normalizeText(entry.content).slice(0, limit);
        const keywordText = entry.keywords.length > 0 ? ` [${entry.keywords.slice(0, 6).join(', ')}]` : '';
        return `- ${entry.entry}${keywordText}: ${body}`;
    });
    let text = `【Lorebook(${decision.mode})】\n${lines.join('\n')}`;
    if (text.length > maxChars) {
        text = `${text.slice(0, maxChars)}\n...(已截断)`;
    }
    return text;
}
