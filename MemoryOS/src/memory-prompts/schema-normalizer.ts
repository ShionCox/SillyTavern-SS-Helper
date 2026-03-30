/**
 * 功能：按 Prompt Pack section 名称将宽松 schema 规整为严格兼容的结构。
 * @param sectionName 当前 schema 对应的 section 名称。
 * @param schema 原始 schema。
 * @returns 规整后的 schema；无法识别时返回原始 schema。
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
        default:
            return schema;
    }
}

/**
 * 功能：构建严格兼容的字符串数组 schema。
 * @returns 字符串数组 schema。
 */
function buildStringArraySchema(): Record<string, unknown> {
    return {
        type: 'array',
        items: { type: 'string' },
    };
}

/**
 * 功能：构建严格兼容的绑定关系 schema。
 * @returns 绑定关系 schema。
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
 * 功能：构建严格兼容的实体字段 schema。
 * @returns 实体字段 schema。
 */
function buildEntityFieldsSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: [
            'subtype',
            'leader',
            'baseCity',
            'nation',
            'city',
            'organization',
            'status',
            'orgType',
            'locationType',
            'parentLocation',
            'parentOrganization',
            'capital',
            'headquarters',
        ],
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
        },
    };
}

/**
 * 功能：构建严格兼容的实体变更 payload schema。
 * @returns 实体变更 payload schema。
 */
function buildEntityPayloadSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: [
            'summary',
            'subtype',
            'leader',
            'baseCity',
            'nation',
            'city',
            'organization',
            'status',
            'orgType',
            'locationType',
            'parentLocation',
            'parentOrganization',
            'capital',
            'headquarters',
        ],
        additionalProperties: false,
        properties: {
            summary: { type: 'string' },
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
        },
    };
}

/**
 * 功能：构建严格兼容的角色卡数组 schema。
 * @returns 角色卡数组 schema。
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
 * 功能：构建严格兼容的关系卡数组 schema。
 * @returns 关系卡数组 schema。
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
                relationTag: {
                    type: 'string',
                    enum: ['亲人', '朋友', '盟友', '恋人', '暧昧', '师徒', '上下级', '竞争者', '情敌', '宿敌', '陌生人'],
                },
                state: { type: 'string' },
                summary: { type: 'string' },
                trust: { type: 'number' },
                affection: { type: 'number' },
                tension: { type: 'number' },
            },
        },
    };
}

/**
 * 功能：构建严格兼容的记忆记录数组 schema。
 * @returns 记忆记录数组 schema。
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
                importance: { type: 'number' },
            },
        },
    };
}

/**
 * 功能：构建严格兼容的世界基础规则数组 schema。
 * @returns 世界基础规则数组 schema。
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
 * 功能：构建严格兼容的稳定事实数组 schema。
 * @returns 稳定事实数组 schema。
 */
function buildStableFactArraySchema(): Record<string, unknown> {
    return {
        type: 'array',
        items: {
            type: 'object',
            required: ['type', 'subject', 'predicate', 'value', 'confidence'],
            additionalProperties: false,
            properties: {
                type: { type: 'string' },
                subject: { type: 'string' },
                predicate: { type: 'string' },
                value: { type: 'string' },
                confidence: { type: 'number' },
                title: { type: 'string' },
                summary: { type: 'string' },
                compareKey: { type: 'string' },
                bindings: buildBindingsSchema(),
                status: { type: 'string' },
                importance: { type: 'number' },
                reasonCodes: buildStringArraySchema(),
            },
        },
    };
}

/**
 * 功能：构建严格兼容的身份卡 schema。
 * @returns 身份卡 schema。
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
 * 功能：构建严格兼容的实体卡集合 schema。
 * @returns 实体卡集合 schema。
 */
function buildEntityCardCollectionSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['organizations', 'cities', 'nations', 'locations'],
        additionalProperties: false,
        properties: {
            organizations: buildEntityCardArraySchema(),
            cities: buildEntityCardArraySchema(),
            nations: buildEntityCardArraySchema(),
            locations: buildEntityCardArraySchema(),
        },
    };
}

/**
 * 功能：构建严格兼容的实体卡数组 schema。
 * @returns 实体卡数组 schema。
 */
function buildEntityCardArraySchema(): Record<string, unknown> {
    return {
        type: 'array',
        items: {
            type: 'object',
            required: ['entityType', 'compareKey', 'title', 'aliases', 'summary', 'fields'],
            additionalProperties: false,
            properties: {
                entityType: { type: 'string' },
                compareKey: { type: 'string' },
                title: { type: 'string' },
                aliases: buildStringArraySchema(),
                summary: { type: 'string' },
                fields: buildEntityFieldsSchema(),
            },
        },
    };
}

/**
 * 功能：构建严格兼容的冷启动完整 schema。
 * @returns 冷启动完整 schema。
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
                    confidence: { type: 'number' },
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
 * 功能：构建严格兼容的冷启动状态阶段 schema。
 * @returns 冷启动状态阶段 schema。
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
 * 功能：构建严格兼容的 summary planner schema。
 * @returns summary planner schema。
 */
function buildSummaryPlannerSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['should_update', 'focus_types', 'entities', 'topics', 'reasons'],
        additionalProperties: false,
        properties: {
            should_update: { type: 'boolean' },
            focus_types: buildStringArraySchema(),
            entities: buildStringArraySchema(),
            topics: buildStringArraySchema(),
            reasons: buildStringArraySchema(),
        },
    };
}

/**
 * 功能：构建严格兼容的 summary action fields schema。
 * @returns summary action fields schema。
 */
function buildSummaryActionFieldsSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: [
            'objective',
            'status',
            'goal',
            'relationTag',
            'city',
            'organization',
            'location',
            'nation',
            'leader',
            'baseCity',
            'subtype',
            'orgType',
            'locationType',
            'parentLocation',
            'parentOrganization',
            'capital',
            'headquarters',
            'state',
            'summary',
            'trust',
            'affection',
            'tension',
        ],
        additionalProperties: false,
        properties: {
            objective: { type: 'string' },
            status: { type: 'string' },
            goal: { type: 'string' },
            relationTag: { type: 'string' },
            city: { type: 'string' },
            organization: { type: 'string' },
            location: { type: 'string' },
            nation: { type: 'string' },
            leader: { type: 'string' },
            baseCity: { type: 'string' },
            subtype: { type: 'string' },
            orgType: { type: 'string' },
            locationType: { type: 'string' },
            parentLocation: { type: 'string' },
            parentOrganization: { type: 'string' },
            capital: { type: 'string' },
            headquarters: { type: 'string' },
            state: { type: 'string' },
            summary: { type: 'string' },
            trust: { type: 'number' },
            affection: { type: 'number' },
            tension: { type: 'number' },
        },
    };
}

/**
 * 功能：构建严格兼容的 summary action payload schema。
 * @returns summary action payload schema。
 */
function buildSummaryActionPayloadSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['title', 'summary', 'detail', 'state', 'goal', 'status', 'compareKey', 'bindings', 'fields'],
        additionalProperties: false,
        properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            detail: { type: 'string' },
            state: { type: 'string' },
            goal: { type: 'string' },
            status: { type: 'string' },
            compareKey: { type: 'string' },
            bindings: buildBindingsSchema(),
            fields: buildSummaryActionFieldsSchema(),
        },
    };
}

/**
 * 功能：构建严格兼容的 summary mutation schema。
 * @returns summary mutation schema。
 */
function buildSummaryMutationSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['schemaVersion', 'window', 'actions'],
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
                    required: ['action', 'targetKind', 'candidateId', 'compareKey', 'payload', 'reasonCodes'],
                    additionalProperties: false,
                    properties: {
                        action: { type: 'string' },
                        targetKind: { type: 'string' },
                        candidateId: { type: 'string' },
                        compareKey: { type: 'string' },
                        payload: buildSummaryActionPayloadSchema(),
                        reasonCodes: buildStringArraySchema(),
                    },
                },
            },
        },
    };
}

/**
 * 功能：构建严格兼容的旧聊天基线 schema。
 * @returns 旧聊天基线 schema。
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
 * 功能：构建严格兼容的旧聊天活跃快照 schema。
 * @returns 旧聊天活跃快照 schema。
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
 * 功能：构建严格兼容的旧聊天批处理 schema。
 * @returns 旧聊天批处理 schema。
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
            entityCards: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['entityType', 'compareKey', 'title', 'aliases', 'summary', 'fields', 'confidence', 'bindings', 'reasonCodes'],
                    additionalProperties: false,
                    properties: {
                        entityType: { type: 'string', enum: ['organization', 'city', 'nation', 'location'] },
                        compareKey: { type: 'string' },
                        title: { type: 'string' },
                        aliases: buildStringArraySchema(),
                        summary: { type: 'string' },
                        fields: buildEntityFieldsSchema(),
                        confidence: { type: 'number' },
                        bindings: buildBindingsSchema(),
                        reasonCodes: buildStringArraySchema(),
                    },
                },
            },
            entityTransitions: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['entityType', 'compareKey', 'title', 'action', 'reason', 'payload', 'bindings', 'reasonCodes'],
                    additionalProperties: false,
                    properties: {
                        entityType: { type: 'string', enum: ['organization', 'city', 'nation', 'location'] },
                        compareKey: { type: 'string' },
                        title: { type: 'string' },
                        action: { type: 'string', enum: ['ADD', 'UPDATE', 'MERGE', 'INVALIDATE', 'DELETE'] },
                        reason: { type: 'string' },
                        payload: buildEntityPayloadSchema(),
                        bindings: buildBindingsSchema(),
                        reasonCodes: buildStringArraySchema(),
                    },
                },
            },
            stableFacts: buildStableFactArraySchema(),
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
                    required: ['task', 'from', 'to', 'title', 'summary', 'description', 'goal', 'status', 'compareKey', 'bindings', 'reasonCodes'],
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
                        compareKey: { type: 'string' },
                        bindings: buildBindingsSchema(),
                        reasonCodes: buildStringArraySchema(),
                    },
                },
            },
            worldStateChanges: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['key', 'value', 'summary', 'compareKey', 'reasonCodes'],
                    additionalProperties: false,
                    properties: {
                        key: { type: 'string' },
                        value: { type: 'string' },
                        summary: { type: 'string' },
                        compareKey: { type: 'string' },
                        reasonCodes: buildStringArraySchema(),
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
 * 功能：构建严格兼容的旧聊天冲突裁决 schema。
 * @returns 旧聊天冲突裁决 schema。
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
                            additionalProperties: false,
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
