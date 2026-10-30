/**
 * Checked, idempotent source patch for the inherited SalesBot editor.
 * Applied before build; intentionally fails if a target changes upstream.
 * No generated bundle edits, dependencies, external services or browser storage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function patchSalesbotSaveContract(source) {
  let code = source;
  function replaceOnce(before, after, label) {
    if (code.includes(after)) return;
    const count = code.split(before).length - 1;
    if (count !== 1) throw new Error(`SalesBot source patch: ${label}: expected 1 target, found ${count}`);
    code = code.replace(before, after);
  }
  replaceOnce(` // Auto save a cada 1 minuto: protege o trabalho contra queda de luz/conexão.
 useEffect(() => {
  if (!open) return;
  const t = setInterval(() => {
   if (!hasPendingSalesbotSaves()) return;
    void flushAllSalesbotSaves().catch(() => undefined);
  }, 60_000);
  return () => clearInterval(t);
 }, [open]);`,
  ` // Autosave has a single owner: salesbot-sync-queue waits 120_000 ms.
 // Do not add a second interval here: it can save a new edit before two minutes.`, 'remove one-minute autosave');

  replaceOnce(`     await Promise.race([
      flushAllSalesbotSaves(),
      new Promise<void>((r) => setTimeout(r, 60_000)),
     ]);
     return !hasFailedSalesbotSaves() && getSalesbotSaveStatus().status !== "error";`,
  `     await flushAllSalesbotSaves();
     return !hasPendingSalesbotSaves() && !hasFailedSalesbotSaves()
       && getSalesbotSaveStatus().status !== "error";`, 'require server acknowledgement');

  replaceOnce(`   ) : lastSavedAt ? (`,
  `   ) : saveStatus === "saving" ? (
    <span role="status" className="text-xs text-muted-foreground">Salvando no servidor...</span>
   ) : saveStatus === "dirty" ? (
    <span role="status" className="text-xs text-amber-400">Alterações não salvas</span>
   ) : lastSavedAt ? (`, 'pending versus saving status');

  replaceOnce(`onClick={() => { retrySalesbotSave(); void saveNow(); }}`,
    `onClick={() => { void saveNow(); }}`, 'single manual retry');

  replaceOnce(`  const [closing, setClosing] = useState(false);`,
  `  const [closing, setClosing] = useState(false);
  const [activating, setActivating] = useState(false);
  const activationLockRef = useRef(false);`, 'activation lock');

  // Do not discard unsaved local edits on an activation error. Activation
  // is serialized with saves and never silently saves pending changes.
  const switchStart = '    <Switch \n';
  const switchEnd = '      className="scale-75"\n    />';
  const newSwitch = `    <Switch
      checked={active?.isActive ?? false}
      disabled={!active || activating || closing}
      aria-label="Robô ativo"
      onCheckedChange={(val: boolean) => {
        if (!active || activationLockRef.current) return;
        if (hasPendingSalesbotSaves()) {
          toast.error("Salve as alterações antes de mudar o estado do robô.");
          return;
        }
        const localId = active.id;
        activationLockRef.current = true;
        setActivating(true);
        void (async () => {
          try {
            const result = await enqueueSalesbotSync(localId, async () => {
              const proof = syncProofRef.current.get(localId);
              if (!proof) throw new Error("Salve o bot antes de ativar.");
              const saved = (await setActiveFn({ data: {
                localId, expectedRevision: proof.revision, isActive: val,
              } } as never)) as unknown as { revision: number; isActive: boolean };
              syncProofRef.current.set(localId, {
                revision: Number(saved.revision),
                baseBlockLocalIds: [...proof.baseBlockLocalIds],
              });
              return saved;
            });
            setBots((prev) => {
              const next = prev.map((bot) => bot.id === localId ? { ...bot, isActive: result.isActive } : bot);
              saveSalesbots(next);
              return next;
            });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Não foi possível alterar o estado do SalesBot.");
          } finally {
            activationLockRef.current = false;
            setActivating(false);
          }
        })();
      }}
      className="scale-75"
    />`;
  if (!code.includes(newSwitch)) {
    const start = code.indexOf(switchStart);
    const end = code.indexOf(switchEnd, start);
    if (start < 0 || end < start || code.indexOf(switchStart, start + 1) !== -1)
      throw new Error('SalesBot source patch: activation switch target changed');
    const old = code.slice(start, end + switchEnd.length);
    if (!old.includes('setActiveFn') || !old.includes('loadBotForEditing(localId)'))
      throw new Error('SalesBot source patch: unexpected activation handler');
    code = code.slice(0, start) + newSwitch + code.slice(end + switchEnd.length);
  }
  replaceOnce(`    saveSalesbots(next);
    setBots(next);
    setActiveId(nextActiveId);`,
  `    // Remote creation must not overwrite edits made while the request ran.
    setBots((prev) => {
     const merged = draft ? [prev.find((bot) => bot.id === draft.id) ?? draft, ...remote] : next;
     saveSalesbots(merged);
     return merged;
    });
    setActiveId(nextActiveId);`, 'preserve edits during initial creation');
  return code;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'src/components/automations/SalesbotBuilder.tsx');
if (!fs.existsSync(target)) throw new Error('SalesBot source missing: '+target);
const before = fs.readFileSync(target, 'utf8');
const after = patchSalesbotSaveContract(before);
if (before !== after) fs.writeFileSync(target, after);
if (patchSalesbotSaveContract(after) !== after) throw new Error('SalesBot patch is not idempotent');
console.log('[SalesBot] Source contract verified: manual Save, 120s autosave, acknowledged persistence.');
