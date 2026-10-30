from pathlib import Path

# --- Backend: tenant-safe Persona operations ---
p = Path('src/lib/meta-personas.functions.ts')
s = p.read_text()

anchor = 'const DetailedItemSchema = z.object({'
helper = '''async function assertWorkspaceMember(\n  // eslint-disable-next-line @typescript-eslint/no-explicit-any\n  supabase: any, workspaceId: string, userId: string,\n) {\n  const { data, error } = await supabase.from("workspace_members")\n    .select("workspace_id")\n    .eq("workspace_id", workspaceId)\n    .eq("user_id", userId)\n    .maybeSingle();\n  if (error) throw new Error(error.message);\n  if (!data) throw new Error("Sem acesso ao workspace.");\n}\n\nasync function assertAdAccountInWorkspace(\n  // eslint-disable-next-line @typescript-eslint/no-explicit-any\n  supabase: any, workspaceId: string, adAccountId: string,\n) {\n  const { data, error } = await supabase.from("meta_ad_accounts")\n    .select("account_id")\n    .eq("workspace_id", workspaceId)\n    .eq("account_id", adAccountId)\n    .maybeSingle();\n  if (error) throw new Error(error.message);\n  if (!data) throw new Error("Conta de anúncio não pertence a este workspace.");\n}\n\n'''
if 'async function assertWorkspaceMember' not in s:
    s = s.replace(anchor, helper + anchor, 1)

s = s.replace('.inputValidator((d: { workspaceId: string }) => d)\n  .handler(async ({ data, context }) => {\n    const { data: rows, error }', '.inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))\n  .handler(async ({ data, context }) => {\n    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);\n    const { data: rows, error }', 1)

needle = '  .handler(async ({ data, context }) => {\n    const row = {'
replacement = '  .handler(async ({ data, context }) => {\n    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);\n    await assertAdAccountInWorkspace(context.supabase, data.workspaceId, data.adAccountId);\n    const row = {'
if needle not in s:
    raise SystemExit('upsert handler anchor not found')
s = s.replace(needle, replacement, 1)

s = s.replace('.from("meta_personas").update(row).eq("id", data.id).select().maybeSingle();', '.from("meta_personas").update(row).eq("id", data.id).eq("workspace_id", data.workspaceId).select().maybeSingle();', 1)

old_delete = '''export const deletePersona = createServerFn({ method: "POST" })\n  .middleware([requireSupabaseAuth])\n  .inputValidator((d: { id: string }) => d)\n  .handler(async ({ data, context }) => {\n    const { error } = await context.supabase\n      .from("meta_personas").delete().eq("id", data.id);\n    if (error) throw new Error(error.message);\n    return { ok: true };\n  });'''
new_delete = '''export const deletePersona = createServerFn({ method: "POST" })\n  .middleware([requireSupabaseAuth])\n  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))\n  .handler(async ({ data, context }) => {\n    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);\n    const { error } = await context.supabase\n      .from("meta_personas").delete().eq("id", data.id).eq("workspace_id", data.workspaceId);\n    if (error) throw new Error(error.message);\n    return { ok: true };\n  });'''
if old_delete not in s:
    raise SystemExit('delete persona block not found')
s = s.replace(old_delete, new_delete, 1)

# Protect token-backed searches and asset listing with workspace membership.
s = s.replace('''  .inputValidator((d: { workspaceId: string; q: string }) => d)\n  .handler(async ({ data, context }) => {\n    const token = await loadMetaToken(context.supabase, data.workspaceId);''', '''  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid(), q: z.string().trim().min(2).max(120) }).parse(d))\n  .handler(async ({ data, context }) => {\n    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);\n    const token = await loadMetaToken(context.supabase, data.workspaceId);''', 2)

# listPersonaAssets is the last simple workspace validator occurrence.
old_assets = '''export const listPersonaAssets = createServerFn({ method: "POST" })\n  .middleware([requireSupabaseAuth])\n  .inputValidator((d: { workspaceId: string }) => d)\n  .handler(async ({ data, context }) => {\n    const [{ data: adAccounts }, { data: pages }, { data: igs }, { data: was }] = await Promise.all(['''
new_assets = '''export const listPersonaAssets = createServerFn({ method: "POST" })\n  .middleware([requireSupabaseAuth])\n  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))\n  .handler(async ({ data, context }) => {\n    await assertWorkspaceMember(context.supabase, data.workspaceId, context.userId);\n    const [{ data: adAccounts }, { data: pages }, { data: igs }, { data: was }] = await Promise.all(['''
if old_assets not in s:
    raise SystemExit('assets block not found')
s = s.replace(old_assets, new_assets, 1)
p.write_text(s)

# --- UI: delete contract now carries workspace + explicit map/search errors ---
p = Path('src/components/meta/MetaPersonaManager.tsx')
s = p.read_text()
s = s.replace('mutationFn: (id: string) => deleteFn({ data: { id } }),', 'mutationFn: (id: string) => deleteFn({ data: { workspaceId, id } }),', 1)
p.write_text(s)

p = Path('src/components/meta/MapLocationSelector.tsx')
s = p.read_text()
s = s.replace('''const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;''', '''const BROWSER_KEY = (import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY\n  ?? import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY) as string | undefined;''', 1)
s = s.replace('''  const [search, setSearch] = useState("");\n  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; text: string }>>([]);''', '''  const [search, setSearch] = useState("");\n  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; text: string }>>([]);\n  const [searching, setSearching] = useState(false);\n  const [searchError, setSearchError] = useState<string | null>(null);''', 1)

old_search = '''  const runSearch = useCallback(async (q: string) => {\n    if (q.trim().length < 2) { setSuggestions([]); return; }\n    try {\n      const g = await loadGoogleMaps();\n      const { AutocompleteSuggestion, AutocompleteSessionToken } = await g.maps.importLibrary("places") as google.maps.PlacesLibrary;\n      if (!sessionTokenRef.current) sessionTokenRef.current = new AutocompleteSessionToken();\n      const { suggestions: sug } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({\n        input: q,\n        sessionToken: sessionTokenRef.current,\n      });\n      setSuggestions(sug.slice(0, 6).map((s) => ({\n        placeId: s.placePrediction?.placeId ?? "",\n        text: s.placePrediction?.text?.toString() ?? "",\n      })).filter((s) => s.placeId));\n    } catch {\n      setSuggestions([]);\n    }\n  }, []);'''
new_search = '''  const runSearch = useCallback(async (q: string) => {\n    if (q.trim().length < 2) { setSuggestions([]); setSearchError(null); return; }\n    setSearching(true);\n    setSearchError(null);\n    try {\n      const g = await loadGoogleMaps();\n      const { AutocompleteSuggestion, AutocompleteSessionToken } = await g.maps.importLibrary("places") as google.maps.PlacesLibrary;\n      if (!sessionTokenRef.current) sessionTokenRef.current = new AutocompleteSessionToken();\n      const { suggestions: sug } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({\n        input: q,\n        sessionToken: sessionTokenRef.current,\n        includedRegionCodes: ["br"],\n        language: "pt-BR",\n      });\n      const items = sug.slice(0, 6).map((s) => ({\n        placeId: s.placePrediction?.placeId ?? "",\n        text: s.placePrediction?.text?.toString() ?? "",\n      })).filter((s) => s.placeId);\n      setSuggestions(items);\n      if (items.length === 0) setSearchError("Nenhum endereço encontrado. Tente incluir cidade, estado ou CEP.");\n    } catch (e) {\n      setSuggestions([]);\n      setSearchError(e instanceof Error ? `Busca de endereço indisponível: ${e.message}` : "Busca de endereço indisponível no momento.");\n    } finally {\n      setSearching(false);\n    }\n  }, []);'''
if old_search not in s:
    raise SystemExit('map runSearch block not found')
s = s.replace(old_search, new_search, 1)

s = s.replace('''    setSearch("");\n    setSuggestions([]);\n    try {''', '''    setSearch("");\n    setSuggestions([]);\n    setSearchError(null);\n    try {''', 1)
s = s.replace('''      if (!place.location) return;''', '''      if (!place.location) {\n        setSearchError("O Google encontrou o endereço, mas não retornou coordenadas. Tente outra descrição.");\n        return;\n      }''', 1)
s = s.replace('''    } catch (e) {\n      console.warn("[MapLocationSelector] pickSuggestion falhou:", e);\n    }''', '''    } catch (e) {\n      console.warn("[MapLocationSelector] pickSuggestion falhou:", e);\n      setSearchError(e instanceof Error ? `Não foi possível abrir este endereço: ${e.message}` : "Não foi possível abrir este endereço.");\n    }''', 1)

# Clear prior error while typing and expose search status/error below input.
s = s.replace('''          onChange={(e) => setSearch(e.target.value)}''', '''          onChange={(e) => { setSearch(e.target.value); setSearchError(null); }}''', 1)
needle = '''        {suggestions.length > 0 && (\n          <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg max-h-56 overflow-y-auto">'''
if needle not in s:
    raise SystemExit('suggestions UI anchor not found')
# status messages go after relative input container, so add only searching indicator inside to avoid absolute collision.
s = s.replace(needle, '''        {searching && (\n          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">Buscando…</div>\n        )}\n        {suggestions.length > 0 && (\n          <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg max-h-56 overflow-y-auto">''', 1)
# Insert explicit error after relative search wrapper closes and before map div.
map_anchor = '''      </div>\n\n      <div\n        ref={mapDivRef}'''
if map_anchor not in s:
    raise SystemExit('map UI anchor not found')
s = s.replace(map_anchor, '''      </div>\n      {searchError && (\n        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">\n          {searchError}\n        </div>\n      )}\n\n      <div\n        ref={mapDivRef}''', 1)
p.write_text(s)

# Regression contract.
t = Path('src/lib/__tests__/traffic-manager-persona-finalization.test.ts')
t.write_text('''import { describe, expect, it } from "vitest";\nimport { readFileSync } from "node:fs";\nimport { resolve } from "node:path";\n\nconst backend = readFileSync(resolve(process.cwd(), "src/lib/meta-personas.functions.ts"), "utf8");\nconst manager = readFileSync(resolve(process.cwd(), "src/components/meta/MetaPersonaManager.tsx"), "utf8");\nconst map = readFileSync(resolve(process.cwd(), "src/components/meta/MapLocationSelector.tsx"), "utf8");\n\ndescribe("Gestor de Tráfego Persona finalization", () => {\n  it("scopes Persona reads/writes/deletes to a workspace membership", () => {\n    expect(backend).toContain("assertWorkspaceMember");\n    expect(backend).toContain("assertAdAccountInWorkspace");\n    expect(backend).toContain('.eq("id", data.id).eq("workspace_id", data.workspaceId)');\n    expect(manager).toContain("deleteFn({ data: { workspaceId, id } })");\n  });\n\n  it("does not swallow Google Places errors", () => {\n    expect(map).toContain("searchError");\n    expect(map).toContain("Busca de endereço indisponível");\n    expect(map).toContain("Nenhum endereço encontrado");\n    expect(map).toContain("VITE_GOOGLE_MAPS_BROWSER_KEY");\n  });\n});\n''')
print('traffic manager task 4 patch applied')
