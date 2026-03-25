import {
    getCurrentTavernCharacterSnapshotEvent,
    getCurrentTavernUserNameEvent,
    getSillyTavernContextEvent,
    listTavernActiveWorldbooksEvent,
    loadTavernWorldbookEntriesEvent,
    substituteTavernMacrosIfPresentEvent,
    resolveCurrentGroupEvent,
    resolveTavernRoleIdentityEvent,
} from '../../../SDK/tavern';
import { logger } from '../index';
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
    ));
}

function normalizeText(value: unknown): string {
    const expanded = substituteTavernMacrosIfPresentEvent(value);
    return expanded.replace(/\s+/g, ' ').trim();
}

function normalizeLorebookContent(value: unknown): string {
    const expanded = substituteTavernMacrosIfPresentEvent(value);
    return expanded.replace(/\r\n?/g, '\n').trim();
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
            ).values())
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
        identitySeeds: seed.identitySeeds,
        roleProfileSeeds: seed.roleProfileSeeds,
        worldSeed: seed.worldSeed,
        styleSeed: seed.styleSeed,
        aiSummary: seed.aiSummary,
    });
    return hashString(fingerprintBase);
}

/**
 * 功能：统一构建语义冷启动结果对象，并在有种子时同步重算指纹。
 * @param chatKey 当前聊天键。
 * @param seed 当前语义种子；为空时返回空指纹。
 * @param bindingFingerprint 当前绑定指纹。
 * @returns 标准化后的冷启动结果对象。
 */
function buildSemanticBootstrapResult(
    chatKey: string,
    seed: ChatSemanticSeed | null,
    bindingFingerprint: string,
): SemanticBootstrapResult {
    return {
        seed,
        fingerprint: seed ? buildSemanticSeedFingerprint(chatKey, seed) : '',
        bindingFingerprint,
    };
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

/**
 * Split seed text without a max-count cap.
 * Newlines and punctuation are treated as separators.
 * @param values Raw source text blocks.
 * @returns Deduplicated seed segments.
 */
function splitSeedValuesAll(...values: string[]): string[] {
    const combined = values.map((value) => substituteTavernMacrosIfPresentEvent(value)).join('\n');
    return Array.from(new Set(
        combined
            .split(/[\r\n\u3002\uff01\uff1f!?;\uff1b,\uff0c\u3001]+/g)
            .map((item) => normalizeText(item))
            .filter((item) => item.length >= 2),
    ));
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

/**
 * 功能：构建冷启动种子使用的统一来源追踪列表。
 * @param usedCustomLorebookSelection 是否使用了自定义世界书选择。
 * @returns 规范化后的来源追踪数组。
 */
function buildBootstrapSourceTrace(usedCustomLorebookSelection: boolean): SeedSourceTrace[] {
    return [
        buildSourceTrace('character_core', 'context.character', 0.9),
        buildSourceTrace('system_prompt', 'context.system_prompt', 0.85),
        buildSourceTrace('first_message', 'context.first_mes', 0.7),
        buildSourceTrace('lorebook', usedCustomLorebookSelection ? 'memoryos.cold_start_selection' : 'global.selected_world_info', 0.8),
    ];
}

/**
 * 功能：构建冷启动阶段的角色核心上下文对象。
 * @param contextRecord 原始上下文记录。
 * @param role 当前角色身份解析结果。
 * @param groupId 当前群组标识。
 * @param characterId 当前角色标识。
 * @param currentUserName 当前用户名。
 * @returns 角色核心上下文对象。
 */
function buildCharacterCoreRecord(
    contextRecord: Record<string, unknown>,
    role: {
        roleKey: string;
        roleId: string;
        displayName: string;
        avatarName: string;
    },
    groupId: string,
    characterId: string,
    currentUserName: string,
): Record<string, unknown> {
    return {
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
        userName: currentUserName,
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
    const all = splitSeedValuesAll(worldText);
    return {
        locations: all.filter((item: string): boolean => /城|镇|村|地点|神殿|遗迹|据点|学院|基地|空间站|房间|森林|峡谷/.test(item)),
        rules: all.filter((item: string): boolean => /规则|法则|必须|不能|禁止|限制|流程|约定|制度|历法|货币|税制|习俗|传统/.test(item)),
        hardConstraints: all.filter((item: string): boolean => /不得|禁止|绝不|必须|唯一|固定/.test(item)),
        entities: all.filter((item: string): boolean => /组织|势力|阵营|宗派|家族|公会|议会|机构|装置|遗物/.test(item)),
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
    const fallbackSnippets = splitSeedValuesAll(worldText);
    const entryGroups = new Map<string, LoadedLorebookEntry[]>();
    for (const entry of selectedEntries) {
        const book = normalizeText(entry.book);
        if (!book) {
            continue;
        }
        const current = entryGroups.get(book) ?? [];
        current.push(entry);
        entryGroups.set(book, current);
    }
    return activeLorebooks
        .map((book: string): string => normalizeText(book))
        .filter(Boolean)
        .map((book: string) => ({
            book,
            hash: hashString(book.toLowerCase()),
            snippets: (() => {
                const selectedSnippets = Array.from(new Set(
                    (entryGroups.get(book) ?? [])
                        .map((entry: LoadedLorebookEntry): string => {
                            const entryTitle = normalizeText(entry.entry) || '未命名条目';
                            const rawContent = normalizeLorebookContent(entry.content);
                            if (!rawContent) {
                                return '';
                            }
                            return `${entryTitle}：${rawContent}`;
                        })
                        .filter(Boolean),
                ));
                if (selectedSnippets.length > 0) {
                    return selectedSnippets;
                }
                return fallbackSnippets;
            })(),
        }));
}

function buildSelectedLorebookContextText(entries: LoadedLorebookEntry[]): string {
    return entries
        .map((entry: LoadedLorebookEntry): string => `${entry.book} / ${entry.entry}：${normalizeLorebookContent(entry.content)}`)
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

/**
 * 功能：采集当前会话的基础语义种子，但不触发 AI 结构化增强。
 * @param chatKey 当前聊天键。
 * @param activeLorebooksOverride 可选的世界书覆盖选择。
 * @returns 基础冷启动种子与对应指纹。
 */
export async function collectChatSemanticSeed(
    chatKey: string,
    activeLorebooksOverride?: ColdStartLorebookSelection | string[],
): Promise<SemanticBootstrapResult> {
    const context = getSillyTavernContextEvent();
    if (!context) {
        return buildSemanticBootstrapResult(chatKey, null, '');
    }

    const contextRecord = context as unknown as Record<string, unknown>;
    const role = resolveTavernRoleIdentityEvent(context);
    const currentUserName = getCurrentTavernUserNameEvent(context);
    const currentCharacter = getCurrentTavernCharacterSnapshotEvent(context);
    const group = resolveCurrentGroupEvent(context);
    const groupRecord = (group ?? null) as Record<string, unknown> | null;
    const groupId = normalizeText(groupRecord?.id ?? contextRecord.groupId);
    const characterId = normalizeText(currentCharacter?.index ?? contextRecord.characterId ?? contextRecord.this_chid);
    const bindingFingerprint = `${groupId || '-'}|${characterId || '-'}`;

    const characterCore = buildCharacterCoreRecord(
        contextRecord,
        role,
        groupId,
        characterId,
        currentUserName,
    );

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
    const selection = normalizeColdStartLorebookSelection(activeLorebooksOverride, listTavernActiveWorldbooksEvent(Number.MAX_SAFE_INTEGER));
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
        sourceTrace: buildBootstrapSourceTrace(Boolean(activeLorebooksOverride)),
    };
    return buildSemanticBootstrapResult(chatKey, seed, bindingFingerprint);
}

/**
 * 功能：采集基础语义种子后立刻接入 AI JSON 增强链路，返回增强后的冷启动结果。
 * @param chatKey 当前聊天键。
 * @param activeLorebooksOverride 可选的世界书覆盖选择。
 * @param options 冷启动增强选项。
 * @returns 增强后的冷启动结果；AI 失败时回退基础结果。
 */
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
        return buildSemanticBootstrapResult(chatKey, enhancedSeed, base.bindingFingerprint);
    } catch (error: unknown) {
        logger.warn('[ColdStart][AiEnhanceFailed]', {
            chatKey,
            error: error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
        return base;
    }
}
