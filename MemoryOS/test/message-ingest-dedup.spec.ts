import { describe, expect, it } from 'vitest';
import {
    buildExistingMessageDedupIndex,
    buildDedupFingerprint,
    buildMessageTextSignature,
    createIngestDedupRuntimeState,
    getPersistedRecentDedupIndexSnapshot,
    normalizeIncomingMessageId,
    recordPersistedRecentAcceptedMessage,
    recordAcceptedMessage,
    resolveMessageIngestDedupSource,
    releasePendingKey,
    resetIngestDedupRuntimeState,
    seedPersistedRecentDedupBucketFromEvents,
    seedIngestDedupHydrationState,
    shouldAcceptIncomingMessage,
    shouldAcceptPersistedMessage,
    shouldBackfillHistoricalMessage,
} from '../src/core/message-ingest-dedup';
import { MEMORY_OS_POLICY } from '../src/policy/memory-policy';

describe('message-ingest-dedup', (): void => {
    it('normalizeIncomingMessageId 能处理空值、对象字段与 "0" 稳定化规则', (): void => {
        expect(normalizeIncomingMessageId(undefined)).toBe('');
        expect(normalizeIncomingMessageId('  abc  ')).toBe('abc');
        expect(normalizeIncomingMessageId({ messageId: ' mid-001 ' })).toBe('mid-001');
        expect(normalizeIncomingMessageId('0')).toBe('0');
        expect(normalizeIncomingMessageId('0', true)).toBe('');
    });

    it('buildMessageTextSignature 会折叠空白与换行', (): void => {
        expect(buildMessageTextSignature('  a   b  \n c  ')).toBe('a b c');
        expect(buildMessageTextSignature('')).toBe('');
    });

    it('buildDedupFingerprint 能生成统一 dedup/pending 指纹', (): void => {
        const byId = buildDedupFingerprint('chat-001', 'chat.message.received', 'm-1', 'hello');
        expect(byId.normalizedMessageId).toBe('m-1');
        expect(byId.dedupKey).toBe('chat.message.received:m-1');
        expect(byId.pendingKey).toBe('chat-001|chat.message.received|id:m-1');

        const byText = buildDedupFingerprint('chat-001', 'chat.message.sent', '', ' hello \n world ');
        expect(byText.normalizedMessageId).toBe('');
        expect(byText.textSignature).toBe('hello world');
        expect(byText.pendingKey).toBe('chat-001|chat.message.sent|text:hello world');
    });

    it('resolveMessageIngestDedupSource 能返回审计用去重来源', (): void => {
        expect(resolveMessageIngestDedupSource('m-1', '')).toBe('message_id');
        expect(resolveMessageIngestDedupSource('', 'hello world')).toBe('text_signature');
        expect(resolveMessageIngestDedupSource('', '')).toBe('none');
    });

    it('shouldAcceptIncomingMessage 支持事件重放与 pending 去重', (): void => {
        const state = createIngestDedupRuntimeState();
        const now = Date.now();
        const first = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            role: 'assistant',
            messageId: 'm-1',
            text: 'hello',
            source: 'runtime',
            now,
        });
        expect(first.accepted).toBe(true);
        recordAcceptedMessage(state, {
            decision: first,
            role: 'assistant',
            now,
            source: 'runtime',
            chatKey: 'chat-001',
            text: 'hello',
        });

        const replay = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            role: 'assistant',
            messageId: 'm-1',
            text: 'hello',
            source: 'runtime',
            now: now + 1,
        });
        expect(replay.accepted).toBe(false);
        expect(replay.reasonCodes).toContain('skip:event_replayed');

        const pendingDuplicate = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            role: 'assistant',
            messageId: '',
            text: 'pending only',
            source: 'runtime',
            now: now + 2,
        });
        expect(pendingDuplicate.accepted).toBe(true);
        recordAcceptedMessage(state, {
            decision: pendingDuplicate,
            role: 'assistant',
            now: now + 2,
            source: 'runtime',
            chatKey: 'chat-001',
            text: 'pending only',
        });
        const pendingBlocked = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            role: 'assistant',
            messageId: '',
            text: 'pending only',
            source: 'runtime',
            now: now + 4005,
        });
        expect(pendingBlocked.accepted).toBe(false);
        expect(pendingBlocked.reasonCodes).toContain('skip:pending_duplicate');

        releasePendingKey(state, pendingDuplicate.pendingKey);
        const pendingReleased = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            role: 'assistant',
            messageId: '',
            text: 'pending only',
            source: 'runtime',
            now: now + 4010,
        });
        expect(pendingReleased.accepted).toBe(true);
    });

    it('shouldAcceptIncomingMessage 支持角色签名短窗与 bootstrap 文本去重', (): void => {
        const state = createIngestDedupRuntimeState();
        const now = Date.now();
        const first = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            role: 'assistant',
            messageId: '',
            text: 'same text',
            source: 'runtime',
            now,
        });
        expect(first.accepted).toBe(true);
        recordAcceptedMessage(state, {
            decision: first,
            role: 'assistant',
            now,
            source: 'runtime',
            chatKey: 'chat-001',
            text: 'same text',
        });

        const textDuplicate = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            role: 'assistant',
            messageId: '',
            text: 'same   text',
            source: 'runtime',
            now: now + 10,
        });
        expect(textDuplicate.accepted).toBe(false);
        expect(textDuplicate.reasonCodes).toContain('skip:text_signature_duplicate');

        const bootstrapAccepted = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            role: 'assistant',
            messageId: '',
            text: 'bootstrap only',
            source: 'bootstrap',
            now: now + 5000,
        });
        expect(bootstrapAccepted.accepted).toBe(true);
        recordAcceptedMessage(state, {
            decision: bootstrapAccepted,
            role: 'assistant',
            now: now + 5000,
            source: 'bootstrap',
            chatKey: 'chat-001',
            text: 'bootstrap only',
        });

        const bootstrapBlocked = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            role: 'assistant',
            messageId: '',
            text: 'bootstrap only',
            source: 'bootstrap',
            now: now + 9000,
        });
        expect(bootstrapBlocked.accepted).toBe(false);
        expect(bootstrapBlocked.reasonCodes).toContain('skip:bootstrap_text_duplicate');
    });

    it('seedIngestDedupHydrationState 支持绑定期无 ID 文本去重与过窗放行', (): void => {
        const state = createIngestDedupRuntimeState();
        const now = Date.now();
        seedIngestDedupHydrationState(state, {
            messageIds: ['m-1'],
            textSignatures: ['hello world'],
            now,
            idGuardWindowMs: 1500,
            textGuardWindowMs: 2000,
        });

        const blockedById = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.sent',
            role: 'user',
            messageId: 'm-1',
            text: 'any',
            source: 'runtime',
            now: now + 100,
        });
        expect(blockedById.accepted).toBe(false);
        expect(blockedById.reasonCodes).toContain('skip:hydration_id_duplicate');

        const blockedByText = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.sent',
            role: 'user',
            messageId: '',
            text: '  hello   world ',
            source: 'runtime',
            now: now + 300,
        });
        expect(blockedByText.accepted).toBe(false);
        expect(blockedByText.reasonCodes).toContain('skip:hydration_missing_id');

        const passAfterWindow = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.sent',
            role: 'user',
            messageId: '',
            text: 'hello world',
            source: 'runtime',
            now: now + 3000,
        });
        expect(passAfterWindow.accepted).toBe(true);
    });

    it('shouldBackfillHistoricalMessage 能判定系统消息与 DB 维度重复', (): void => {
        const existingMessageIds = new Set<string>(['m-1']);
        const existingTextSignatures = new Set<string>(['text-1']);

        const systemSkipped = shouldBackfillHistoricalMessage({
            existingMessageIds,
            existingTextSignatures,
            isSystemMessage: true,
            messageId: 'm-2',
            text: 'hello',
        });
        expect(systemSkipped.accepted).toBe(false);
        expect(systemSkipped.reasonCodes).toContain('skip:system_message');

        const idDuplicate = shouldBackfillHistoricalMessage({
            existingMessageIds,
            existingTextSignatures,
            isSystemMessage: false,
            messageId: 'm-1',
            text: 'new text',
        });
        expect(idDuplicate.accepted).toBe(false);
        expect(idDuplicate.reasonCodes).toContain('skip:db_message_id_duplicate');

        const textDuplicate = shouldBackfillHistoricalMessage({
            existingMessageIds,
            existingTextSignatures,
            isSystemMessage: false,
            messageId: '',
            text: 'text-1',
        });
        expect(textDuplicate.accepted).toBe(false);
        expect(textDuplicate.reasonCodes).toContain('skip:db_text_signature_duplicate');

        const accepted = shouldBackfillHistoricalMessage({
            existingMessageIds,
            existingTextSignatures,
            isSystemMessage: false,
            messageId: 'm-9',
            text: 'new text',
        });
        expect(accepted.accepted).toBe(true);
        expect(accepted.reasonCodes).toContain('accepted');
    });

    it('buildExistingMessageDedupIndex 与 shouldAcceptPersistedMessage 能覆盖落库去重', (): void => {
        const recentEvents = [
            {
                refs: { messageId: 'm-1' },
                payload: { text: 'first text' },
            },
            {
                refs: { messageId: '' },
                payload: { text: 'same text' },
            },
        ];
        const dedupIndex = buildExistingMessageDedupIndex({ events: recentEvents });
        expect(dedupIndex.latestTextSignature).toBe('first text');
        expect(dedupIndex.messageIds.has('m-1')).toBe(true);
        expect(dedupIndex.textSignatures.has('same text')).toBe(true);

        const blockedById = shouldAcceptPersistedMessage({
            existingMessageIds: dedupIndex.messageIds,
            existingTextSignatures: dedupIndex.textSignatures,
            latestTextSignature: dedupIndex.latestTextSignature,
            messageId: 'm-1',
            text: 'new text',
            source: 'runtime',
        });
        expect(blockedById.accepted).toBe(false);
        expect(blockedById.reasonCodes).toContain('skip:db_message_id_duplicate');

        const blockedByText = shouldAcceptPersistedMessage({
            existingMessageIds: dedupIndex.messageIds,
            existingTextSignatures: dedupIndex.textSignatures,
            latestTextSignature: dedupIndex.latestTextSignature,
            messageId: '',
            text: 'same  text',
            source: 'runtime',
        });
        expect(blockedByText.accepted).toBe(false);
        expect(blockedByText.reasonCodes).toContain('skip:db_text_signature_duplicate');

        const blockedByBootstrapLatest = shouldAcceptPersistedMessage({
            existingMessageIds: new Set<string>(),
            existingTextSignatures: new Set<string>(),
            latestTextSignature: 'bootstrap same',
            messageId: '',
            text: 'bootstrap   same',
            source: 'bootstrap',
        });
        expect(blockedByBootstrapLatest.accepted).toBe(false);
        expect(blockedByBootstrapLatest.reasonCodes).toContain('skip:bootstrap_text_duplicate');

        const accepted = shouldAcceptPersistedMessage({
            existingMessageIds: dedupIndex.messageIds,
            existingTextSignatures: dedupIndex.textSignatures,
            latestTextSignature: dedupIndex.latestTextSignature,
            messageId: 'm-9',
            text: 'new text',
            source: 'runtime',
        });
        expect(accepted.accepted).toBe(true);
        expect(accepted.reasonCodes).toContain('accepted');
    });

    it('近期落库缓存支持分桶隔离与缓存命中判定', (): void => {
        const state = createIngestDedupRuntimeState();
        recordPersistedRecentAcceptedMessage(state, {
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            messageId: 'm-1',
            text: 'hello world',
        });
        recordPersistedRecentAcceptedMessage(state, {
            chatKey: 'chat-001',
            eventType: 'chat.message.sent',
            messageId: 'u-1',
            text: 'user text',
        });

        const assistantBucket = getPersistedRecentDedupIndexSnapshot(state, {
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
        });
        const userBucket = getPersistedRecentDedupIndexSnapshot(state, {
            chatKey: 'chat-001',
            eventType: 'chat.message.sent',
        });
        expect(assistantBucket).not.toBeNull();
        expect(userBucket).not.toBeNull();
        expect(assistantBucket?.messageIds.has('m-1')).toBe(true);
        expect(assistantBucket?.messageIds.has('u-1')).toBe(false);
        expect(userBucket?.messageIds.has('u-1')).toBe(true);
        expect(userBucket?.messageIds.has('m-1')).toBe(false);

        const blockedByCache = shouldAcceptPersistedMessage({
            existingMessageIds: assistantBucket!.messageIds,
            existingTextSignatures: assistantBucket!.textSignatures,
            latestTextSignature: assistantBucket!.latestTextSignature,
            messageId: 'm-1',
            text: 'hello world',
            source: 'runtime',
        });
        expect(blockedByCache.accepted).toBe(false);
        expect(blockedByCache.reasonCodes).toContain('skip:db_message_id_duplicate');
    });

    it('近期落库缓存容量超过策略上限时会淘汰最旧项', (): void => {
        const state = createIngestDedupRuntimeState();
        const capacity = MEMORY_OS_POLICY.dedup.persistedBucketCapacity;
        for (let index = 1; index <= capacity + 6; index += 1) {
            recordPersistedRecentAcceptedMessage(state, {
                chatKey: 'chat-001',
                eventType: 'chat.message.received',
                messageId: `m-${index}`,
                text: `text-${index}`,
            });
        }
        const bucket = getPersistedRecentDedupIndexSnapshot(state, {
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
        });
        expect(bucket).not.toBeNull();
        expect(bucket!.messageIds.size).toBeLessThanOrEqual(capacity);
        expect(bucket!.textSignatures.size).toBeLessThanOrEqual(capacity);
        expect(bucket!.messageIds.has('m-1')).toBe(false);
        expect(bucket!.textSignatures.has('text-1')).toBe(false);
        expect(bucket!.messageIds.has(`m-${capacity + 6}`)).toBe(true);
        expect(bucket!.latestTextSignature).toBe(`text-${capacity + 6}`);
    });

    it('按 DB 最近事件回填缓存后，判定结果与现有索引逻辑一致', (): void => {
        const state = createIngestDedupRuntimeState();
        const recentEvents = [
            {
                refs: { messageId: 'm-new' },
                payload: { text: 'latest text' },
            },
            {
                refs: { messageId: 'm-old' },
                payload: { text: 'old text' },
            },
            {
                refs: { messageId: '' },
                payload: { text: 'same text' },
            },
        ];
        const originalIndex = buildExistingMessageDedupIndex({ events: recentEvents });
        const cachedIndex = seedPersistedRecentDedupBucketFromEvents(state, {
            chatKey: 'chat-001',
            eventType: 'chat.message.received',
            events: recentEvents,
        });

        const checkInput = {
            messageId: '',
            text: 'same   text',
            source: 'runtime' as const,
        };
        const byOriginal = shouldAcceptPersistedMessage({
            existingMessageIds: originalIndex.messageIds,
            existingTextSignatures: originalIndex.textSignatures,
            latestTextSignature: originalIndex.latestTextSignature,
            ...checkInput,
        });
        const byCached = shouldAcceptPersistedMessage({
            existingMessageIds: cachedIndex.messageIds,
            existingTextSignatures: cachedIndex.textSignatures,
            latestTextSignature: cachedIndex.latestTextSignature,
            ...checkInput,
        });

        expect(byCached.accepted).toBe(byOriginal.accepted);
        expect(byCached.reasonCodes).toEqual(byOriginal.reasonCodes);
        expect(cachedIndex.latestTextSignature).toBe('latest text');
    });

    it('resetIngestDedupRuntimeState 会清空运行时状态', (): void => {
        const state = createIngestDedupRuntimeState();
        const now = Date.now();
        const decision = shouldAcceptIncomingMessage({
            state,
            chatKey: 'chat-001',
            eventType: 'chat.message.sent',
            role: 'user',
            messageId: 'm-1',
            text: 'hello',
            source: 'runtime',
            now,
        });
        recordAcceptedMessage(state, {
            decision,
            role: 'user',
            now,
            source: 'runtime',
            chatKey: 'chat-001',
            text: 'hello',
        });
        recordPersistedRecentAcceptedMessage(state, {
            chatKey: 'chat-001',
            eventType: 'chat.message.sent',
            messageId: 'm-1',
            text: 'hello',
        });
        expect(state.pendingKeys.size).toBeGreaterThan(0);
        expect(state.processedEventKeys.size).toBeGreaterThan(0);
        expect(state.persistedRecentDedupBuckets.size).toBeGreaterThan(0);

        resetIngestDedupRuntimeState(state);
        expect(state.pendingKeys.size).toBe(0);
        expect(state.processedEventKeys.size).toBe(0);
        expect(state.historicalMessageIdsOnBind.size).toBe(0);
        expect(state.historicalMessageTextSignaturesOnBind.size).toBe(0);
        expect(state.lastAcceptedByRole.user.signature).toBe('');
        expect(state.persistedRecentDedupBuckets.size).toBe(0);
    });
});
