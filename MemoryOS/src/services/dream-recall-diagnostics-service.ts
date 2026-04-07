import { DreamSessionRepository } from './dream-session-repository';
import type {
    DreamSessionDiagnosticsRecord,
    DreamSessionGraphSnapshotRecord,
} from './dream-types';

/**
 * 功能：保存梦境召回的诊断与图快照记录。
 */
export class DreamRecallDiagnosticsService {
    private readonly repository: DreamSessionRepository;

    constructor(chatKey: string) {
        this.repository = new DreamSessionRepository(chatKey);
    }

    async saveDiagnostics(record: DreamSessionDiagnosticsRecord | null | undefined): Promise<void> {
        if (!record) {
            return;
        }
        await this.repository.saveDreamDiagnostics(record);
    }

    async saveGraphSnapshot(record: DreamSessionGraphSnapshotRecord | null | undefined): Promise<void> {
        if (!record) {
            return;
        }
        await this.repository.saveDreamGraphSnapshot(record);
    }
}
