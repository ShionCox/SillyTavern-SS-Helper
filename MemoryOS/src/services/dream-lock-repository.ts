import { DreamSessionRepository } from './dream-session-repository';
import type { DreamLockRecord } from './dream-lock-types';
import { buildDreamLockKey } from './dream-lock-types';

/**
 * 功能：封装 dream 持久锁记录读写，避免调度层直接关心底层 collection。
 */
export class DreamLockRepository {
    private readonly chatKey: string;
    private readonly repository: DreamSessionRepository;

    constructor(chatKey: string) {
        this.chatKey = String(chatKey ?? '').trim();
        this.repository = new DreamSessionRepository(this.chatKey);
    }

    async getDreamLockState(): Promise<DreamLockRecord | null> {
        return this.repository.getDreamLockState(buildDreamLockKey(this.chatKey));
    }

    async saveDreamLockState(record: DreamLockRecord): Promise<void> {
        await this.repository.saveDreamLockState(record);
    }

    async deleteDreamLockState(): Promise<void> {
        await this.repository.deleteDreamLockState(buildDreamLockKey(this.chatKey));
    }
}
