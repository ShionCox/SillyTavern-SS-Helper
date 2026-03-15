export type SdkTavernScopeTypeEvent = "character" | "group";

export interface SdkAccountStorageEvent {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SdkTavernCharacterEvent {
  name?: string;
  avatar?: string;
  chat?: string;
  description?: string;
  desc?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  tags?: string[];
  data?: Record<string, unknown>;
}

export interface SdkTavernGroupEvent {
  id?: string;
  name?: string;
  chat_id?: string;
  chats?: string[];
  avatar_url?: string;
  members?: Array<string | { id?: string; name?: string; avatar?: string }>;
  memberNames?: string[];
}

export interface SdkTavernContextEvent {
  characterId?: number | string;
  this_chid?: number | string;
  groupId?: string;
  mainApi?: string;
  chatCompletionSettings?: Record<string, unknown>;
  chatId?: string;
  chat_id?: string;
  characters?: SdkTavernCharacterEvent[];
  groups?: SdkTavernGroupEvent[];
  name1?: string;
  name2?: string;
  characterName?: string;
  systemPrompt?: string;
  system_prompt?: string;
  main_prompt?: string;
  firstMessage?: string;
  first_mes?: string;
  opener?: string;
  authorNote?: string;
  author_note?: string;
  jailbreak?: string;
  jailbreak_prompt?: string;
  instruct?: string;
  instruct_prompt?: string;
  preset?: string;
  presetName?: string;
  chatCompletionPreset?: string;
  description?: string;
  desc?: string;
  personality?: string;
  scenario?: string;
  mes_example?: string;
  creator_notes?: string;
  world_info?: string;
  selected_world_info?: string[];
  groupMembers?: Array<string | { id?: string; name?: string; avatar?: string }>;
  group_members?: Array<string | { id?: string; name?: string; avatar?: string }>;
  getRequestHeaders?: () => Record<string, string>;
  accountStorage?: SdkAccountStorageEvent;
}

export interface SdkTavernEventSourceEvent {
  on(eventName: string, handler: (payload: unknown) => void): void;
  makeLast?(eventName: string, handler: (payload: unknown) => void): void;
}

export interface SdkTavernSlashCommandParserEvent {
  addCommandObject(commandObject: unknown): void;
}

export interface SdkTavernSlashCommandFactoryEvent {
  fromProps(props: Record<string, unknown>): unknown;
}

export interface SdkTavernSlashCommandArgumentFactoryEvent {
  fromProps(props: Record<string, unknown>): unknown;
}

export interface SdkTavernSlashCommandRuntimeEvent {
  parser: SdkTavernSlashCommandParserEvent | null;
  command: SdkTavernSlashCommandFactoryEvent | null;
  argument: SdkTavernSlashCommandArgumentFactoryEvent | null;
  namedArgument: SdkTavernSlashCommandArgumentFactoryEvent | null;
  argumentType: Record<string, unknown> | null;
}

export interface SdkTavernRuntimeContextEvent extends SdkTavernContextEvent {
  chatMetadata?: Record<string, unknown>;
  extensionSettings?: Record<string, unknown>;
  chat?: unknown[];
  saveMetadata?: () => void;
  saveSettingsDebounced?: () => void;
  saveChat?: () => unknown;
  saveChatConditional?: () => unknown;
  saveChatDebounced?: () => unknown;
  registerMacro?: (name: string, fn: () => string) => void;
  SlashCommandParser?: SdkTavernSlashCommandParserEvent | null;
  SlashCommand?: SdkTavernSlashCommandFactoryEvent | null;
  SlashCommandArgument?: SdkTavernSlashCommandArgumentFactoryEvent | null;
  SlashCommandNamedArgument?: SdkTavernSlashCommandArgumentFactoryEvent | null;
  ARGUMENT_TYPE?: Record<string, unknown> | null;
  sendSystemMessage?: (type: unknown, text: string, extra?: unknown) => unknown;
  eventSource?: SdkTavernEventSourceEvent | null;
  event_types?: Record<string, string>;
}

export interface SdkTavernSemanticSnapshotEvent {
  roleKey: string;
  roleId: string;
  displayName: string;
  groupId: string;
  characterId: string;
  systemPrompt: string;
  firstMessage: string;
  authorNote: string;
  jailbreak: string;
  instruct: string;
  activeLorebooks: string[];
  groupMembers: string[];
  presetStyle: string;
}

export interface SdkTavernRoleIdentityEvent {
  roleId: string;
  roleKey: string;
  displayName: string;
  avatarName: string;
  avatarUrl: string;
}

export interface SdkTavernInstanceEvent {
  tavernInstanceId: string;
}

export interface SdkTavernScopeLocatorEvent extends SdkTavernInstanceEvent {
  scopeType: SdkTavernScopeTypeEvent;
  scopeId: string;
  roleKey: string;
  roleId: string;
  displayName: string;
  avatarUrl: string;
  groupId: string;
  characterId: number;
  currentChatId: string;
}

export interface SdkTavernChatLocatorEvent extends SdkTavernScopeLocatorEvent {
  chatId: string;
}

export interface SdkTavernChatListItemEvent {
  locator: SdkTavernChatLocatorEvent;
  updatedAt: number;
  messageCount: number;
}

export interface SdkTavernChatRefEvent extends SdkTavernInstanceEvent {
  scopeType: SdkTavernScopeTypeEvent;
  scopeId: string;
  chatId: string;
}

export interface SdkTavernPromptMessageEvent {
  role?: string;
  is_user?: boolean;
  is_system?: boolean;
  content?: unknown;
  mes?: string;
  text?: string;
  swipe_id?: number;
  swipeId?: number;
  swipes?: unknown[];
  [key: string]: unknown;
}

export interface SdkTavernPromptTargetEvent<
  TMessage extends SdkTavernPromptMessageEvent = SdkTavernPromptMessageEvent,
> {
  path: string;
  messages: TMessage[];
}

export type SdkTavernPromptSystemInsertModeEvent =
  | "append"
  | "before_index"
  | "before_end_offset";

export interface SdkTavernPromptSystemInsertOptionsEvent {
  text?: string;
  template?: SdkTavernPromptMessageEvent | null;
  insertMode?: SdkTavernPromptSystemInsertModeEvent;
  insertBeforeIndex?: number;
  offsetFromEnd?: number;
}

export interface SdkUnifiedTavernLocalSummaryEvent {
  chatKey: string;
  updatedAt: number;
  activeStatusCount?: number;
  displayName?: string;
  avatarUrl?: string;
  roleKey?: string;
}

export interface SdkUnifiedTavernHostChatEvent {
  chatKey: string;
  updatedAt: number;
  chatId: string;
  displayName: string;
  avatarUrl: string;
  scopeType: SdkTavernScopeTypeEvent;
  scopeId: string;
  roleKey: string;
}

export interface SdkUnifiedTavernChatDirectoryInputEvent {
  currentChatKey: string;
  hostChats: SdkUnifiedTavernHostChatEvent[];
  localSummaries: SdkUnifiedTavernLocalSummaryEvent[];
  draftChatKeys?: string[];
  taggedChatKeys?: string[];
}

export interface SdkUnifiedTavernChatDirectoryItemEvent {
  chatKey: string;
  entityKey: string;
  chatId: string;
  displayName: string;
  avatarUrl: string;
  scopeType: SdkTavernScopeTypeEvent;
  scopeId: string;
  roleKey: string;
  updatedAt: number;
  activeStatusCount: number;
  isCurrent: boolean;
  fromHost: boolean;
  fromLocal: boolean;
  fromDraft: boolean;
  fromTagged: boolean;
}

