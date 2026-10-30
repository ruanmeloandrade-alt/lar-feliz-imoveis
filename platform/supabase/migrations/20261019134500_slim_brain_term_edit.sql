-- Add only the missing UPDATE permission for already-authorized workspace members.
-- The existing restrictive session/MFA policy remains in force.
CREATE POLICY brain_terms_update ON public.ai_brain_blocked_terms
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workspace_members m
  WHERE m.workspace_id = ai_brain_blocked_terms.workspace_id
    AND m.user_id = (SELECT auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.workspace_members m
  WHERE m.workspace_id = ai_brain_blocked_terms.workspace_id
    AND m.user_id = (SELECT auth.uid())
));
