import { describe, expect, it } from "vitest";
import { channelsForSocialPostFormat, normalizeSocialPostChannels } from "./social-post-channel-rules";

describe("social post channel rules", () => {
  it("feed e carrossel usam feeds de Instagram/Facebook", () => {
    expect(channelsForSocialPostFormat("feed")).toEqual(["ig_feed", "fb_feed"]);
    expect(channelsForSocialPostFormat("carrossel")).toEqual(["ig_feed", "fb_feed"]);
  });

  it("story e reels ficam em seus posicionamentos reais", () => {
    expect(channelsForSocialPostFormat("story")).toEqual(["ig_story"]);
    expect(channelsForSocialPostFormat("reels")).toEqual(["ig_reels"]);
  });

  it("remove canais incompatíveis em vez de salvar placement genérico", () => {
    expect(normalizeSocialPostChannels("feed", ["ig_feed", "ig_story", "fb_feed"])).toEqual([
      "ig_feed",
      "fb_feed",
    ]);
  });
});
