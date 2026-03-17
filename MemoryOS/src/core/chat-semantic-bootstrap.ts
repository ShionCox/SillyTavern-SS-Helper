import {
    getCurrentTavernCharacterSnapshotEvent,
    getSillyTavernContextEvent,
    listTavernActiveWorldbooksEvent,
    loadTavernWorldbookEntriesEvent,
    resolveCurrentGroupEvent,
    resolveTavernRoleIdentityEvent,
} from '../../../SDK/tavern';
import { enhanceSemanticSeedWithAiWithOptions } from './chat-semantic-ai-summary';
import type { TaskPresentationOverride } from '../llm/memoryLlmBridge';
import type {
    ColdStartLorebookSelection,
    ChatSemanticSeed,
    IdentitySeed,
    SeedSourceTrace,
    StyleSeed,
    StyleSeedMode,
    WorldSeed,
} from '../types';

interface SemanticBootstrapResult {
    seed: ChatSemanticSeed | null;
    fingerprint: string;
    bindingFingerprint: string;
}

interface LoadedLorebookEntry {
    book: string;
    entryId: string;
    entry: string;
    keywords: string[];
    content: string;
}

function normalizeLorebookNames(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(
        value
            .map((item: unknown): string => normalizeText(item))
            .filter(Boolean),
    )).slice(0, 24);
}

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeLorebookContent(value: unknown): string {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function truncateText(value: string, limit: number): string {
    const normalized = normalizeText(value);
    if (normalized.length <= limit) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function buildLorebookEntryKey(book: string, entryId: string): string {
    return `${normalizeText(book)}::${normalizeText(entryId)}`;
}

function normalizeColdStartLorebookSelection(
    value: ColdStartLorebookSelection | string[] | undefined,
    fallbackBooks: string[],
): ColdStartLorebookSelection {
    if (Array.isArray(value)) {
        return {
            books: normalizeLorebookNames(value.length > 0 ? value : fallbackBooks),
            entries: [],
        };
    }
    return {
        books: normalizeLorebookNames(value?.books ?? fallbackBooks),
        entries: Array.isArray(value?.entries)
            ? Array.from(new Map(
                value.entries
                    .map((item) => ({
                        book: normalizeText(item?.book),
                        entryId: normalizeText(item?.entryId),
                        entry: normalizeText(item?.entry) || '未命名条目',
                        keywords: Array.from(new Set((item?.keywords ?? []).map((keyword) => normalizeText(keyword)).filter(Boolean))).slice(0, 12),
                    }))
                    .filter((item) => item.book && item.entryId)
                    .map((item) => [buildLorebookEntryKey(item.book, item.entryId), item] as const),
            ).values()).slice(0, 256)
            : [],
    };
}

function hashString(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

function buildSemanticSeedFingerprint(chatKey: string, seed: ChatSemanticSeed): string {
    const fingerprintBase = JSON.stringify({
        chatKey,
        characterCore: seed.characterCore,
        systemPrompt: seed.systemPrompt,
        firstMessage: seed.firstMessage,
        authorNote: seed.authorNote,
        jailbreak: seed.jailbreak,
        instruct: seed.instruct,
        activeLorebooks: seed.activeLorebooks,
        lorebookSeed: seed.lorebookSeed,
        groupMembers: seed.groupMembers,
        characterAnchors: seed.characterAnchors,
        presetStyle: seed.presetStyle,
        identitySeed: seed.identitySeed,
        worldSeed: seed.worldSeed,
        styleSeed: seed.styleSeed,
        aiSummary: seed.aiSummary,
    });
    return hashString(fingerprintBase);
}

async function resolveSelectedLorebookEntries(selection: ColdStartLorebookSelection): Promise<{
    activeLorebooks: string[];
    entries: LoadedLorebookEntry[];
}> {
    const requestedBooks = normalizeLorebookNames(selection.books);
    const requestedEntryMap = new Map<string, { book: string; entryId: string }>();
    for (const item of selection.entries) {
        const book = normalizeText(item.book);
        const entryId = normalizeText(item.entryId);
        if (!book || !entryId || requestedBooks.includes(book)) {
            continue;
        }
        requestedEntryMap.set(buildLorebookEntryKey(book, entryId), { book, entryId });
    }

    const activeLorebooks = normalizeLorebookNames([
        ...requestedBooks,
        ...selection.entries.map((item) => item.book),
    ]);
    const booksToLoad = normalizeLorebookNames([
        ...requestedBooks,
        ...Array.from(requestedEntryMap.values()).map((item) => item.book),
    ]);
    if (booksToLoad.length === 0) {
        return { activeLorebooks, entries: [] };
    }

    const loadedEntries = await loadTavernWorldbookEntriesEvent(booksToLoad);
    const resolvedEntries = new Map<string, LoadedLorebookEntry>();
    for (const item of loadedEntries) {
        const key = buildLorebookEntryKey(item.book, item.entryId);
        const includeWholeBook = requestedBooks.includes(item.book);
        const includeSingleEntry = requestedEntryMap.has(key);
        if (!includeWholeBook && !includeSingleEntry) {
            continue;
        }
        resolvedEntries.set(key, {
            book: normalizeText(item.book),
            entryId: normalizeText(item.entryId),
            entry: normalizeText(item.entry) || '未命名条目',
            keywords: Array.from(new Set(item.keywords.map((keyword: string): string => normalizeText(keyword)).filter(Boolean))).slice(0, 12),
            content: normalizeLorebookContent(item.content),
        });
    }

    return {
        activeLorebooks,
        entries: Array.from(resolvedEntries.values()),
    };
}

function splitSeedValues(...values: string[]): string[] {
    return Array.from(new Set(
        values
            .flatMap((value) => normalizeText(value).split(/[。！？!?\n；;，,、]/g))
            .map((item) => item.trim())
            .filter((item) => item.length >= 2),
    )).slice(0, 16);
}

function inferStyleMode(systemPrompt: string, instruct: string, jailbreak: string): StyleSeedMode {
    const base = `${systemPrompt}\n${instruct}\n${jailbreak}`.toLowerCase();
    if (/工具|步骤|命令|配置|api|sdk|how to|instruction/.test(base)) {
        return 'tool';
    }
    if (/设定|世界观|百科|资料|规则|lore|world/.test(base)) {
        return 'setting_qa';
    }
    if (/扮演|rp|角色|人设|口癖|对话/.test(base)) {
        return 'rp';
    }
    if (/叙事|剧情|小说|描写|旁白/.test(base)) {
        return 'narrative';
    }
    return 'balanced';
}

function buildSourceTrace(field: string, source: string, confidence: number): SeedSourceTrace {
    return {
        field,
        source,
        confidence: Math.max(0, Math.min(1, confidence)),
    };
}

function extractGroupMembers(contextRecord: Record<string, unknown>, groupRecord: Record<string, unknown> | null): string[] {
    const candidates: unknown[] = [
        contextRecord.groupMembers,
        contextRecord.group_members,
        groupRecord?.members,
        groupRecord?.memberNames,
    ];
    for (const candidate of candidates) {
        if (!Array.isArray(candidate)) {
            continue;
        }
        const members = candidate
            .map((item: unknown): string => {
                if (typeof item === 'string') {
                    return normalizeText(item);
                }
                if (item && typeof item === 'object') {
                    const source = item as Record<string, unknown>;
                    return normalizeText(source.name ?? source.displayName ?? source.id);
                }
                return '';
            })
            .filter(Boolean);
        if (members.length > 0) {
            return Array.from(new Set(members)).slice(0, 24);
        }
    }
    return [];
}

function buildIdentitySeed(
    roleKey: string,
    displayName: string,
    aliases: string[],
    identityText: string,
    source: string,
): IdentitySeed {
    return {
        roleKey,
        displayName,
        aliases,
        identity: splitSeedValues(identityText),
        catchphrases: splitSeedValues(identityText).filter((item: string): boolean => /["“”'『』「」]/.test(item)).slice(0, 8),
        relationshipAnchors: splitSeedValues(identityText).filter((item: string): boolean => /关系|同伴|敌人|盟友|队友|恋人|导师/.test(item)).slice(0, 8),
        sourceTrace: [
            buildSourceTrace('identity', source, 0.8),
            buildSourceTrace('aliases', source, 0.6),
        ],
    };
}

function buildWorldSeed(worldText: string, source: string): WorldSeed {
    const all = splitSeedValues(worldText);
    return {
        locations: all.filter((item: string): boolean => /城|镇|村|国|大陆|区域|地点|学院|基地|空间站/.test(item)).slice(0, 12),
        rules: all.filter((item: string): boolean => /规则|法则|必须|不能|禁止|限制|流程|约定/.test(item)).slice(0, 16),
        hardConstraints: all.filter((item: string): boolean => /不得|禁止|绝不|必须|唯一|固定/.test(item)).slice(0, 12),
        entities: all.filter((item: string): boolean => /组织|势力|阵营|宗派|家族|公会/.test(item)).slice(0, 12),
        sourceTrace: [buildSourceTrace('world', source, 0.75)],
    };
}

function buildStyleSeed(systemPrompt: string, instruct: string, jailbreak: string): StyleSeed {
    const mode = inferStyleMode(systemPrompt, instruct, jailbreak);
    const cues = splitSeedValues(systemPrompt, instruct, jailbreak).slice(0, 10);
    return {
        mode,
        cues,
        sourceTrace: [
            buildSourceTrace('system_prompt', 'context.system_prompt', 0.85),
            buildSourceTrace('instruct', 'context.instruct', 0.65),
            buildSourceTrace('jailbreak', 'context.jailbreak', 0.55),
        ],
    };
}

function buildLorebookSeed(
    activeLorebooks: string[],
    selectedEntries: LoadedLorebookEntry[],
    worldText: string,
): Array<{ book: string; hash: string; snippets: string[] }> {
    const fallbackSnippets = splitSeedValues(worldText).slice(0, 8);
    const totalSelectedEntryCount = selectedEntries.length;
    const perEntryCharLimit = totalSelectedEntryCount <= 3
        ? 1200
        : totalSelectedEntryCount <= 6
            ? 600
            : 220;
    const maxSnippetsPerBook = totalSelectedEntryCount <= 6 ? 12 : 6;
    const entryGroups = new Map<string, LoadedLorebookEntry[]>();
    for (const entry of selectedEntries) {
        const current = entryGroups.get(entry.book) ?? [];
        current.push(entry);
        entryGroups.set(entry.book, current);
    }
    return activeLorebooks
        .map((book: string): string => normalizeText(book))
        .filter(Boolean)
        .slice(0, 12)
        .map((book: string) => ({
            book,
            hash: hashString(book.toLowerCase()),
            snippets: (() => {
                const selectedSnippets = Array.from(new Set(
                    (entryGroups.get(book) ?? [])
                        .slice(0, maxSnippetsPerBook)
                        .map((entry: LoadedLorebookEntry): string => {
                            const rawContent = normalizeLorebookContent(entry.content);
                            if (!rawContent) {
                                return '';
                            }
                            if (totalSelectedEntryCount <= 3) {
                                return `${entry.entry}：${rawContent}`;
                            }
                            return `${entry.entry}：${truncateText(rawContent, perEntryCharLimit)}`;
                        })
                        .filter(Boolean),
                ));
                if (selectedSnippets.length > 0) {
                    return selectedSnippets;
                }
                return fallbackSnippets.slice(0, 4);
            })(),
        }));
}

function buildSelectedLorebookContextText(entries: LoadedLorebookEntry[]): string {
    return entries
        .slice(0, 24)
        .map((entry: LoadedLorebookEntry): string => `${entry.book} / ${entry.entry}：${truncateText(entry.content, 220)}`)
        .join('\n');
}

function buildCharacterAnchors(input: {
    roleKey: string;
    displayName: string;
    cardName: string;
    identitySeed: IdentitySeed;
    firstMessage: string;
}): Array<{ anchorId: string; label: string; value: string; confidence: number }> {
    const anchors: Array<{ anchorId: string; label: string; value: string; confidence: number }> = [];
    const pushAnchor = (label: string, value: string, confidence: number): void => {
        const normalized = normalizeText(value);
        if (!normalized) {
            return;
        }
        anchors.push({
            anchorId: `${label}:${hashString(`${label}|${normalized}`)}`,
            label,
            value: normalized,
            confidence: Math.max(0, Math.min(1, confidence)),
        });
    };
    pushAnchor('role_key', input.roleKey, 0.95);
    pushAnchor('display_name', input.displayName, 0.95);
    pushAnchor('card_name', input.cardName, 0.85);
    pushAnchor('identity', input.identitySeed.identity[0] ?? '', 0.75);
    pushAnchor('first_message', input.firstMessage, 0.65);
    return anchors.slice(0, 12);
}

export async function collectChatSemanticSeed(
    chatKey: string,
    activeLorebooksOverride?: ColdStartLorebookSelection | string[],
): Promise<SemanticBootstrapResult> {
    const context = getSillyTavernContextEvent();
    if (!context) {
        return {
            seed: null,
            fingerprint: '',
            bindingFingerprint: '',
        };
    }

    const contextRecord = context as unknown as Record<string, unknown>;
    const role = resolveTavernRoleIdentityEvent(context);
    const currentCharacter = getCurrentTavernCharacterSnapshotEvent(context);
    const group = resolveCurrentGroupEvent(context);
    const groupRecord = (group ?? null) as Record<string, unknown> | null;
    const groupId = normalizeText(groupRecord?.id ?? contextRecord.groupId);
    const characterId = normalizeText(currentCharacter?.index ?? contextRecord.characterId ?? contextRecord.this_chid);
    const bindingFingerprint = `${groupId || '-'}|${characterId || '-'}`;

    const characterCore: Record<string, unknown> = {
        roleKey: role.roleKey,
        roleId: role.roleId,
        displayName: role.displayName,
        avatarName: role.avatarName,
        groupId,
        characterId,
        cardName: normalizeText(contextRecord.characterName ?? contextRecord.name2),
        description: normalizeText(contextRecord.description ?? contextRecord.desc ?? contextRecord.personality),
        scenario: normalizeText(contextRecord.scenario),
        tags: Array.isArray(contextRecord.tags) ? contextRecord.tags : [],
    };

    const systemPrompt = normalizeText(
        contextRecord.systemPrompt
        ?? contextRecord.system_prompt
        ?? contextRecord.main_prompt
        ?? contextRecord.storyString
        ?? '',
    );
    const firstMessage = normalizeText(
        contextRecord.firstMessage
        ?? contextRecord.first_mes
        ?? contextRecord.opener
        ?? '',
    );
    const authorNote = normalizeText(
        contextRecord.authorNote
        ?? contextRecord.author_note
        ?? contextRecord.creator_notes
        ?? '',
    );
    const jailbreak = normalizeText(contextRecord.jailbreak ?? contextRecord.jailbreak_prompt ?? '');
    const instruct = normalizeText(contextRecord.instruct ?? contextRecord.instruct_prompt ?? '');
    const selection = normalizeColdStartLorebookSelection(activeLorebooksOverride, listTavernActiveWorldbooksEvent(24));
    const lorebookSelection = await resolveSelectedLorebookEntries(selection);
    const activeLorebooks = lorebookSelection.activeLorebooks;
    const groupMembers = extractGroupMembers(contextRecord, groupRecord);
    const presetStyle = normalizeText(
        contextRecord.preset
        ?? contextRecord.presetName
        ?? contextRecord.chatCompletionPreset
        ?? (contextRecord.chatCompletionSettings as Record<string, unknown> | undefined)?.preset,
    );

    const identityText = [
        normalizeText(characterCore.cardName),
        normalizeText(characterCore.description),
        normalizeText(contextRecord.personality),
        normalizeText(contextRecord.mes_example),
        authorNote,
    ].join('\n');
    const worldText = [
        normalizeText(contextRecord.scenario),
        normalizeText(contextRecord.world_info),
        normalizeText(contextRecord.description),
        systemPrompt,
        buildSelectedLorebookContextText(lorebookSelection.entries),
    ].join('\n');

    const identitySeed = buildIdentitySeed(
        role.roleKey,
        role.displayName,
        Array.from(new Set([normalizeText(characterCore.cardName), role.displayName, normalizeText(contextRecord.name2)]))
            .filter(Boolean)
            .slice(0, 8),
        identityText,
        'sillytavern.context.character',
    );
    const worldSeed = buildWorldSeed(worldText, 'sillytavern.context.world');
    const styleSeed = buildStyleSeed(systemPrompt, instruct, jailbreak);
    const lorebookSeed = buildLorebookSeed(activeLorebooks, lorebookSelection.entries, worldText);
    const characterAnchors = buildCharacterAnchors({
        roleKey: role.roleKey,
        displayName: role.displayName,
        cardName: normalizeText(characterCore.cardName),
        identitySeed,
        firstMessage,
    });

    const seed: ChatSemanticSeed = {
        collectedAt: Date.now(),
        characterCore,
        systemPrompt,
        firstMessage,
        authorNote,
        jailbreak,
        instruct,
        activeLorebooks,
        lorebookSeed,
        groupMembers,
        characterAnchors,
        presetStyle,
        identitySeed,
        worldSeed,
        styleSeed,
        sourceTrace: [
            buildSourceTrace('character_core', 'context.character', 0.9),
            buildSourceTrace('system_prompt', 'context.system_prompt', 0.85),
            buildSourceTrace('first_message', 'context.first_mes', 0.7),
            buildSourceTrace('lorebook', activeLorebooksOverride ? 'memoryos.cold_start_selection' : 'global.selected_world_info', 0.8),
        ],
    };
    return {
        seed,
        fingerprint: buildSemanticSeedFingerprint(chatKey, seed),
        bindingFingerprint,
    };
}

export async function collectChatSemanticSeedWithAi(
    chatKey: string,
    activeLorebooksOverride?: ColdStartLorebookSelection | string[],
    options?: {
        forceAi?: boolean;
        taskPresentation?: TaskPresentationOverride;
        taskDescription?: string;
    },
): Promise<SemanticBootstrapResult> {
    const base = await collectChatSemanticSeed(chatKey, activeLorebooksOverride);
    if (!base.seed) {
        return base;
    }

    try {
        const enhancedSeed = await enhanceSemanticSeedWithAiWithOptions(base.seed, {
            force: options?.forceAi === true,
            chatKey,
            taskPresentation: options?.taskPresentation,
            taskDescription: options?.taskDescription,
        });
        return {
            ...base,
            seed: enhancedSeed,
            fingerprint: buildSemanticSeedFingerprint(chatKey, enhancedSeed),
        };
    } catch {
        return base;
    }
}
