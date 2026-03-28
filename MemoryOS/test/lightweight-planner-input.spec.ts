import { describe, expect, it } from 'vitest';
import {
    buildLightweightPlannerInput,
    normalizeSummarySnapshot,
    resolveNarrativeStyle,
    type SummaryMutationContext,
} from '../src/memory-summary-planner';

describe('lightweight planner input', () => {
    it('提纯窗口事实并保留极小证据片段', () => {
        const context = buildContext();
        const input = buildLightweightPlannerInput(context);

        expect(input.window.windowFacts.length).toBeGreaterThan(0);
        expect(input.window.windowFacts.some((item) => item.includes('拒绝'))).toBe(true);
        expect(input.window.windowFacts.some((item) => item.includes('要求'))).toBe(true);
        expect(input.window.evidenceSnippets.length).toBeGreaterThan(0);
        expect(input.signalPack.evidenceSignals).toContain('明确拒绝');
        expect(input.signalPack.evidenceSignals).toContain('要求补充信息');
    });

    it('优先复用净化后的历史摘要并裁剪允许类型', () => {
        const context = buildContext();
        const input = buildLightweightPlannerInput(context);

        expect(input.rollingDigest.stableContext).toContain('委托');
        expect(input.rollingDigest.taskState[0]).toContain('定金');
        expect(input.candidateCards.every((card) => card.whyRelevant.length > 0)).toBe(true);
        expect(input.allowedTypes).toEqual(['task', 'relationship', 'event']);
    });

    it('可以把旧摘要净化为状态块', () => {
        const normalized = normalizeSummarySnapshot({
            content: '已支付2500定金。艾莉卡仍高度戒备。红色宝石来历不明。',
        });

        expect(normalized.taskState).toContain('已支付2500定金');
        expect(normalized.relationState).toContain('艾莉卡仍高度戒备');
        expect(normalized.unresolvedQuestions[0]).toContain('不明');
    });

    it('古风风格会命中古风词，不混用现代默认词', () => {
        const context = buildAncientContext();
        const input = buildLightweightPlannerInput(context);

        expect(input.signalPack.evidenceSignals).toContain('支付定金');
        expect(input.signalPack.evidenceSignals).toContain('地点行动变化');
    });

    it('超自然隐藏模板会解析为现代主风格加奇幻辅风格', () => {
        const style = resolveNarrativeStyle({
            worldProfileBinding: {
                chatKey: 'chat',
                primaryProfile: 'supernatural_hidden',
                secondaryProfiles: ['urban_modern'],
                confidence: 0.82,
                reasonCodes: ['test'],
                detectedFrom: ['cache'],
                sourceHash: 'style:1',
                createdAt: 1,
                updatedAt: 1,
            },
            worldProfileDetection: {
                primaryProfile: 'supernatural_hidden',
                secondaryProfiles: [],
                confidence: 0.6,
                reasonCodes: ['fallback'],
            },
            windowSummaryText: '她怀疑结界正在失控，但仍在现代城市里继续调查。',
            recentSummaryTexts: ['灵石与法阵线索都指向市区地下设施。'],
        });

        expect(style.primaryStyle).toBe('modern');
        expect(style.secondaryStyles).toContain('fantasy');
        expect(style.isStable).toBe(true);
    });

    it('会优先复用 binding 的稳定来源补强跑团与黑帮风格', () => {
        const style = resolveNarrativeStyle({
            worldProfileBinding: {
                chatKey: 'chat',
                primaryProfile: 'urban_modern',
                secondaryProfiles: [],
                confidence: 0.86,
                reasonCodes: ['黑帮交易', '跑团模组'],
                detectedFrom: ['堂口分账', '副本任务板'],
                sourceHash: 'style:2',
                createdAt: 1,
                updatedAt: 1,
            },
            worldProfileDetection: {
                primaryProfile: 'urban_modern',
                secondaryProfiles: [],
                confidence: 0.52,
                reasonCodes: ['fallback'],
            },
            windowSummaryText: '这一轮只是普通对话，没有明显风格词。',
            recentSummaryTexts: ['仍在继续交谈。'],
        });

        expect(style.primaryStyle).toBe('modern');
        expect(style.secondaryStyles).toContain('gangster');
        expect(style.secondaryStyles).toContain('trpg');
        expect(style.source).toBe('binding');
    });
});

/**
 * 功能：构造测试用上下文。
 * @returns 上下文对象。
 */
function buildContext(): SummaryMutationContext {
    return {
        task: 'memory_summary_mutation',
        schemaVersion: '1.0.0',
        window: {
            fromTurn: 24,
            toTurn: 33,
            summaryText: [
                '艾莉卡把钱袋收下，但这不代表她接单。',
                '她明确拒绝立刻出发前往天顶区。',
                '她要求你现在站在门口，把知道的线索全交代清楚。',
                '那双异色瞳冷静得近乎残忍。',
            ].join('。'),
        },
        detectedSignals: {
            candidateTypes: ['task', 'relationship', 'event'],
            actors: ['艾莉卡', '你'],
            topics: ['红色宝石', '委托'],
        },
        plannerHints: {
            should_update: true,
            focus_types: ['task', 'relationship', 'event'],
            entities: ['艾莉卡', '你'],
            topics: ['红色宝石', '委托'],
            reasons: ['当前交涉涉及委托与关系变化'],
        },
        recentSummaryDigest: [{
            title: '结构化回合总结',
            content: '已支付2500定金。委托未正式确认。艾莉卡仍高度戒备。红色宝石来历不明。',
            updatedAt: Date.now(),
            normalizedSummary: {
                stableContext: '双方围绕红色宝石委托持续交涉，但合作尚未正式成立。',
                taskState: ['已支付2500定金', '委托未正式确认'],
                relationState: ['艾莉卡仍高度戒备'],
                unresolvedQuestions: ['红色宝石来历不明'],
            },
        }],
        worldProfileBias: {
            primaryProfile: 'urban_modern',
            secondaryProfiles: [],
            confidence: 0.8,
            reasonCodes: ['test'],
        },
        narrativeStyle: {
            primaryStyle: 'modern',
            secondaryStyles: [],
            source: 'binding',
            isStable: true,
        },
        typeSchemas: [
            { schemaId: 'task', editableFields: ['title', 'fields.status'] },
            { schemaId: 'relationship', editableFields: ['title', 'fields.state'] },
            { schemaId: 'event', editableFields: ['title', 'fields.result'] },
            { schemaId: 'location', editableFields: ['title', 'fields.function'] },
        ],
        candidateRecords: [
            {
                candidateId: 'cand_1',
                recordId: 'entry_1',
                targetKind: 'task',
                schemaId: 'task',
                title: '红色宝石委托',
                summary: '已收下定金，但委托尚未正式成立。',
                entityKeys: ['艾莉卡', '你'],
                status: 'active',
                updatedAt: Date.now(),
            },
            {
                candidateId: 'cand_2',
                recordId: 'entry_2',
                targetKind: 'relationship',
                schemaId: 'relationship',
                title: '艾莉卡与用户关系',
                summary: '艾莉卡对你保持高度戒备，但未切断交涉。',
                entityKeys: ['艾莉卡', '你'],
                status: 'active',
                updatedAt: Date.now(),
            },
            {
                candidateId: 'cand_3',
                recordId: 'entry_3',
                targetKind: 'event',
                schemaId: 'event',
                title: '门口交涉',
                summary: '艾莉卡拒绝立即出发，并要求先补充线索。',
                entityKeys: ['艾莉卡', '你'],
                status: 'active',
                updatedAt: Date.now(),
            },
        ],
        rules: {
            mustReferenceCandidateWhenPossible: true,
            mustUseAllowedFieldsOnly: true,
            mustPreferUpdateOverDuplicate: true,
            mustReturnJsonOnly: true,
        },
    };
}

/**
 * 功能：构造古风测试上下文。
 * @returns 上下文对象。
 */
function buildAncientContext(): SummaryMutationContext {
    return {
        ...buildContext(),
        window: {
            fromTurn: 10,
            toTurn: 12,
            summaryText: '她收下银票，却仍让你在门外等候。她命你从实道来，再决定是否赴约。',
        },
        worldProfileBias: {
            primaryProfile: 'ancient_traditional',
            secondaryProfiles: [],
            confidence: 0.86,
            reasonCodes: ['test'],
        },
        narrativeStyle: {
            primaryStyle: 'ancient',
            secondaryStyles: [],
            source: 'binding',
            isStable: true,
        },
    };
}
