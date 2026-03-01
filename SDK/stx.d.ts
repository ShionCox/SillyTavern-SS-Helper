export {}; // 确保识别为 module

// -- Event Envelope Wrapper --
export type EventEnvelope<T = any> = {
  id: string;
  ts: number;
  chatKey: string;
  source: { pluginId: string; version: string };
  type: string;
  payload: T;
};

// -- BUS 接口分层 --
export interface STXBus {
  emit<T>(type: string, payload: T, opts?: { chatKey?: string }): void;
  on<T>(type: string, handler: (evt: EventEnvelope<T>) => void): () => void;
  once<T>(type: string, handler: (evt: EventEnvelope<T>) => void): () => void;
  off(type: string, handler: Function): void;
}

// -- MemorySDK 接口暴露规范 --
export interface MemorySDK {
  getChatKey(): string;
  getActiveTemplateId(): Promise<string | null>;
  setActiveTemplateId(templateId: string): Promise<void>;

  events: {
    append<T>(type: string, payload: T, meta?: { sourceMessageId?: string; sourcePlugin?: string }): Promise<string>;
    query(opts: { type?: string; sinceTs?: number; limit?: number }): Promise<Array<EventEnvelope<any>>>;
  };

  facts: {
    upsert(fact: {
      factKey?: string;
      type: string;
      entity?: { kind: string; id: string };
      path?: string;
      value: any;
      confidence?: number;
      provenance?: any;
    }): Promise<string>;
    get(factKey: string): Promise<any | null>;
    query(opts: { type?: string; entity?: { kind: string; id: string }; pathPrefix?: string; limit?: number }): Promise<any[]>;
    remove(factKey: string): Promise<void>;
  };

  state: {
    get(path: string): Promise<any | null>;
    set(path: string, value: any, meta?: { sourceEventId?: string }): Promise<void>;
    patch(patches: Array<{ op: "add" | "replace" | "remove"; path: string; value?: any }>, meta?: any): Promise<void>;
    query(prefix: string): Promise<Record<string, any>>;
  };

  summaries: {
    upsert(summary: { level: "message" | "scene" | "arc"; messageId?: string; title?: string; content: string; keywords?: string[] }): Promise<string>;
    query(opts: { level?: string; sinceTs?: number; limit?: number }): Promise<any[]>;
  };

  injection: {
    buildContext(opts?: { maxTokens?: number; sections?: Array<"WORLD_STATE" | "FACTS" | "EVENTS" | "SUMMARY"> }): Promise<string>;
    setAnchorPolicy(opts: { allowSystem?: boolean; allowUser?: boolean; defaultInsert?: "top" | "beforeStart" | "customAnchor" }): Promise<void>;
  };

  audit: {
    list(opts?: { sinceTs?: number; limit?: number }): Promise<any[]>;
    rollbackToSnapshot(snapshotId: string): Promise<void>;
    createSnapshot(note?: string): Promise<string>;
  };
}

// -- LLMSDK 接口规范 --
export interface LLMSDK {
  runTask<T>(args: {
    consumer: string;
    task: string;
    input: any;
    schema?: object;
    routeHint?: { provider?: string; profile?: string };
    budget?: { maxTokens?: number; maxLatencyMs?: number; maxCost?: number };
  }): Promise<
    | { ok: true; data: T; meta: { provider: string; latencyMs: number; cost?: number } }
    | { ok: false; error: string; retryable?: boolean; fallbackUsed?: boolean }
  >;

  embed?(args: { consumer: string; texts: string[]; routeHint?: any }): Promise<any>;
  rerank?(args: { consumer: string; query: string; docs: string[]; routeHint?: any }): Promise<any>;
}

// -- Plugin Registry 规范 --
export interface PluginManifest {
  pluginId: string;
  name: string;
  version: string;
  capabilities: {
    events?: string[];
    memory?: string[];
    llm?: string[];
  };
  scopes?: string[];
  requiresSDK?: string;
}

export interface STXRegistry {
  register(manifest: PluginManifest): void;
}

// -- 挂载全局对象 --
declare global {
  interface Window {
    STX: {
      version: string;
      bus: STXBus;
      memory: MemorySDK;
      llm: LLMSDK;
      registry: STXRegistry;
    };
  }
}
