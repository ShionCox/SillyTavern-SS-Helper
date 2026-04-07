export interface EventEnvelope<T = unknown> {
    id: string;
    ts: number;
    chatKey: string;
    source?: {
        pluginId?: string;
        version?: string;
    };
    type: string;
    payload: T;
}

export interface SourceRef {
    kind: 'semantic_seed' | 'group_memory' | 'summary' | 'manual' | 'derived';
    label: string;
    recordId?: string;
    path?: string;
    note?: string;
    ts?: number;
}

export interface PluginManifest {
    pluginId: string;
    name: string;
    displayName: string;
    version: string;
    capabilities?: {
        events?: string[];
        memory?: string[];
        llm?: string[];
    };
    scopes?: string[];
    requiresSDK?: string;
    source?: string;
    declaredAt?: number;
}

export interface RegistryChangeEvent {
    pluginId: string;
    action: 'register' | 'unregister' | 'update';
    manifest?: PluginManifest;
    degraded?: boolean;
    reason?: string;
    ts: number;
}

export interface STXRegistry {
    register: (manifest: PluginManifest) => void;
    unregister?: (pluginId: string) => void;
    list: () => PluginManifest[];
    get: (pluginId: string) => PluginManifest | null;
}

export interface STXBus {
    emit: <T>(type: string, payload: T, opts?: { chatKey?: string }) => void;
    on: <T>(type: string, handler: (evt: EventEnvelope<T>) => void) => () => void;
    once: <T>(type: string, handler: (evt: EventEnvelope<T>) => void) => () => void;
    off: (type: string, handler: Function) => void;
}

declare global {
    interface Window {
        toastr?: Record<string, (...args: unknown[]) => unknown>;
    }
}
