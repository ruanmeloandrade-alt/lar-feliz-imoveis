export type PublicChatContext = {
  propertyId?: string;
  name?: string;
  phone?: string;
};
export function openVanessaChat(context: PublicChatContext = {}) {
  window.dispatchEvent(
    new CustomEvent("vanessa:open-chat", { detail: context }),
  );
}
type Tracker = ((...args: unknown[]) => void) & { q?: unknown[][] };
export function trackPublicEvent(
  event: string,
  props: Record<string, unknown> = {},
) {
  if (window.location.pathname !== "/") return;
  const w = window as Window & { mkton?: Tracker };
  if (!w.mkton) {
    const q: unknown[][] = [];
    const fn = (...args: unknown[]) => q.push(args);
    w.mkton = Object.assign(fn, { q });
  }
  w.mkton("track", event, props);
}
