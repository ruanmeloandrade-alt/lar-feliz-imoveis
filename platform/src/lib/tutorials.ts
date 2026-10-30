export const TUTORIAL_EDITOR_ID = "e8f2252b-c0bc-4336-9912-2e62e73ddd2e";

export function canEditTutorials(userId: string | null | undefined) {
  return userId === TUTORIAL_EDITOR_ID;
}

/** Accept YouTube links only; never render a supplied URL as an iframe source. */
export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.split("/")[1];
    else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtube-nocookie.com",
        "www.youtube-nocookie.com",
      ].includes(host)
    ) {
      const parts = url.pathname.split("/");
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (["embed", "shorts", "live"].includes(parts[1])) id = parts[2];
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function tutorialPosition(value: string): number {
  const position = Number(value);
  if (!value.trim() || !Number.isInteger(position) || position < 0 || position > 1000000) {
    throw new Error("A ordem deve ser um número inteiro entre 0 e 1000000.");
  }
  return position;
}
