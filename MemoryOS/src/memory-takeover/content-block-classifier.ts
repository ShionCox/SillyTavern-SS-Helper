/**
 * 功能：内容分块分类器。
 * 根据标签注册表和规则判断，给每个 block 分配最终分类。
 */

import type { ContentBlockKind } from '../config/content-tag-registry';
import {
    getContentClassificationRuntimeSnapshot,
    lookupTagPolicy,
    type ContentClassificationRuntimeSnapshot,
} from '../config/content-tag-registry';
import type { ParsedContentBlock } from './content-block-parser';

/**
 * 功能：定义分类后的内容块。
 */
export interface ClassifiedContentBlock extends ParsedContentBlock {
    /** 最终分类 */
    resolvedKind: ContentBlockKind;
    /** 是否参与主正文抽取 */
    includeInPrimaryExtraction: boolean;
    /** 是否作为辅助上下文 */
    includeAsHint: boolean;
    /** 是否允许角色升级 */
    allowActorPromotion: boolean;
    /** 是否允许关系升级 */
    allowRelationPromotion: boolean;
    /** 分类原因码列表 */
    reasonCodes: string[];
}

/** 思考/meta 关键词 */
const META_KEYWORDS = /当前剧情|本次输出计划|第一段[\s\S]{0,10}第二段|Let'?s\s+write|特别注意|用户要求|剧情推演|剧情与设定回顾|剧情进度|构思下一段|分析如下|思路|推演|让我先分析/i;

/** 工具层关键词 */
const TOOL_KEYWORDS = /insertRow\(|updateRow\(|deleteRow\(|patch\s*\(|\.update\s*\(|\.create\s*\(|\.delete\s*\(/i;

/** 指令层关键词 */
const INSTRUCTION_KEYWORDS = /正文用|字左右|风格[:：]|要求[:：]|请输出|请按|使用.*包裹|任务[:：]|规则[:：]/i;

/** 对话特征 */
const DIALOGUE_KEYWORDS = /["""''「」]|说道|问道|低声|开口|答道|回道|喊道/;

/**
 * 功能：对单个 ParsedContentBlock 做分类。
 * @param block 解析后的内容块。
 * @param role 消息角色。
 * @returns 分类后的内容块。
 */
export function classifyContentBlock(block: ParsedContentBlock, role: string): ClassifiedContentBlock {
    return classifyContentBlockWithRuntime(block, role, getContentClassificationRuntimeSnapshot());
}

/**
 * 功能：使用已缓存的运行时快照对单个内容块做分类。
 * @param block 解析后的内容块。
 * @param role 消息角色。
 * @param runtime 分类器运行时快照。
 * @returns 分类后的内容块。
 */
function classifyContentBlockWithRuntime(
    block: ParsedContentBlock,
    role: string,
    runtime: ContentClassificationRuntimeSnapshot,
): ClassifiedContentBlock {
    const reasonCodes: string[] = [];

    /** 1. 先走标签注册表 */
    if (block.rawTagName) {
        const policy = lookupTagPolicy(block.rawTagName);
        if (policy) {
            reasonCodes.push('tag_registry_match', `tag:${policy.tagName}`);
            return {
                ...block,
                resolvedKind: policy.kind,
                includeInPrimaryExtraction: policy.includeInPrimaryExtraction,
                includeAsHint: policy.includeAsHint,
                allowActorPromotion: policy.allowActorPromotion,
                allowRelationPromotion: policy.allowRelationPromotion,
                reasonCodes,
            };
        }
        /** 有标签但未命中注册表 → 走未知标签策略 */
        const unknownPolicy = runtime.unknownTagPolicy;
        reasonCodes.push('unknown_tag', `tag:${block.rawTagName}`);
        return {
            ...block,
            resolvedKind: unknownPolicy.defaultKind,
            includeInPrimaryExtraction: false,
            includeAsHint: unknownPolicy.allowAsHint,
            allowActorPromotion: false,
            allowRelationPromotion: false,
            reasonCodes,
        };
    }

    /** 2. 无标签文本 → 走规则分类器 */
    const toggles = runtime.classifierToggles;
    const text = block.rawText;

    if (toggles.enableToolArtifactDetection && TOOL_KEYWORDS.test(text)) {
        reasonCodes.push('rule_tool_artifact');
        return {
            ...block,
            resolvedKind: 'tool_artifact',
            includeInPrimaryExtraction: false,
            includeAsHint: true,
            allowActorPromotion: false,
            allowRelationPromotion: false,
            reasonCodes,
        };
    }

    if (toggles.enableMetaKeywordDetection && META_KEYWORDS.test(text)) {
        reasonCodes.push('rule_meta_analysis');
        return {
            ...block,
            resolvedKind: 'meta_commentary',
            includeInPrimaryExtraction: false,
            includeAsHint: false,
            allowActorPromotion: false,
            allowRelationPromotion: false,
            reasonCodes,
        };
    }

    if (toggles.enableRuleClassifier && INSTRUCTION_KEYWORDS.test(text)) {
        reasonCodes.push('rule_instruction');
        return {
            ...block,
            resolvedKind: 'instruction',
            includeInPrimaryExtraction: false,
            includeAsHint: false,
            allowActorPromotion: false,
            allowRelationPromotion: false,
            reasonCodes,
        };
    }

    /** 3. 落入正文判定 */
    if (toggles.enableRuleClassifier) {
        if (role === 'assistant' && DIALOGUE_KEYWORDS.test(text)) {
            reasonCodes.push('rule_story_dialogue');
            return {
                ...block,
                resolvedKind: 'story_primary',
                includeInPrimaryExtraction: true,
                includeAsHint: true,
                allowActorPromotion: true,
                allowRelationPromotion: true,
                reasonCodes,
            };
        }
    }

    /** 4. 默认：无标签且未命中规则的纯文本 → story_secondary */
    reasonCodes.push('default_story_secondary');
    return {
        ...block,
        resolvedKind: 'story_secondary',
        includeInPrimaryExtraction: true,
        includeAsHint: true,
        allowActorPromotion: true,
        allowRelationPromotion: true,
        reasonCodes,
    };
}

/**
 * 功能：对一组 ParsedContentBlock 做批量分类。
 * @param blocks 解析后的内容块列表。
 * @param role 消息角色。
 * @returns 分类后的内容块列表。
 */
export function classifyContentBlocks(blocks: ParsedContentBlock[], role: string): ClassifiedContentBlock[] {
    const runtime = getContentClassificationRuntimeSnapshot();
    return blocks.map((block) => classifyContentBlockWithRuntime(block, role, runtime));
}
