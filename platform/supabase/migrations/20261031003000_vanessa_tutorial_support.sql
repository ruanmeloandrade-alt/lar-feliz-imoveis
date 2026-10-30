BEGIN;
ALTER POLICY tutorials_editor ON public.tutorial_modules USING ((SELECT auth.uid())='b6bf8bde-340c-4a98-9fb4-179e2fcf3464'::uuid) WITH CHECK ((SELECT auth.uid())='b6bf8bde-340c-4a98-9fb4-179e2fcf3464'::uuid);
ALTER POLICY tutorials_editor ON public.tutorial_lessons USING ((SELECT auth.uid())='b6bf8bde-340c-4a98-9fb4-179e2fcf3464'::uuid) WITH CHECK ((SELECT auth.uid())='b6bf8bde-340c-4a98-9fb4-179e2fcf3464'::uuid);
COMMIT;
SELECT '47-support-tutorials' AS file,'OK' AS status;
