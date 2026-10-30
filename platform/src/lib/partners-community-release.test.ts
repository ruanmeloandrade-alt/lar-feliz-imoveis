import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const communitySql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260811180000_partners_community_release_reconciliation.sql"),
  "utf8",
);
const accessSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260811180500_partners_technical_access_release_reconciliation.sql"),
  "utf8",
);
const communityRoute = readFileSync(
  resolve(process.cwd(), "src/routes/partners.comunidade.tsx"),
  "utf8",
);

describe("Partners release — comunidade e acesso técnico", () => {
  it("mantém a comunidade real, protegida por RLS e sem conteúdo fake", () => {
    expect(communitySql).toContain("partner_program_community_posts");
    expect(communitySql).toContain("partner_program_community_comments");
    expect(communitySql).toContain("force row level security");
    expect(communityRoute).toContain("partner_program_create_community_post");
    expect(communityRoute).toContain("partner_program_create_community_comment");
    expect(communityRoute).toContain("Nenhum conteúdo fictício foi inserido");
  });

  it("separa Affiliate e Partner na publicação", () => {
    expect(communitySql).toContain("p_role not in ('affiliate','partner')");
    expect(communitySql).toContain("p_audience <> 'all' and p_audience <> p_role");
    expect(communitySql).toContain("INVALID_AUDIENCE_FOR_ROLE");
    expect(communityRoute).toContain("Publicar como");
  });

  it("permite moderação administrativa auditável", () => {
    expect(communitySql).toContain("partner_program_moderate_community_content");
    expect(communitySql).toContain("partner_program_is_admin(auth.uid())");
    expect(communitySql).toContain("partner_program_write_audit");
    expect(communityRoute).toContain("Post ocultado e registrado na auditoria");
  });

  it("concede workspace de cliente somente para Partner aprovado", () => {
    expect(accessSql).toContain("role='partner'");
    expect(accessSql).toContain("status='approved'");
    expect(accessSql).toContain("role_snapshot='partner'");
    expect(accessSql).toContain("'member','partner',true");
    expect(accessSql).not.toContain("role_snapshot='affiliate'");
  });

  it("faz backfill apenas de atribuições Partner determinísticas", () => {
    expect(accessSql).toContain("Backfill de acesso técnico Partner no release");
    expect(accessSql).toContain("a.client_workspace_id is not null");
    expect(accessSql).toContain("rv.id=a.source_visit_id");
  });
});
