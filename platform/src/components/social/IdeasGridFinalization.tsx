import { useIsSuperAdmin } from "@/hooks/use-roles";
import { IdeasGridFinalization as IdeasGridWithImages } from "./IdeasGridFinalizationCore";
import { IdeasGridTextFirst } from "./IdeasGridTextFirst";
import type { IdeaPayload } from "./IdeasGridFinalizationCore";

export type { IdeaPayload } from "./IdeasGridFinalizationCore";

export function IdeasGridFinalization({ workspaceId, onUse }: { workspaceId: string | null; onUse: (idea: IdeaPayload) => void }) {
  const { isSuperAdmin, loaded } = useIsSuperAdmin();
  if (!loaded) return null;
  return isSuperAdmin
    ? <IdeasGridWithImages workspaceId={workspaceId} onUse={onUse} />
    : <IdeasGridTextFirst workspaceId={workspaceId} onUse={onUse} />;
}
