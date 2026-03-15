import {
    getSillyTavernContextEvent,
    resolveCurrentGroupEvent,
    resolveTavernRoleIdentityEvent,
} from '../../../SDK/tavern';
import type {
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

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function hashString(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return `h${(hash >>> 0).toString(16)}`;
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

export function collectChatSemanticSeed(chatKey: string): SemanticBootstrapResult {
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
    const group = resolveCurrentGroupEvent(context);
    const groupRecord = (group ?? null) as Record<string, unknown> | null;
    const groupId = normalizeText(groupRecord?.id ?? contextRecord.groupId);
    const characterId = normalizeText(contextRecord.characterId ?? contextRecord.this_chid);
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
    const activeLorebooksRaw = (globalThis as Record<string, unknown>).selected_world_info ?? contextRecord.selected_world_info;
    const activeLorebooks = Array.isArray(activeLorebooksRaw)
        ? activeLorebooksRaw.map((item: unknown): string => normalizeText(item)).filter(Boolean)
        : [];
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

    const seed: ChatSemanticSeed = {
        collectedAt: Date.now(),
        characterCore,
        systemPrompt,
        firstMessage,
        authorNote,
        jailbreak,
        instruct,
        activeLorebooks,
        groupMembers,
        presetStyle,
        identitySeed,
        worldSeed,
        styleSeed,
        sourceTrace: [
            buildSourceTrace('character_core', 'context.character', 0.9),
            buildSourceTrace('system_prompt', 'context.system_prompt', 0.85),
            buildSourceTrace('first_message', 'context.first_mes', 0.7),
            buildSourceTrace('lorebook', 'global.selected_world_info', 0.8),
        ],
    };
    const fingerprintBase = JSON.stringify({
        chatKey,
        characterCore,
        systemPrompt,
        firstMessage,
        authorNote,
        jailbreak,
        instruct,
        activeLorebooks,
        groupMembers,
        presetStyle,
        identitySeed,
        worldSeed,
        styleSeed,
    });
    return {
        seed,
        fingerprint: hashString(fingerprintBase),
        bindingFingerprint,
    };
}
