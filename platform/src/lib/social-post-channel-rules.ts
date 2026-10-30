export type SocialPostFormat = "feed" | "reels" | "carrossel" | "story";
export type SocialPostChannel =
  | "fb_feed"
  | "ig_feed"
  | "ig_story"
  | "ig_reels"
  | "tiktok"
  | "linkedin";

export const SOCIAL_POST_CHANNEL_LABELS: Record<SocialPostChannel, string> = {
  fb_feed: "Facebook Feed",
  ig_feed: "Instagram Feed",
  ig_story: "Instagram Story",
  ig_reels: "Instagram Reels",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export function channelsForSocialPostFormat(format: SocialPostFormat): SocialPostChannel[] {
  if (format === "story") return ["ig_story"];
  if (format === "reels") return ["ig_reels"];
  return ["ig_feed", "fb_feed"];
}

export function normalizeSocialPostChannels(
  format: SocialPostFormat,
  channels: string[] | null | undefined,
): SocialPostChannel[] {
  const allowed = new Set(channelsForSocialPostFormat(format));
  return (channels ?? []).filter((channel): channel is SocialPostChannel => allowed.has(channel as SocialPostChannel));
}
