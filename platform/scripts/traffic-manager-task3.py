from pathlib import Path

p = Path('src/routes/modulos.gestor-trafego.index.tsx')
s = p.read_text()

old_sources = '''type AdSource = "meta" | "google" | "tiktok" | "pinterest" | "linkedin";\nconst AD_SOURCES: { v: AdSource; l: string; ready: boolean; devOnly?: boolean }[] = [\n  { v: "meta", l: "Meta Ads", ready: true },\n  { v: "google", l: "Google Ads", ready: false },\n  { v: "tiktok", l: "TikTok Ads", ready: false, devOnly: true },\n  { v: "pinterest", l: "Pinterest Ads", ready: false, devOnly: true },\n  { v: "linkedin", l: "LinkedIn Ads", ready: false, devOnly: true },\n];'''
new_sources = '''type AdSource = "meta" | "google" | "tiktok";\nconst AD_SOURCES: { v: AdSource; l: string; ready: boolean; agentReady: boolean }[] = [\n  { v: "meta", l: "Meta Ads", ready: true, agentReady: true },\n  { v: "google", l: "Google Ads", ready: false, agentReady: true },\n  { v: "tiktok", l: "TikTok Ads", ready: false, agentReady: true },\n];'''
if old_sources not in s:
    raise SystemExit('AD_SOURCES block not found')
s = s.replace(old_sources, new_sources, 1)

old_visible = '''  const visibleSources = useMemo(\n    () => AD_SOURCES.filter((s) => isSuperAdmin || !s.devOnly),\n    [isSuperAdmin],\n  );\n  const total = visibleSources.length;'''
new_visible = '''  const visibleSources = useMemo(() => AD_SOURCES, []);\n  const selectableSources = useMemo(() => visibleSources.filter((s) => s.ready), [visibleSources]);\n  const total = selectableSources.length;'''
if old_visible not in s:
    raise SystemExit('visibleSources block not found')
s = s.replace(old_visible, new_visible, 1)

old_toggle = '''  const toggle = (v: AdSource) => {\n    const next = new Set(selected);\n    if (next.has(v)) next.delete(v); else next.add(v);\n    onChange(next);\n  };'''
new_toggle = '''  const toggle = (v: AdSource) => {\n    const source = AD_SOURCES.find((s) => s.v === v);\n    if (!source?.ready) return;\n    const next = new Set(selected);\n    if (next.has(v)) next.delete(v); else next.add(v);\n    onChange(next);\n  };'''
if old_toggle not in s:
    raise SystemExit('toggle block not found')
s = s.replace(old_toggle, new_toggle, 1)

s = s.replace('onClick={() => onChange(new Set(visibleSources.map((s) => s.v)))}', 'onClick={() => onChange(new Set(selectableSources.map((s) => s.v)))}', 1)

old_button = '''              <button\n                key={s.v}\n                onClick={() => toggle(s.v)}\n                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2"\n              >'''
new_button = '''              <button\n                key={s.v}\n                onClick={() => toggle(s.v)}\n                disabled={!s.ready}\n                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2 disabled:cursor-default disabled:opacity-80"\n              >'''
if old_button not in s:
    raise SystemExit('source button block not found')
s = s.replace(old_button, new_button, 1)

old_badge = '''                  {s.devOnly ? (\n                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-pink-500/15 text-pink-600 border border-pink-500/40 dark:text-pink-400">\n                      Dev · finalizar\n                    </span>\n                  ) : !s.ready ? (\n                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">\n                      <Clock className="w-2.5 h-2.5" /> Em breve\n                    </span>\n                  ) : null}'''
new_badge = '''                  {!s.ready && s.agentReady ? (\n                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 dark:text-emerald-400">\n                      IA/Chat ativo · dashboard em conexão\n                    </span>\n                  ) : null}'''
if old_badge not in s:
    raise SystemExit('source badge block not found')
s = s.replace(old_badge, new_badge, 1)

# isSuperAdmin is kept in the signature for now to avoid widening the patch, but must not hide real providers.
# It is intentionally read so TypeScript does not treat it as dead input in stricter builds.
s = s.replace('''}) {\n  const visibleSources = useMemo(() => AD_SOURCES, []);''', '''}) {\n  void isSuperAdmin;\n  const visibleSources = useMemo(() => AD_SOURCES, []);''', 1)

p.write_text(s)

# Focused contract test for source truthfulness.
t = Path('src/lib/__tests__/traffic-manager-sources-contract.test.ts')
t.write_text('''import { describe, expect, it } from "vitest";\nimport { readFileSync } from "node:fs";\nimport { resolve } from "node:path";\n\nconst page = readFileSync(resolve(process.cwd(), "src/routes/modulos.gestor-trafego.index.tsx"), "utf8");\n\ndescribe("Gestor de Tráfego source contract", () => {\n  it("shows only providers with real implementation scope", () => {\n    expect(page).toContain('{ v: "meta", l: "Meta Ads", ready: true, agentReady: true }');\n    expect(page).toContain('{ v: "google", l: "Google Ads", ready: false, agentReady: true }');\n    expect(page).toContain('{ v: "tiktok", l: "TikTok Ads", ready: false, agentReady: true }');\n    expect(page).not.toContain('Pinterest Ads');\n    expect(page).not.toContain('LinkedIn Ads');\n  });\n\n  it("does not let the Meta dashboard pretend to select a provider it does not render yet", () => {\n    expect(page).toContain('disabled={!s.ready}');\n    expect(page).toContain('IA/Chat ativo · dashboard em conexão');\n    expect(page).toContain('visibleSources.filter((s) => s.ready)');\n  });\n});\n''')
print('traffic manager task 3 patch applied')
