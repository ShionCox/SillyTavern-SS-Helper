/**
 * 功能：定义消息事件类型，统一限制去重模块仅处理用户/助手消息写入。
 */
export type MessageIngestEventType = 'chat.message.received' | 'chat.message.sent';

/**
 * 功能：定义消息角色，用于维护不同角色的短窗签名去重状态。
 */
export type MessageIngestRole = 'assistant' | 'user';

/**
 * 功能：定义入口来源，用于 bootstrap 与 runtime 的差异化判定。
 */
export type MessageIngestSource = 'runtime' | 'bootstrap';

/**
 * 功能：定义审计视角下的去重命中来源。
 */
export type MessageIngestDedupSource = 'message_id' | 'text_signature' | 'none';

/**
 * 功能：保存单个角色最近一次写入的签名快照。
 */
export interface MessageRoleSignatureState {
    signature: string;
    signatureAt: number;
    textSignature: string;
    textSignatureAt: number;
}

/**
 * 功能：维护运行期去重状态，供调用层显式持有和更新。
 */
export interface IngestDedupRuntimeState {
    processedEventKeys: Set<string>;
    pendingKeys: Set<string>;
    bootstrapAssistantByChatKey: Map<string, string>;
    historicalMessageIdsOnBind: Set<string>;
    historicalMessageTextSignaturesOnBind: Set<string>;
    bindHydrationUntilTs: number;
    bindHydrationTextGuardUntilTs: number;
    lastAcceptedByRole: Record<MessageIngestRole, MessageRoleSignatureState>;
    duplicateSignatureWindowMs: number;
}

/**
 * 功能：描述标准化后的去重指纹信息。
 */
export interface IngestDedupFingerprint {
    normalizedMessageId: string;
    textSignature: string;
    dedupKey: string;
    pendingKey: string;
}

/**
 * 功能：定义实时链路去重判定结果。
 */
export interface IngestDedupDecision extends IngestDedupFingerprint {
    accepted: boolean;
    reasonCodes: string[];
}

/**
 * 功能：定义实时链路去重判定输入。
 */
export interface ShouldAcceptIncomingMessageInput {
    state: IngestDedupRuntimeState;
    chatKey: string;
    eventType: MessageIngestEventType;
    role: MessageIngestRole;
    messageId: unknown;
    text: string;
    source: MessageIngestSource;
    now: number;
}

/**
 * 功能：定义历史补录链路去重判定输入。
 */
export interface ShouldBackfillHistoricalMessageInput {
    existingMessageIds: Set<string>;
    existingTextSignatures: Set<string>;
    isSystemMessage: boolean;
    messageId: unknown;
    text: string;
}

/**
 * 功能：定义历史补录判定结果。
 */
export interface HistoricalBackfillDecision {
    accepted: boolean;
    reasonCodes: string[];
    normalizedMessageId: string;
    textSignature: string;
}

/**
 * 功能：定义事件去重索引构建输入，支持从 events 表记录抽取关键字段。
 */
export interface BuildExistingMessageDedupIndexInput {
    events: Iterable<{
        refs?: { messageId?: unknown } | null;
        payload?: { text?: unknown } | null;
    } | null | undefined>;
}

/**
 * 功能：定义基于历史事件构建出的去重索引快照。
 */
export interface ExistingMessageDedupIndex {
    messageIds: Set<string>;
    textSignatures: Set<string>;
    latestTextSignature: string;
}

/**
 * 功能：定义落库前二次去重判定输入（基于 DB 已有事件）。
 */
export interface ShouldAcceptPersistedMessageInput {
    existingMessageIds: Set<string>;
    existingTextSignatures: Set<string>;
    latestTextSignature: string;
    messageId: unknown;
    text: string;
    source: MessageIngestSource;
}

/**
 * 功能：定义落库前二次去重判定结果。
 */
export interface PersistedMessageDedupDecision {
    accepted: boolean;
    reasonCodes: string[];
    normalizedMessageId: string;
    textSignature: string;
}

/**
 * 功能：定义记录已接受消息时的状态更新选项。
 */
export interface RecordAcceptedMessageInput {
    decision: IngestDedupDecision;
    role: MessageIngestRole;
    now: number;
    source: MessageIngestSource;
    chatKey: string;
    text: string;
}

/**
 * 功能：定义注入历史快照时的 hydration 初始化参数。
 */
export interface SeedHydrationStateInput {
    messageIds: Iterable<string>;
    textSignatures: Iterable<string>;
    now: number;
    idGuardWindowMs: number;
    textGuardWindowMs: number;
}

/**
 * 功能：构建空角色签名状态。
 * @returns 默认签名状态。
 */
function createEmptyRoleSignatureState(): MessageRoleSignatureState {
    return {
        signature: '',
        signatureAt: 0,
        textSignature: '',
        textSignatureAt: 0,
    };
}

/**
 * 功能：创建运行期去重状态容器。
 * @param duplicateSignatureWindowMs 签名短窗时长（毫秒）。
 * @returns 初始化后的运行期状态。
 */
export function createIngestDedupRuntimeState(duplicateSignatureWindowMs: number = 3000): IngestDedupRuntimeState {
    return {
        processedEventKeys: new Set<string>(),
        pendingKeys: new Set<string>(),
        bootstrapAssistantByChatKey: new Map<string, string>(),
        historicalMessageIdsOnBind: new Set<string>(),
        historicalMessageTextSignaturesOnBind: new Set<string>(),
        bindHydrationUntilTs: 0,
        bindHydrationTextGuardUntilTs: 0,
        lastAcceptedByRole: {
            assistant: createEmptyRoleSignatureState(),
            user: createEmptyRoleSignatureState(),
        },
        duplicateSignatureWindowMs: Math.max(0, Number(duplicateSignatureWindowMs) || 0),
    };
}

/**
 * 功能：重置运行期去重状态（聊天切换时调用）。
 * @param state 去重状态对象。
 */
export function resetIngestDedupRuntimeState(state: IngestDedupRuntimeState): void {
    state.processedEventKeys.clear();
    state.pendingKeys.clear();
    state.bootstrapAssistantByChatKey.clear();
    state.historicalMessageIdsOnBind.clear();
    state.historicalMessageTextSignaturesOnBind.clear();
    state.bindHydrationUntilTs = 0;
    state.bindHydrationTextGuardUntilTs = 0;
    state.lastAcceptedByRole.assistant = createEmptyRoleSignatureState();
    state.lastAcceptedByRole.user = createEmptyRoleSignatureState();
}

/**
 * 功能：注入聊天绑定阶段的历史索引与保护窗口。
 * @param state 去重状态对象。
 * @param input 历史索引与窗口配置。
 */
export function seedIngestDedupHydrationState(state: IngestDedupRuntimeState, input: SeedHydrationStateInput): void {
    state.historicalMessageIdsOnBind.clear();
    state.historicalMessageTextSignaturesOnBind.clear();
    for (const item of input.messageIds) {
        const normalized = normalizeIncomingMessageId(item, false);
        if (normalized) {
            state.historicalMessageIdsOnBind.add(normalized);
        }
    }
    for (const item of input.textSignatures) {
        const normalized = buildMessageTextSignature(item);
        if (normalized) {
            state.historicalMessageTextSignaturesOnBind.add(normalized);
        }
    }
    state.bindHydrationUntilTs = Math.max(0, input.now + Math.max(0, input.idGuardWindowMs));
    state.bindHydrationTextGuardUntilTs = Math.max(0, input.now + Math.max(0, input.textGuardWindowMs));
}

/**
 * 功能：归一化传入的消息 ID，支持原始值或对象字段输入。
 * @param value 传入 ID 或包含 ID 的对象。
 * @param treatZeroAsEmpty 是否将字符串 "0" 视为无效 ID。
 * @returns 归一化后的消息 ID。
 */
export function normalizeIncomingMessageId(value: unknown, treatZeroAsEmpty: boolean = false): string {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        const candidate = record._id ?? record.id ?? record.messageId ?? record.mesid ?? '';
        const nestedNormalized = normalizeIncomingMessageId(candidate, treatZeroAsEmpty);
        if (nestedNormalized) {
            return nestedNormalized;
        }
    }
    const normalized = String(value ?? '').trim();
    if (treatZeroAsEmpty && normalized === '0') {
        return '';
    }
    return normalized;
}

/**
 * 功能：归一化文本签名，统一空白折叠规则。
 * @param text 原始文本。
 * @returns 归一化后的文本签名。
 */
export function buildMessageTextSignature(text: unknown): string {
    return String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 功能：根据 messageId 与文本签名推断去重来源，用于审计记录。
 * @param messageId 标准化前或标准化后的消息 ID。
 * @param textSignature 文本签名或原始文本。
 * @returns 去重来源类型。
 */
export function resolveMessageIngestDedupSource(
    messageId: unknown,
    textSignature: unknown,
): MessageIngestDedupSource {
    const normalizedMessageId = normalizeIncomingMessageId(messageId, false);
    if (normalizedMessageId) {
        return 'message_id';
    }
    const normalizedTextSignature = buildMessageTextSignature(textSignature);
    if (normalizedTextSignature) {
        return 'text_signature';
    }
    return 'none';
}

/**
 * 功能：构建统一去重指纹。
 * @param chatKey 当前 chatKey。
 * @param eventType 事件类型。
 * @param messageId 消息 ID。
 * @param text 文本内容。
 * @returns 去重指纹。
 */
export function buildDedupFingerprint(
    chatKey: string,
    eventType: MessageIngestEventType,
    messageId: unknown,
    text: string,
): IngestDedupFingerprint {
    const normalizedMessageId = normalizeIncomingMessageId(messageId, false);
    const textSignature = buildMessageTextSignature(text);
    const dedupKey = normalizedMessageId ? `${eventType}:${normalizedMessageId}` : '';
    const pendingKey = normalizedMessageId
        ? `${chatKey}|${eventType}|id:${normalizedMessageId}`
        : textSignature
            ? `${chatKey}|${eventType}|text:${textSignature}`
            : '';
    return {
        normalizedMessageId,
        textSignature,
        dedupKey,
        pendingKey,
    };
}

/**
 * 功能：判定实时链路消息是否应被接受。
 * @param input 判定输入。
 * @returns 判定结果与标准化指纹。
 */
export function shouldAcceptIncomingMessage(input: ShouldAcceptIncomingMessageInput): IngestDedupDecision {
    const fingerprint = buildDedupFingerprint(
        input.chatKey,
        input.eventType,
        input.messageId,
        input.text,
    );
    if (fingerprint.dedupKey && input.state.processedEventKeys.has(fingerprint.dedupKey)) {
        return { ...fingerprint, accepted: false, reasonCodes: ['skip:event_replayed'] };
    }

    if (fingerprint.normalizedMessageId && input.state.historicalMessageIdsOnBind.has(fingerprint.normalizedMessageId)) {
        return { ...fingerprint, accepted: false, reasonCodes: ['skip:hydration_id_duplicate'] };
    }
    if (!fingerprint.normalizedMessageId && input.now <= input.state.bindHydrationUntilTs) {
        return { ...fingerprint, accepted: false, reasonCodes: ['skip:hydration_missing_id'] };
    }
    if (
        !fingerprint.normalizedMessageId
        && fingerprint.textSignature
        && input.now <= input.state.bindHydrationTextGuardUntilTs
        && input.state.historicalMessageTextSignaturesOnBind.has(fingerprint.textSignature)
    ) {
        return { ...fingerprint, accepted: false, reasonCodes: ['skip:hydration_text_duplicate'] };
    }

    const roleState = input.state.lastAcceptedByRole[input.role];
    const signature = `${fingerprint.normalizedMessageId}|${input.text}`;
    if (
        signature
        && roleState.signature
        && signature === roleState.signature
        && input.now - roleState.signatureAt <= input.state.duplicateSignatureWindowMs
    ) {
        return { ...fingerprint, accepted: false, reasonCodes: ['skip:signature_duplicate'] };
    }
    if (
        fingerprint.textSignature
        && roleState.textSignature
        && fingerprint.textSignature === roleState.textSignature
        && input.now - roleState.textSignatureAt <= input.state.duplicateSignatureWindowMs
    ) {
        return { ...fingerprint, accepted: false, reasonCodes: ['skip:text_signature_duplicate'] };
    }

    if (
        input.source === 'bootstrap'
        && fingerprint.textSignature
        && input.chatKey
        && input.state.bootstrapAssistantByChatKey.get(input.chatKey) === fingerprint.textSignature
    ) {
        return { ...fingerprint, accepted: false, reasonCodes: ['skip:bootstrap_text_duplicate'] };
    }

    if (fingerprint.pendingKey && input.state.pendingKeys.has(fingerprint.pendingKey)) {
        return { ...fingerprint, accepted: false, reasonCodes: ['skip:pending_duplicate'] };
    }

    return { ...fingerprint, accepted: true, reasonCodes: ['accepted'] };
}

/**
 * 功能：判定历史补录消息是否应被接受。
 * @param input 判定输入。
 * @returns 补录判定结果。
 */
export function shouldBackfillHistoricalMessage(input: ShouldBackfillHistoricalMessageInput): HistoricalBackfillDecision {
    if (input.isSystemMessage) {
        return {
            accepted: false,
            reasonCodes: ['skip:system_message'],
            normalizedMessageId: '',
            textSignature: '',
        };
    }

    const normalizedMessageId = normalizeIncomingMessageId(input.messageId, false);
    const textSignature = buildMessageTextSignature(input.text);
    if (!textSignature) {
        return {
            accepted: false,
            reasonCodes: ['skip:filtered_empty'],
            normalizedMessageId,
            textSignature,
        };
    }

    if (normalizedMessageId && input.existingMessageIds.has(normalizedMessageId)) {
        return {
            accepted: false,
            reasonCodes: ['skip:db_message_id_duplicate'],
            normalizedMessageId,
            textSignature,
        };
    }

    if (textSignature && input.existingTextSignatures.has(textSignature)) {
        return {
            accepted: false,
            reasonCodes: ['skip:db_text_signature_duplicate'],
            normalizedMessageId,
            textSignature,
        };
    }

    return {
        accepted: true,
        reasonCodes: ['accepted'],
        normalizedMessageId,
        textSignature,
    };
}

/**
 * 功能：从已有事件列表构建 messageId/textSignature 去重索引与最新文本签名。
 * @param input 事件列表输入。
 * @returns 提取后的去重索引快照。
 */
export function buildExistingMessageDedupIndex(input: BuildExistingMessageDedupIndexInput): ExistingMessageDedupIndex {
    const messageIds = new Set<string>();
    const textSignatures = new Set<string>();
    let latestTextSignature = '';
    let visited = false;
    for (const item of input.events) {
        if (!visited) {
            latestTextSignature = buildMessageTextSignature((item?.payload as { text?: unknown } | undefined)?.text ?? '');
            visited = true;
        }
        const normalizedMessageId = normalizeIncomingMessageId((item?.refs as { messageId?: unknown } | undefined)?.messageId, false);
        if (normalizedMessageId) {
            messageIds.add(normalizedMessageId);
        }
        const textSignature = buildMessageTextSignature((item?.payload as { text?: unknown } | undefined)?.text ?? '');
        if (textSignature) {
            textSignatures.add(textSignature);
        }
    }
    return {
        messageIds,
        textSignatures,
        latestTextSignature,
    };
}

/**
 * 功能：判定消息在落库前是否应通过 DB 维度去重与 bootstrap 最新文本兜底去重。
 * @param input 落库判定输入。
 * @returns 落库判定结果。
 */
export function shouldAcceptPersistedMessage(input: ShouldAcceptPersistedMessageInput): PersistedMessageDedupDecision {
    const baseDecision = shouldBackfillHistoricalMessage({
        existingMessageIds: input.existingMessageIds,
        existingTextSignatures: input.existingTextSignatures,
        isSystemMessage: false,
        messageId: input.messageId,
        text: input.text,
    });
    if (!baseDecision.accepted) {
        return baseDecision;
    }
    if (
        input.source === 'bootstrap'
        && baseDecision.textSignature
        && input.latestTextSignature
        && baseDecision.textSignature === buildMessageTextSignature(input.latestTextSignature)
    ) {
        return {
            accepted: false,
            reasonCodes: ['skip:bootstrap_text_duplicate'],
            normalizedMessageId: baseDecision.normalizedMessageId,
            textSignature: baseDecision.textSignature,
        };
    }
    return {
        accepted: true,
        reasonCodes: ['accepted'],
        normalizedMessageId: baseDecision.normalizedMessageId,
        textSignature: baseDecision.textSignature,
    };
}

/**
 * 功能：把已接受消息写回去重状态（可按需更新不同维度）。
 * @param state 去重状态对象。
 * @param input 状态更新参数。
 */
export function recordAcceptedMessage(state: IngestDedupRuntimeState, input: RecordAcceptedMessageInput): void {
    if (input.decision.dedupKey) {
        state.processedEventKeys.add(input.decision.dedupKey);
    }
    if (input.decision.pendingKey) {
        state.pendingKeys.add(input.decision.pendingKey);
    }
    state.lastAcceptedByRole[input.role] = {
        signature: `${input.decision.normalizedMessageId}|${input.text}`,
        signatureAt: input.now,
        textSignature: input.decision.textSignature,
        textSignatureAt: input.now,
    };
    if (input.source === 'bootstrap' && input.chatKey && input.decision.textSignature) {
        state.bootstrapAssistantByChatKey.set(input.chatKey, input.decision.textSignature);
    }
}

/**
 * 功能：释放运行时 pending 去重键（append 结束后调用）。
 * @param state 去重状态对象。
 * @param pendingKey 待释放键。
 */
export function releasePendingKey(state: IngestDedupRuntimeState, pendingKey: string): void {
    if (!pendingKey) {
        return;
    }
    state.pendingKeys.delete(pendingKey);
}
