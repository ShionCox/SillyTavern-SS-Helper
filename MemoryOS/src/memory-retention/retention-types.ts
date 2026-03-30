/**
 * 功能：定义记忆遗忘阶段。
 */
export type RetentionStage = 'clear' | 'blur' | 'distorted';

/**
 * 功能：定义记忆保留状态。
 */
export interface RetentionState {
    stage: RetentionStage;
    score: number;
    forgetProbability: number;
    rehearsalCount: number;
    reasonCodes: string[];
    distortionTemplateId?: string;
}

