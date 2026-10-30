from pathlib import Path
import re

# Remove the Ads-Manager-like manual campaign creator from the main route.
p = Path('src/routes/modulos.gestor-trafego.index.tsx')
lines = p.read_text().splitlines()
out = []
i = 0
while i < len(lines):
    line = lines[i]
    if 'NewCampaignDialog' in line and line.lstrip().startswith('import '):
        i += 1
        continue
    if 'const [newOpen, setNewOpen] = useState(false);' in line:
        i += 1
        continue
    if '<Button size="sm" onClick={() => setNewOpen(true)}>' in line:
        i += 1
        while i < len(lines) and '</Button>' not in lines[i]:
            i += 1
        if i < len(lines):
            i += 1
        continue
    if 'onNewCampaign={() => setNewOpen(true)}' in line:
        i += 1
        continue
    if '<NewCampaignDialog' in line:
        i += 1
        while i < len(lines) and '/>' not in lines[i]:
            i += 1
        if i < len(lines):
            i += 1
        continue
    # Drop obsolete guidance that sent users back to the removed manual creator.
    if 'ou criar uma campanha nova do zero pelo botão "Nova campanha".' in line:
        out.append('  // Criação derivada passa por Automações Executáveis/IA, preservando o objeto de origem e guardrails.')
        i += 1
        continue
    if '<strong>Sobre duplicar campanha:</strong>' in line and 'Nova campanha' in line:
        out.append('              <strong>Sobre duplicar campanha:</strong> use Automações Executáveis para planejar duplicações e criações derivadas com revisão, preservando a configuração do objeto de origem e aplicando somente as mudanças pedidas pela estratégia.')
        i += 1
        continue
    out.append(line)
    i += 1
s = '\n'.join(out) + '\n'
if '<Plus ' not in s:
    s = re.sub(r',\s*Plus\s*,', ', ', s, count=1)
leftovers = [x for x in ['Nova campanha', 'NewCampaignDialog', 'setNewOpen', 'onNewCampaign='] if x in s]
if leftovers:
    raise SystemExit(f'route still contains manual campaign creation entry point: {leftovers}')
p.write_text(s)

# Remove the secondary "Criar" entry point from the operational table.
p = Path('src/components/meta/MetaAdsManagerTable.tsx')
lines = p.read_text().splitlines()
out = []
i = 0
while i < len(lines):
    line = lines[i]
    if line.strip() == 'onNewCampaign,':
        i += 1
        continue
    if line.strip() == 'onNewCampaign: () => void;':
        i += 1
        continue
    if '<Button size="sm" onClick={onNewCampaign}>' in line:
        i += 1
        while i < len(lines) and '</Button>' not in lines[i]:
            i += 1
        if i < len(lines):
            i += 1
        continue
    out.append(line)
    i += 1
s = '\n'.join(out) + '\n'
if '<Plus ' not in s:
    s = re.sub(r',\s*Plus\s*,', ', ', s, count=1)
if 'onNewCampaign' in s:
    raise SystemExit('table still contains campaign creation entry point: onNewCampaign')
p.write_text(s)

# Contract regression for the product rule.
t = Path('src/lib/__tests__/traffic-manager-product-contract.test.ts')
t.write_text('''import { describe, expect, it } from "vitest";\nimport { readFileSync } from "node:fs";\nimport { resolve } from "node:path";\n\nconst page = readFileSync(resolve(process.cwd(), "src/routes/modulos.gestor-trafego.index.tsx"), "utf8");\nconst table = readFileSync(resolve(process.cwd(), "src/components/meta/MetaAdsManagerTable.tsx"), "utf8");\n\ndescribe("Gestor de Tráfego product contract", () => {\n  it("does not expose the Ads Manager clone campaign creator", () => {\n    expect(page).not.toContain("NewCampaignDialog");\n    expect(page).not.toContain("Nova campanha");\n    expect(page).not.toContain("setNewOpen");\n    expect(table).not.toContain("onNewCampaign");\n  });\n\n  it("keeps campaigns, ad sets and ads as operational views", () => {\n    expect(table).toContain('l: "Campanhas"');\n    expect(table).toContain('l: "Conjuntos de anúncios"');\n    expect(table).toContain('l: "Anúncios"');\n  });\n\n  it("redirects creation guidance to executable automations", () => {\n    expect(page).toContain("Automações Executáveis");\n  });\n});\n''')
print('traffic manager block A patch applied')
