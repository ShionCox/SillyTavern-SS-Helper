import { readMemoryOSSettings, type MemoryOSSettings } from '../settings/store';
import type {
    DreamSessionDiagnosticsRecord,
    DreamRecallCandidate,
    DreamSessionGraphSnapshotRecord,
    DreamSessionMetaRecord,
    DreamSessionRecallRecord,
} from './dream-types';
import type { ResolvedDreamExecutionPlan } from './dream-execution-mode';
import { DreamPromptDTOService, type DreamPromptDTOBuildResult } from './dream-prompt-dto-service';
import systemBaseText from '../memory-prompts/dream/system.base.md?raw';
import styleReflectiveText from '../memory-prompts/dream/style.reflective.md?raw';
import styleAnalyticText from '../memory-prompts/dream/style.analytic.md?raw';
import styleSymbolicText from '../memory-prompts/dream/style.symbolic.md?raw';
import safetyRulesText from '../memory-prompts/dream/safety.rules.md?raw';
import outputSchemaText from '../memory-prompts/dream/output.schema.md?raw';
import promptPackText from '../memory-prompts/prompt-pack.md?raw';

export const DREAM_PROMPT_VERSION = 'v1.0.0';
export const DREAM_PROMPT_SCHEMA_VERSION = 'dream-output.v1';

export interface DreamPromptInfo {
    promptVersion: string;
    stylePreset: string;
    schemaVersion: string;
}

export interface DreamPromptBuildContext {
    dto: DreamPromptDTOBuildResult['dto'];
    entryRefToEntryId: Map<string, string>;
    nodeRefToNodeKey: Map<string, string>;
    relationshipRefToRelationshipKey: Map<string, string>;
    candidateByEntryRef: Map<string, DreamRecallCandidate>;
}

export class DreamPromptService {
    private readonly dtoService = new DreamPromptDTOService();

    buildDreamPrompt(input: {
        meta: DreamSessionMetaRecord;
        recall: DreamSessionRecallRecord;
        diagnostics?: DreamSessionDiagnosticsRecord | null;
        graphSnapshot?: DreamSessionGraphSnapshotRecord | null;
        settings?: MemoryOSSettings;
        candidateMap?: Map<string, DreamRecallCandidate>;
        worldStrategyHintText?: string;
        plan?: ResolvedDreamExecutionPlan;
    }): {
        messages: Array<{ role: 'system' | 'user'; content: string }>;
        promptText: string;
        promptInfo: DreamPromptInfo;
        promptContext: DreamPromptBuildContext;
    } {
        const settings = input.settings ?? readMemoryOSSettings();
        const stylePreset = this.resolveStylePreset(settings);
        const promptInfo: DreamPromptInfo = {
            promptVersion: String(settings.dreamPromptVersion ?? '').trim() || DREAM_PROMPT_VERSION,
            stylePreset,
            schemaVersion: DREAM_PROMPT_SCHEMA_VERSION,
        };
        const dtoBuildResult = this.dtoService.build({
            meta: input.meta,
            recall: input.recall,
            diagnostics: input.diagnostics ?? null,
            graphSnapshot: input.graphSnapshot ?? null,
            settings,
            promptInfo,
            candidateMap: input.candidateMap,
            plan: input.plan,
        });
        const systemPrompt = [
            systemBaseText.trim(),
            this.resolveStyleLayer(stylePreset),
            String(input.worldStrategyHintText ?? '').trim(),
            this.extractPromptPackSection('MEMORY_ACTION_POLICY'),
            safetyRulesText.trim(),
            outputSchemaText.trim(),
            this.buildRuntimeRuleText(settings, input.plan),
        ].filter(Boolean).join('\n\n');
        const userPrompt = this.buildUserPrompt({
            dto: dtoBuildResult.dto,
            settings,
            plan: input.plan,
        });
        return {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            promptText: `${systemPrompt}\n\n${userPrompt}`,
            promptInfo,
            promptContext: {
                dto: dtoBuildResult.dto,
                entryRefToEntryId: dtoBuildResult.entryRefToEntryId,
                nodeRefToNodeKey: dtoBuildResult.nodeRefToNodeKey,
                relationshipRefToRelationshipKey: dtoBuildResult.relationshipRefToRelationshipKey,
                candidateByEntryRef: dtoBuildResult.candidateByEntryRef,
            },
        };
    }

    private resolveStylePreset(settings: MemoryOSSettings): string {
        const raw = String(settings.dreamPromptStylePreset ?? settings.dreamStylePreset ?? 'reflective').trim().toLowerCase();
        return raw === 'analytic' || raw === 'symbolic' ? raw : 'reflective';
    }

    private resolveStyleLayer(stylePreset: string): string {
        if (stylePreset === 'analytic') {
            return styleAnalyticText.trim();
        }
        if (stylePreset === 'symbolic') {
            return styleSymbolicText.trim();
        }
        return styleReflectiveText.trim();
    }

    private extractPromptPackSection(sectionName: string): string {
        const marker = new RegExp(`<!--\\s*section:\\s*${sectionName}\\s*-->`, 'u');
        const match = marker.exec(promptPackText);
        if (!match) {
            return '';
        }
        const start = match.index + match[0].length;
        const rest = promptPackText.slice(start);
        const next = rest.search(/<!--\s*section:\s*[A-Z0-9_]+\s*-->/u);
        return rest.slice(0, next >= 0 ? next : undefined).trim();
    }

    private buildRuntimeRuleText(settings: MemoryOSSettings, plan?: ResolvedDreamExecutionPlan): string {
        const runProfile = plan?.runProfile ?? 'manual_deep';
        return [
            '运行时约束：',
            `- promptVersion: ${String(settings.dreamPromptVersion ?? DREAM_PROMPT_VERSION).trim() || DREAM_PROMPT_VERSION}`,
            `- stylePreset: ${String(settings.dreamPromptStylePreset ?? settings.dreamStylePreset ?? 'reflective').trim() || 'reflective'}`,
            `- schemaVersion: ${DREAM_PROMPT_SCHEMA_VERSION}`,
            `- executionMode: ${plan?.executionMode ?? settings.dreamExecutionMode}`,
            `- runProfile: ${runProfile}`,
            `- outputKind: ${plan?.outputKind ?? 'full'}`,
            `- maxHighlights: ${String(plan?.maxHighlights ?? settings.dreamPromptMaxHighlights)}`,
            `- maxMutations: ${String(plan?.maxMutations ?? settings.dreamPromptMaxMutations)}`,
            `- requireExplain: ${settings.dreamPromptRequireExplain ? 'true' : 'false'}`,
            `- strictJson: ${settings.dreamPromptStrictJson ? 'true' : 'false'}`,
            `- weakInferenceOnly: ${settings.dreamPromptWeakInferenceOnly ? 'true' : 'false'}`,
            `- allowNarrativeExpansion: ${settings.dreamPromptAllowNarrativeExpansion ? 'true' : 'false'}`,
            `- allowMutationOutput: ${plan?.allowMutations === false ? 'false' : 'true'}`,
            `- allowHighRiskMutationOutput: ${plan?.allowHighRiskMutationOutput === false ? 'false' : 'true'}`,
            `- maintenanceFirst: ${runProfile === 'auto_light' ? 'true' : 'false'}`,
            runProfile === 'auto_light'
                ? '- autoLightMode: true；这是后台轻梦境，请优先轻整理和维护，不要输出需要人工确认的硬事实写回提案。'
                : runProfile === 'auto_review'
                    ? '- autoReviewMode: true；这是自动生成待审梦境，请控制冗余，只输出值得稍后人工审批的提案。'
                    : '- manualDeepMode: true；这是用户主动触发的深梦境，保留完整 explain、diagnostics 与可审查提案。',
        ].join('\n');
    }

    private buildUserPrompt(input: {
        dto: DreamPromptDTOBuildResult['dto'];
        settings: MemoryOSSettings;
        plan?: ResolvedDreamExecutionPlan;
    }): string {
        const autoLightLines = input.plan?.runProfile === 'auto_light'
            ? [
                '自动轻梦境额外要求：',
                '1. proposedMutations 必须输出空数组，避免堆积待审批硬事实写回。',
                '2. narrative 与 highlights 保持简短，只记录后台整理洞察。',
                '3. 优先为后处理维护提案提供清晰证据，不要扩写设定。',
                '',
            ]
            : [];
        return [
            '请基于以下 Dream Prompt DTO 生成梦境结果。',
            '任务：',
            '1. 生成 narrative。',
            '2. 生成 2 到上限条 highlights。',
            '3. 生成 proposedMutations，只保留高价值、低幻觉风险提案。',
            '4. mutation 与 explain 中只能使用别名引用，不要输出真实内部 ID。',
            '5. explain 必须明确来源 wave、entryRef、nodeRef 与推理链。',
            '6. payload.fieldsJson 与 payload.detailPayloadJson 必须输出合法 JSON 对象字符串；若无内容请输出 {}。',
            '7. 严格结构化模式下，payload 中不适用的字符串填空字符串，数组填空数组，数值填 0，布尔填 false。',
            '',
            ...autoLightLines,
            'Dream Prompt DTO:',
            this.limitText(this.stringifyBlock(input.dto), input.settings.dreamContextMaxChars),
        ].join('\n');
    }

    private stringifyBlock(value: unknown): string {
        return JSON.stringify(value, null, 2);
    }

    private limitText(value: string, maxChars: number): string {
        if (value.length <= maxChars) {
            return value;
        }
        return `${value.slice(0, Math.max(0, maxChars))}\n...<truncated>`;
    }
}
