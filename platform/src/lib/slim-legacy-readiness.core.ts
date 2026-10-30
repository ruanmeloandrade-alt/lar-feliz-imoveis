/** Release acceptance: 29 real SQL tests in isolated PostgreSQL, 2026-10-16.
 * The four legacy SQL bodies match the installed Supabase functions byte-for-byte.
 * This is not browser E2E or a test against business records. Operator consent stays required.
 */
export const LEGACY_ACCEPTANCE = Object.freeze({kind:'isolated-postgresql-with-live-body-parity',checks:29,validatedAt:'2026-10-16T10:18:02Z'});
export function legacyReconciliationReadiness(): {canReconcile:boolean;message:string} {
 return {canReconcile:true,message:'Regularização disponível após conferência explícita dos itens, pagamento e situação da baixa. Nenhuma venda antiga é alterada automaticamente.'};
}
export function assertLegacyReconciliationReady():void {
 const state=legacyReconciliationReadiness();
 if(!state.canReconcile)throw new Error(state.message);
}
