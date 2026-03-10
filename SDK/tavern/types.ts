export type SdkTavernScopeTypeEvent = "character" | "group";

export interface SdkAccountStorageEvent {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SdkTavernCharacterEvent {
  name?: string;
  avatar?: string;
  chat?: string;
}

export interface SdkTavernGroupEvent {
  id?: string;
  name?: string;
  chat_id?: string;
  chats?: string[];
  avatar_url?: string;
}

export interface SdkTavernContextEvent {
  characterId?: number | string;
  groupId?: string;
  chatId?: string;
  characters?: SdkTavernCharacterEvent[];
  groups?: SdkTavernGroupEvent[];
  name1?: string;
  getRequestHeaders?: () => Record<string, string>;
  accountStorage?: SdkAccountStorageEvent;
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

