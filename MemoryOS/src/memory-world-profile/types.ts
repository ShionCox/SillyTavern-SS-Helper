/**
 * 功能：定义世界模板能力标记。
 */
export interface WorldProfileCapabilities {
    hasMagic: boolean;
    hasCultivation: boolean;
    hasFantasyRace: boolean;
    hasModernTechnology: boolean;
    hasFormalPoliticalOrder: boolean;
    hasSupernatural: boolean;
}

/**
 * 功能：定义世界模板总结偏置。
 */
export interface WorldProfileSummaryBias {
    boostedTypes: string[];
    suppressedTypes: string[];
}

/**
 * 功能：定义世界模板。
 */
export interface WorldProfileDefinition {
    worldProfileId: string;
    displayName: string;
    genre: string;
    subGenres: string[];
    capabilities: WorldProfileCapabilities;
    preferredSchemas: string[];
    preferredFacets: string[];
    schemaFieldExtensions: Record<string, string[]>;
    summaryBias: WorldProfileSummaryBias;
    injectionStyle: string;
    detectionKeywords: string[];
    styleHintKeywords?: string[];
}

/**
 * 功能：定义世界模板识别结果。
 */
export interface WorldProfileDetectionResult {
    primaryProfile: string;
    secondaryProfiles: string[];
    confidence: number;
    reasonCodes: string[];
}

/**
 * 功能：定义世界模板运行时解析结果。
 */
export interface ResolvedWorldProfile {
    primary: WorldProfileDefinition;
    secondary: WorldProfileDefinition[];
    mergedCapabilities: WorldProfileCapabilities;
    mergedPreferredSchemas: string[];
    mergedPreferredFacets: string[];
    mergedFieldExtensions: Record<string, string[]>;
    mergedSummaryBias: WorldProfileSummaryBias;
}
