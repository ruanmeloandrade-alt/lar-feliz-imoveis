// Hook centralizado pra listar posts + assets + channels do workspace.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSocialPosts } from "@/lib/social.functions";

export type SocialPostRow = {
  id: string;
  workspace_id: string;
  title: string | null;
  copy: string | null;
  hashtags: string[] | null;
  status:
    | "draft"
    | "pending_approval"
    | "approved"
    | "scheduled"
    | "publishing"
    | "published"
    | "failed"
    | "rejected";
  scheduled_at: string | null;
  published_at: string | null;
  publish_attempts: number | null;
  max_publish_attempts: number | null;
  last_publish_attempt_at: string | null;
  next_publish_attempt_at: string | null;
  last_error: string | null;
  failed_at: string | null;
  ai_provider: "openai" | "gemini" | null;
  briefing: string | null;
  cta: string | null;
  reference_urls: string[] | null;
  canva_design_id: string | null;
  metadata: unknown;
  created_at: string;
};

export type SocialAssetRow = {
  id: string;
  post_id: string;
  workspace_id: string;
  storage_path: string;
  kind: "image" | "video";
  aspect: string | null;
  ai_generated: boolean;
  canva_design_id: string | null;
  canva_template_id: string | null;
  position: number | null;
};

export type SocialChannelRow = {
  id: string;
  post_id: string;
  workspace_id: string;
  channel:
    | "fb_feed"
    | "fb_story"
    | "fb_reels"
    | "ig_feed"
    | "ig_story"
    | "ig_reels"
    | "tiktok"
    | "linkedin";
  status: string;
  platform_ref: string | null;
  published_at: string | null;
  last_error: string | null;
};

export function useSocialPosts(workspaceId: string | null, range?: { from?: Date; to?: Date }) {
  const fn = useServerFn(listSocialPosts);
  return useQuery({
    queryKey: ["social-posts", workspaceId, range?.from?.toISOString(), range?.to?.toISOString()],
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await fn({
        data: {
          workspaceId: workspaceId!,
          from: range?.from?.toISOString(),
          to: range?.to?.toISOString(),
        },
      });
      return res as {
        posts: SocialPostRow[];
        channels: SocialChannelRow[];
        assets: SocialAssetRow[];
      };
    },
    staleTime: 30_000,
  });
}
