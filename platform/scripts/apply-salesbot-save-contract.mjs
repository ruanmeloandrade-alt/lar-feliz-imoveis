// Preserve regression gates. Build scripts do not connect to production databases.
export { patchSalesbotSaveContract } from './apply-salesbot-save-contract.base.mjs';
// The origin contract runs after inherited source generation and its regression gates.
import './apply-inbox-automation-contract.mjs';
import './apply-slim-dashboard-contract.mjs';
import './apply-slim-audience-contract.mjs';
import './apply-slim-stage-permissions.mjs';
import './apply-slim-settings-continuation.mjs';
import './apply-slim-tracking-overview.mjs';
import './apply-slim-approved-ui-commerce.mjs';
import './apply-slim-bot-metrics.mjs';
import './apply-slim-erp-release.mjs';
import './apply-slim-visible-brand.mjs';
import './apply-slim-legacy-review.mjs';
import './apply-slim-legacy-readiness.mjs';
import './apply-slim-stock-visibility.mjs';
import './apply-slim-checkout-recovery.mjs';
import './apply-slim-legacy-acceptance.mjs';
import './apply-slim-receipt-dispatch.mjs';
import './apply-slim-global-history.mjs';
import './apply-slim-inbox-resumption.mjs';
import './audit-slim-lead-identity.mjs';
import './apply-slim-prompt-only.mjs';
import './apply-slim-group-prompt.mjs';
import './apply-slim-group-salesbots-only.mjs';
import './apply-slim-group-recovery-guard.mjs';
import './audit-slim-group-agent-readers.mjs';
import './apply-slim-inbound-owner.mjs';
import './apply-slim-history-media-stage-hotfix.mjs';
import './apply-slim-media-boundary.mjs';
import './apply-slim-inbox-db-relief.mjs';
import './apply-slim-inbox-lazy-media.mjs';
import './apply-slim-evolution-media-recovery.mjs';
import './apply-slim-inbox-group-media.mjs';
import './apply-slim-error-log-bound.mjs';
import './apply-slim-stage-single-lead.mjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Block 13: apply the catalogue presentation after the archived IA entry points are removed.
execFileSync(process.execPath, [fileURLToPath(new URL('./apply-slim-group-catalog-ui.mjs', import.meta.url))], {stdio: 'inherit'});
for (const file of ['test-slim-group-catalog-postgres.mjs', 'test-slim-group-catalog-runtime.mjs', 'test-slim-group-catalog-ui.mjs', 'test-slim-group-schedule-scope.mjs', 'test-slim-employee-workspace.mjs', 'test-slim-workspace-channels.mjs']) {
 execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], {stdio: 'inherit'});
}
for (const file of ['test-slim-inbox-group-target.mjs', 'test-slim-group-salesbots-only.mjs', 'test-slim-group-media.mjs', 'test-slim-inbox-group-media.mjs']) {
 execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], {stdio: 'inherit'});
}
for (const file of ['test-slim-funnel-mutations.mjs', 'test-slim-funnel-entrypoints.mjs', 'test-slim-funnel-write-postgres.mjs', 'test-slim-stage-worker-recovery.mjs', 'test-slim-stage-job-receipt.mjs']) {
 execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], {stdio: 'inherit'});
}
for (const file of ['test-slim-copilot-text.mjs', 'test-slim-copilot-backend.mjs', 'test-slim-copilot-postgres.mjs', 'test-slim-copilot-integration.mjs', 'test-slim-copilot-ui.mjs']) {
 execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], {stdio: 'inherit'});
}
for (const file of ['test-slim-checkout-delivery.mjs', 'test-slim-checkout-delivery-ui.mjs', 'test-slim-checkout-delivery-postgres.mjs', 'test-slim-checkout-delivery-integration.mjs']) {
 execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], {stdio: 'inherit'});
}
for (const file of ['test-slim-funnel-detail.mjs', 'test-slim-embedded-inbox.mjs', 'test-slim-funnel-drawer.mjs']) {
 execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], {stdio: 'inherit'});
}
for (const file of ['test-slim-contact-guard-runtime.mjs', 'test-slim-contact-guard-postgres.mjs']) {
  execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], { stdio: 'inherit' });
}
for (const file of ['test-slim-invitations-runtime.mjs', 'test-slim-invitations-ui.mjs', 'test-slim-invitations-postgres.mjs']) {
  execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], { stdio: 'inherit' });
}
for (const file of ['test-slim-order-changes-runtime.mjs', 'test-slim-order-changes-ui.mjs', 'test-slim-order-changes-current-postgres.mjs']) {
 execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], {stdio: 'inherit'});
}
for (const file of ['test-slim-audience-report.mjs', 'test-slim-drawer-actions.mjs', 'test-slim-mfa.mjs']) {
 execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], {stdio: 'inherit'});
}
// Block 12: enforce the same native session/MFA rule in UI, API and database.
for (const file of ['test-slim-auth-mfa-gate.mjs', 'test-slim-session-security-runtime.mjs', 'test-slim-security-account.mjs', 'test-slim-security-settings.mjs', 'test-slim-session-security-postgres.mjs']) {
 execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./' + file, import.meta.url))], {stdio: 'inherit'});
}
for(const file of ['test-inbox-automation-controls.mjs','test-saude-slim-ai-vault.mjs','test-saude-slim-sales-read.mjs','test-slim-dashboard-data.mjs','test-slim-dashboard-contract.mjs','test-slim-audience-core.mjs','test-slim-audience-delivery.mjs','test-slim-audience-contract.mjs','test-slim-stage-permissions.mjs','test-slim-settings-validation.mjs','test-slim-settings-contract.mjs','test-slim-tracking-overview.mjs','test-slim-tracking-loader.mjs','test-slim-tracking-contract.mjs','test-slim-money-source.mjs','test-slim-approved-integration.mjs','test-slim-chat-membership.mjs','test-slim-bot-metrics.mjs','test-slim-visible-brand.mjs','test-slim-metrics-integration.mjs','test-slim-checkout-preparation.mjs','test-slim-erp-release.mjs','test-slim-erp-release-source.mjs','test-slim-legacy-review.mjs','test-slim-legacy-contract.mjs','test-slim-legacy-readiness.mjs','test-slim-stock-visibility.mjs','test-slim-stock-contract.mjs','test-slim-checkout-recovery.mjs','test-slim-checkout-recovery-contract.mjs','test-slim-legacy-stock-acceptance.mjs','test-slim-receipt-dispatch.mjs','test-slim-receipt-contract.mjs','test-slim-receipt-identity.mjs','test-slim-document-postgres.mjs','test-slim-global-history.mjs','test-slim-order-changes-postgres.mjs','test-slim-inbox-ui-core.mjs','test-slim-inbox-resumption-source.mjs','test-slim-inbox-dependencies-postgres.mjs','test-slim-prompt-only-core.mjs','test-slim-prompt-only-source.mjs','test-slim-group-prompt.mjs','test-slim-group-prompt-source.mjs','test-slim-group-prompt-postgres.mjs','test-slim-group-recovery-version.mjs','test-slim-inbound-owner-source.mjs','test-slim-media-deadline.mjs','test-slim-hotfix-source.mjs','test-slim-inbox-db-relief.mjs','test-slim-inbox-lazy-media.mjs','test-slim-evolution-media-recovery.mjs','test-slim-group-inbox-release.mjs','test-slim-error-log-bound.mjs','test-slim-db-worker-backoff.mjs','test-slim-db-readiness.mjs','test-slim-stage-single-lead.mjs','test-slim-stage-release-source.mjs','test-slim-auth-network.mjs','test-slim-stage-move-postgres.mjs']){
 execFileSync(process.execPath,['--experimental-strip-types',fileURLToPath(new URL('./'+file,import.meta.url))],{stdio:'inherit'});
}
execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-whatsapp-origin.mjs',import.meta.url))],{stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('./test-slim-whatsapp-origin-postgres.mjs',import.meta.url))],{stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('./test-slim-whatsapp-origin-runtime.mjs',import.meta.url))],{stdio:'inherit'});
execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-first-inbound.mjs',import.meta.url))],{stdio:'inherit'});
execFileSync(process.execPath,['--experimental-strip-types',fileURLToPath(new URL('./test-slim-first-inbound.mjs',import.meta.url))],{stdio:'inherit'});
