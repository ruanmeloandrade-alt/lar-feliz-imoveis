export const SIDEBAR_STORAGE_KEY = 'saude-slim:sidebar:collapsed:v1';
export const SIDEBAR_EXPANDED_WIDTH = 272;
export const SIDEBAR_COLLAPSED_WIDTH = 72;
export function readSidebarPreference(storage: Pick<Storage, 'getItem'>): boolean {
  try { return storage.getItem(SIDEBAR_STORAGE_KEY) === '1'; } catch { return false; }
}
export function writeSidebarPreference(storage: Pick<Storage, 'setItem'>, collapsed: boolean): void {
  try { storage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* Storage cannot prevent navigation. */ }
}
export function parseSidebarStorageEvent(key: string | null, value: string | null): boolean | null {
  if (key !== SIDEBAR_STORAGE_KEY && key !== null) return null;
  return key === null ? false : value === '1';
}
