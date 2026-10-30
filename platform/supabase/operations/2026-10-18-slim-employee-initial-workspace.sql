-- Block 13: repair only the initial company selection of the newly provisioned employee.
-- Substitute the three validated UUID parameters. No Auth, permission or session changes.
BEGIN;
SET LOCAL lock_timeout='5s';
WITH target AS (
 SELECT p.id, p.current_workspace_id
 FROM public.profiles p
 JOIN public.workspaces initial ON initial.id=p.current_workspace_id AND initial.owner_id=p.id
 JOIN public.workspace_members m ON m.user_id=p.id AND m.workspace_id='__WORKSPACE_ID__'::uuid
 JOIN auth.users u ON u.id=p.id
 WHERE p.id='__EMPLOYEE_ID__'::uuid
  AND p.current_workspace_id='__INITIAL_WORKSPACE_ID__'::uuid
  AND p.current_workspace_id<>m.workspace_id
  AND m.role_type='funcionario' AND (m.access_expires_at IS NULL OR m.access_expires_at>now())
  AND u.created_at>='2026-10-18T18:44:00Z'::timestamptz AND u.created_at<'2026-10-18T18:46:00Z'::timestamptz
  AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
  AND NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.workspace_id=p.current_workspace_id)
  AND NOT EXISTS(SELECT 1 FROM public.salesbots b WHERE b.workspace_id=p.current_workspace_id)
  AND NOT EXISTS(SELECT 1 FROM public.whatsapp_groups g WHERE g.workspace_id=p.current_workspace_id)
)
UPDATE public.profiles p SET current_workspace_id='__WORKSPACE_ID__'::uuid
FROM target t WHERE p.id=t.id AND p.current_workspace_id=t.current_workspace_id
RETURNING p.id,p.current_workspace_id;
COMMIT;
