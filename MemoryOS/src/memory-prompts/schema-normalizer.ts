/**
 * 功能：按 Prompt Pack 分段名称，把宽松 schema 归一化为当前 MemoryOS 使用的严格结构。
 * @param sectionName 分段名称。
 * @param schema 原始 schema。
 * @returns 归一化后的 schema。
 */
export function normalizeMemoryPromptSchema(sectionName: string, schema: unknown): unknown {
    switch (String(sectionName ?? '').trim()) {
        case 'COLD_START_SCHEMA':
        case 'COLD_START_CORE_SCHEMA':
            return buildColdStartSchema();
        case 'COLD_START_STATE_SCHEMA':
            return buildColdStartStateSchema();
        case 'SUMMARY_PLANNER_SCHEMA':
            return buildSummaryPlannerSchema();
        case 'SUMMARY_SCHEMA':
            return buildSummaryMutationSchema();
        case 'TAKEOVER_BASELINE_SCHEMA':
            return buildTakeoverBaselineSchema();
        case 'TAKEOVER_ACTIVE_SCHEMA':
            return buildTakeoverActiveSchema();
        case 'TAKEOVER_BATCH_SCHEMA':
            return buildTakeoverBatchSchema();
        case 'TAKEOVER_CONFLICT_RESOLUTION_SCHEMA':
            return buildTakeoverConflictResolutionSchema();
        case 'TAKEOVER_CONFLICT_RESOLUTION_BATCH_SCHEMA':
            return buildTakeoverConflictResolutionBatchSchema();
        default:
            return schema;
    }
}

/**
 * 功能：构建字符串数组 schema。
 * @returns schema。
 */
function buildStringArraySchema(): Record<string, unknown> {
    return {
        type: 'array',
        items: { type: 'string' },
    };
}

/**
 * 功能：构建数字数组 schema。
 * @returns schema。
 */
function buildNumberSchema(): Record<string, unknown> {
    return { type: 'number' };
}

/**
 * 功能：构建统一的 compareKey 协议字段 schema。
 * @returns schema。
 */
function buildProtocolKeySchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: [],
        additionalProperties: false,
        properties: {
            entityKey: { type: 'string' },
            compareKey: { type: 'string' },
            matchKeys: buildStringArraySchema(),
            schemaVersion: { type: 'string' },
            canonicalName: { type: 'string' },
            legacyCompareKeys: buildStringArraySchema(),
        },
    };
}

/**
 * 功能：构建完整绑定 schema。
 * @returns schema。
 */
function buildBindingsSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['actors', 'organizations', 'cities', 'locations', 'nations', 'tasks', 'events'],
        additionalProperties: false,
        properties: {
            actors: buildStringArraySchema(),
            organizations: buildStringArraySchema(),
            cities: buildStringArraySchema(),
            locations: buildStringArraySchema(),
            nations: buildStringArraySchema(),
            tasks: buildStringArraySchema(),
            events: buildStringArraySchema(),
        },
    };
}

/**
 * 功能：构建稀疏 patch 用绑定 schema。
 * @returns schema。
 */
function buildSparseBindingsSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: [],
        additionalProperties: false,
        properties: {
            actors: buildStringArraySchema(),
            organizations: buildStringArraySchema(),
            cities: buildStringArraySchema(),
            locations: buildStringArraySchema(),
            nations: buildStringArraySchema(),
            tasks: buildStringArraySchema(),
            events: buildStringArraySchema(),
        },
    };
}

/**
 * 功能：构建实体字段 schema。
 * @returns schema。
 */
function buildEntityFieldsSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: [],
        additionalProperties: false,
        properties: {
            subtype: { type: 'string' },
            leader: { type: 'string' },
            baseCity: { type: 'string' },
            nation: { type: 'string' },
            city: { type: 'string' },
            organization: { type: 'string' },
            status: { type: 'string' },
            orgType: { type: 'string' },
            locationType: { type: 'string' },
            parentLocation: { type: 'string' },
            parentOrganization: { type: 'string' },
            capital: { type: 'string' },
            headquarters: { type: 'string' },
            scope: { type: 'string' },
            state: { type: 'string' },
            region: { type: 'string' },
        },
    };
}

/**
 * 功能：构建角色卡数组 schema。
 * @returns schema。
 */
function buildActorCardArraySchema(): Record<string, unknown> {
    return {
        type: 'array',
        items: {
            type: 'object',
            required: ['actorKey', 'displayName', 'aliases', 'identityFacts', 'originFacts', 'traits'],
            additionalProperties: false,
            properties: {
                actorKey: { type: 'string' },
                displayName: { type: 'string' },
                aliases: buildStringArraySchema(),
                identityFacts: buildStringArraySchema(),
                originFacts: buildStringArraySchema(),
                traits: buildStringArraySchema(),
            },
        },
    };
}

/**
 * 功能：构建关系卡数组 schema。
 * @returns schema。
 */
function buildRelationshipArraySchema(): Record<string, unknown> {
    return {
        type: 'array',
        items: {
            type: 'object',
            required: [
                'sourceActorKey',
                'targetActorKey',
                'participants',
                'relationTag',
                'state',
                'summary',
                'trust',
                'affection',
                'tension',
            ],
            additionalProperties: false,
            properties: {
                sourceActorKey: { type: 'string' },
                targetActorKey: { type: 'string' },
                participants: buildStringArraySchema(),
                relationTag: { type: 'string' },
                state: { type: 'string' },
                summary: { type: 'string' },
                trust: buildNumberSchema(),
                affection: buildNumberSchema(),
                tension: buildNumberSchema(),
            },
        },
    };
}

/**
 * 功能：构建记忆记录数组 schema。
 * @returns schema。
 */
function buildMemoryRecordArraySchema(): Record<string, unknown> {
    return {
        type: 'array',
        items: {
            type: 'object',
            required: ['schemaId', 'title', 'summary', 'importance'],
            additionalProperties: false,
            properties: {
                schemaId: { type: 'string' },
                title: { type: 'string' },
                summary: { type: 'string' },
                importance: buildNumberSchema(),
            },
        },
    };
}

/**
 * 功能：构建世界基础规则数组 schema。
 * @returns schema。
 */
function buildWorldBaseArraySchema(): Record<string, unknown> {
    return {
        type: 'array',
        items: {
            type: 'object',
            required: ['schemaId', 'title', 'summary', 'scope'],
            additionalProperties: false,
            properties: {
                schemaId: { type: 'string' },
                title: { type: 'string' },
                summary: { type: 'string' },
                scope: { type: 'string' },
            },
        },
    };
}

/**
 * 功能：构建身份 schema。
 * @returns schema。
 */
function buildIdentitySchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['actorKey', 'displayName', 'aliases', 'identityFacts', 'originFacts', 'traits'],
        additionalProperties: false,
        properties: {
            actorKey: { type: 'string' },
            displayName: { type: 'string' },
            aliases: buildStringArraySchema(),
            identityFacts: buildStringArraySchema(),
            originFacts: buildStringArraySchema(),
            traits: buildStringArraySchema(),
        },
    };
}

/**
 * 功能：构建实体卡 schema。
 * @returns schema。
 */
function buildEntityCardSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['entityType', 'title', 'aliases', 'summary', 'fields'],
        additionalProperties: false,
        properties: {
            entityType: { type: 'string' },
            title: { type: 'string' },
            aliases: buildStringArraySchema(),
            summary: { type: 'string' },
            fields: buildEntityFieldsSchema(),
            confidence: buildNumberSchema(),
            bindings: buildBindingsSchema(),
            reasonCodes: buildStringArraySchema(),
            ...buildProtocolKeySchema().properties as Record<string, unknown>,
        },
    };
}

/**
 * 功能：构建实体卡集合 schema。
 * @returns schema。
 */
function buildEntityCardCollectionSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['organizations', 'cities', 'nations', 'locations'],
        additionalProperties: false,
        properties: {
            organizations: { type: 'array', items: buildEntityCardSchema() },
            cities: { type: 'array', items: buildEntityCardSchema() },
            nations: { type: 'array', items: buildEntityCardSchema() },
            locations: { type: 'array', items: buildEntityCardSchema() },
        },
    };
}

/**
 * 功能：构建冷启动 schema。
 * @returns schema。
 */
function buildColdStartSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['schemaVersion', 'identity', 'actorCards', 'entityCards', 'worldProfileDetection', 'worldBase', 'relationships', 'memoryRecords'],
        additionalProperties: false,
        properties: {
            schemaVersion: { type: 'string' },
            identity: buildIdentitySchema(),
            actorCards: buildActorCardArraySchema(),
            entityCards: buildEntityCardCollectionSchema(),
            worldProfileDetection: {
                type: 'object',
                required: ['primaryProfile', 'secondaryProfiles', 'confidence', 'reasonCodes'],
                additionalProperties: false,
                properties: {
                    primaryProfile: { type: 'string' },
                    secondaryProfiles: buildStringArraySchema(),
                    confidence: buildNumberSchema(),
                    reasonCodes: buildStringArraySchema(),
                },
            },
            worldBase: buildWorldBaseArraySchema(),
            relationships: buildRelationshipArraySchema(),
            memoryRecords: buildMemoryRecordArraySchema(),
        },
    };
}

/**
 * 功能：构建冷启动状态 schema。
 * @returns schema。
 */
function buildColdStartStateSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['schemaVersion', 'identity', 'actorCards', 'entityCards', 'worldBase', 'relationships', 'memoryRecords'],
        additionalProperties: false,
        properties: {
            schemaVersion: { type: 'string' },
            identity: buildIdentitySchema(),
            actorCards: buildActorCardArraySchema(),
            entityCards: buildEntityCardCollectionSchema(),
            worldBase: buildWorldBaseArraySchema(),
            relationships: buildRelationshipArraySchema(),
            memoryRecords: buildMemoryRecordArraySchema(),
        },
    };
}

/**
 * 功能：构建 summary planner schema。
 * @returns schema。
 */
function buildSummaryPlannerSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['should_update', 'focus_types', 'entities', 'topics', 'reasons', 'memory_value', 'suggested_operation_bias', 'skip_reason'],
        additionalProperties: false,
        properties: {
            should_update: { type: 'boolean' },
            focus_types: buildStringArraySchema(),
            entities: buildStringArraySchema(),
            topics: buildStringArraySchema(),
            reasons: buildStringArraySchema(),
            memory_value: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
            suggested_operation_bias: {
                type: 'array',
                items: { type: 'string', enum: ['ADD', 'UPDATE', 'MERGE', 'INVALIDATE', 'DELETE', 'NOOP'] },
            },
            skip_reason: { type: 'string' },
        },
    };
}

/**
 * 功能：构建 summary fields schema。
 * @returns schema。
 */
function buildSummaryActionFieldsSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: [],
        additionalProperties: true,
        properties: {
            objective: { type: 'string' },
            status: { type: 'string' },
            goal: { type: 'string' },
            relationTag: { type: 'string' },
            state: { type: 'string' },
            trust: buildNumberSchema(),
            affection: buildNumberSchema(),
            tension: buildNumberSchema(),
        },
    };
}

/**
 * 功能：构建 summary action payload schema。
 * @returns schema。
 */
function buildSummaryActionPayloadSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: [],
        additionalProperties: false,
        properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            detail: { type: 'string' },
            state: { type: 'string' },
            goal: { type: 'string' },
            status: { type: 'string' },
            bindings: buildSparseBindingsSchema(),
            fields: buildSummaryActionFieldsSchema(),
            ...buildProtocolKeySchema().properties as Record<string, unknown>,
        },
    };
}

/**
 * 功能：构建 summary mutation schema。
 * @returns schema。
 */
function buildSummaryMutationSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['schemaVersion', 'window', 'actions', 'diagnostics'],
        additionalProperties: false,
        properties: {
            schemaVersion: { type: 'string' },
            window: {
                type: 'object',
                required: ['fromTurn', 'toTurn'],
                additionalProperties: false,
                properties: {
                    fromTurn: { type: 'integer' },
                    toTurn: { type: 'integer' },
                },
            },
            actions: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['action', 'targetKind', 'reasonCodes'],
                    additionalProperties: false,
                    properties: {
                        action: { type: 'string', enum: ['ADD', 'MERGE', 'UPDATE', 'INVALIDATE', 'DELETE', 'NOOP'] },
                        targetKind: { type: 'string' },
                        type: { type: 'string' },
                        title: { type: 'string' },
                        reason: { type: 'string' },
                        confidence: buildNumberSchema(),
                        memoryValue: { type: 'string', enum: ['low', 'medium', 'high'] },
                        sourceEvidence: {
                            type: 'object',
                            required: [],
                            additionalProperties: false,
                            properties: {
                                type: { type: 'string' },
                                brief: { type: 'string' },
                                turnRefs: { type: 'array', items: { type: 'number' } },
                            },
                        },
                        targetId: { type: 'string' },
                        sourceIds: buildStringArraySchema(),
                        candidateId: { type: 'string' },
                        reasonCodes: buildStringArraySchema(),
                        timeContext: {
                            type: 'object',
                            required: [],
                            additionalProperties: false,
                            properties: {
                                mode: { type: 'string', enum: ['story_explicit', 'story_inferred', 'sequence_fallback'] },
                                storyTime: { type: 'string' },
                                confidence: buildNumberSchema(),
                            },
                        },
                        sourceContext: {
                            type: 'object',
                            required: [],
                            additionalProperties: true,
                            properties: {},
                        },
                        payload: buildSummaryActionPayloadSchema(),
                        patch: buildSummaryActionPayloadSchema(),
                        newRecord: buildSummaryActionPayloadSchema(),
                        ...buildProtocolKeySchema().properties as Record<string, unknown>,
                    },
                },
            },
            diagnostics: {
                type: 'object',
                required: [],
                additionalProperties: false,
                properties: {
                    skippedCount: { type: 'number' },
                    noopReasons: buildStringArraySchema(),
                    possibleDuplicates: buildStringArraySchema(),
                    sourceWarnings: buildStringArraySchema(),
                },
            },
        },
    };
}

/**
 * 功能：构建 takeover baseline schema。
 * @returns schema。
 */
function buildTakeoverBaselineSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['staticBaseline', 'personaBaseline', 'worldBaseline', 'ruleBaseline', 'sourceSummary', 'generatedAt'],
        additionalProperties: false,
        properties: {
            staticBaseline: { type: 'string' },
            personaBaseline: { type: 'string' },
            worldBaseline: { type: 'string' },
            ruleBaseline: { type: 'string' },
            sourceSummary: { type: 'string' },
            generatedAt: { type: 'number' },
        },
    };
}

/**
 * 功能：构建 takeover active schema。
 * @returns schema。
 */
function buildTakeoverActiveSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['generatedAt', 'currentScene', 'currentLocation', 'currentTimeHint', 'activeGoals', 'activeRelations', 'openThreads', 'recentDigest'],
        additionalProperties: false,
        properties: {
            generatedAt: { type: 'number' },
            currentScene: { type: 'string' },
            currentLocation: { type: 'string' },
            currentTimeHint: { type: 'string' },
            activeGoals: buildStringArraySchema(),
            activeRelations: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['target', 'state'],
                    additionalProperties: false,
                    properties: {
                        target: { type: 'string' },
                        state: { type: 'string' },
                    },
                },
            },
            openThreads: buildStringArraySchema(),
            recentDigest: { type: 'string' },
        },
    };
}

/**
 * 功能：构建 takeover 稳定事实 schema。
 * @returns schema。
 */
function buildStableFactSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['type', 'subject', 'predicate', 'value', 'confidence'],
        additionalProperties: false,
        properties: {
            type: { type: 'string' },
            subject: { type: 'string' },
            predicate: { type: 'string' },
            value: { type: 'string' },
            confidence: buildNumberSchema(),
            title: { type: 'string' },
            summary: { type: 'string' },
            bindings: buildBindingsSchema(),
            status: { type: 'string' },
            importance: buildNumberSchema(),
            reasonCodes: buildStringArraySchema(),
            ...buildProtocolKeySchema().properties as Record<string, unknown>,
        },
    };
}

/**
 * 功能：构建 takeover 批处理 schema。
 * @returns schema。
 */
function buildTakeoverBatchSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['batchId', 'summary', 'actorCards', 'relationships', 'entityCards', 'entityTransitions', 'stableFacts', 'relationTransitions', 'taskTransitions', 'worldStateChanges', 'openThreads', 'chapterTags', 'sourceRange'],
        additionalProperties: false,
        properties: {
            batchId: { type: 'string' },
            summary: { type: 'string' },
            actorCards: buildActorCardArraySchema(),
            relationships: buildRelationshipArraySchema(),
            entityCards: { type: 'array', items: buildEntityCardSchema() },
            entityTransitions: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['entityType', 'title', 'action', 'reason'],
                    additionalProperties: false,
                    properties: {
                        entityType: { type: 'string', enum: ['organization', 'city', 'nation', 'location'] },
                        title: { type: 'string' },
                        action: { type: 'string', enum: ['ADD', 'UPDATE', 'MERGE', 'INVALIDATE', 'DELETE'] },
                        reason: { type: 'string' },
                        payload: {
                            type: 'object',
                            required: [],
                            additionalProperties: true,
                            properties: {},
                        },
                        bindings: buildBindingsSchema(),
                        reasonCodes: buildStringArraySchema(),
                        ...buildProtocolKeySchema().properties as Record<string, unknown>,
                    },
                },
            },
            stableFacts: { type: 'array', items: buildStableFactSchema() },
            relationTransitions: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['target', 'from', 'to', 'reason', 'relationTag', 'targetType', 'bindings', 'reasonCodes'],
                    additionalProperties: false,
                    properties: {
                        target: { type: 'string' },
                        from: { type: 'string' },
                        to: { type: 'string' },
                        reason: { type: 'string' },
                        relationTag: { type: 'string' },
                        targetType: { type: 'string', enum: ['actor', 'organization', 'city', 'nation', 'location', 'unknown'] },
                        bindings: buildBindingsSchema(),
                        reasonCodes: buildStringArraySchema(),
                    },
                },
            },
            taskTransitions: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['task', 'from', 'to', 'title', 'summary', 'description', 'goal', 'status'],
                    additionalProperties: false,
                    properties: {
                        task: { type: 'string' },
                        from: { type: 'string' },
                        to: { type: 'string' },
                        title: { type: 'string' },
                        summary: { type: 'string' },
                        description: { type: 'string' },
                        goal: { type: 'string' },
                        status: { type: 'string' },
                        bindings: buildBindingsSchema(),
                        reasonCodes: buildStringArraySchema(),
                        ...buildProtocolKeySchema().properties as Record<string, unknown>,
                    },
                },
            },
            worldStateChanges: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['key', 'value', 'summary'],
                    additionalProperties: false,
                    properties: {
                        key: { type: 'string' },
                        value: { type: 'string' },
                        summary: { type: 'string' },
                        bindings: buildBindingsSchema(),
                        reasonCodes: buildStringArraySchema(),
                        ...buildProtocolKeySchema().properties as Record<string, unknown>,
                    },
                },
            },
            openThreads: buildStringArraySchema(),
            chapterTags: buildStringArraySchema(),
            sourceRange: {
                type: 'object',
                required: ['startFloor', 'endFloor'],
                additionalProperties: false,
                properties: {
                    startFloor: { type: 'integer' },
                    endFloor: { type: 'integer' },
                },
            },
        },
    };
}

/**
 * 功能：构建 takeover 冲突裁决 schema。
 * @returns schema。
 */
function buildTakeoverConflictResolutionSchema(): Record<string, unknown> {
    return {
        type: 'object',
        additionalProperties: false,
        required: ['bucketId', 'domain', 'resolutions'],
        properties: {
            bucketId: { type: 'string' },
            domain: { type: 'string' },
            resolutions: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['action', 'primaryKey', 'secondaryKeys', 'fieldOverrides', 'reasonCodes'],
                    properties: {
                        action: { type: 'string', enum: ['merge', 'keep_primary', 'replace', 'invalidate', 'split'] },
                        primaryKey: { type: 'string' },
                        secondaryKeys: buildStringArraySchema(),
                        fieldOverrides: {
                            type: 'object',
                            additionalProperties: true,
                            required: [],
                            properties: {},
                        },
                        reasonCodes: buildStringArraySchema(),
                    },
                },
            },
        },
    };
}

/**
 * 功能：构建批量冲突裁决 schema。
 * @returns schema
 */
function buildTakeoverConflictResolutionBatchSchema(): Record<string, unknown> {
    return {
        type: 'object',
        additionalProperties: false,
        required: ['patches'],
        properties: {
            patches: {
                type: 'array',
                items: buildTakeoverConflictResolutionSchema(),
            },
        },
    };
}
