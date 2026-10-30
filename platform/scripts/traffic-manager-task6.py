from pathlib import Path
import re

path = Path('src/components/meta/MetaStrategyManager.tsx')
s = path.read_text()
pattern = re.compile(r'''  const suggestedRules = useMemo<Rule\[]>\(\(\) => \[.*?\n  \], \[\]\);''', re.S)
replacement = '''  const suggestedRules = useMemo<Rule[]>(() => {
    const playbookId = (form.targetingHints as { playbook?: string } | null)?.playbook ?? null;
    const playbook = PLAYBOOKS.find((p) => p.id === playbookId) ?? null;
    if (playbook) {
      return materializePlaybookRules(playbook).map((rule) => ({
        ...rule,
        id: crypto.randomUUID(),
        name: `[Estratégia: ${playbook.name}] ${rule.name}`,
      }));
    }

    const objective = form.defaultObjective ?? '';
    const hasStrategyContext = Boolean(
      form.id || form.personaId || form.adAccountId || form.description.trim() || form.copyGuidelines.trim() || objective,
    );
    const isSales = /sales|purchase|catalog/i.test(objective);
    const isLead = /lead|message|conversion/i.test(objective);
    const resultMetric = isSales ? 'cost_per_purchase' : isLead ? 'cpl' : 'cost_per_result';
    const resultLabel = isSales ? 'custo por compra' : isLead ? 'CPL' : 'custo por resultado';
    const baseBudget = Math.max(0, Number(form.budgetAmount ?? 0));
    const protectiveThreshold = baseBudget > 0 ? Math.max(10, Math.round(baseBudget * 1.5 * 100) / 100) : 40;
    const spendThreshold = baseBudget > 0 ? Math.max(20, Math.round(baseBudget * 2 * 100) / 100) : 100;
    const prefix = hasStrategyContext ? 'Contextual' : 'Fallback';

    return [
      {
        id: crypto.randomUUID(),
        name: `${prefix}: proteger ${resultLabel} acima do limite`,
        enabled: true,
        scope_level: 'campaign',
        trigger_metric: resultMetric,
        trigger_operator: 'gt',
        trigger_value: protectiveThreshold,
        trigger_window: 'last_3d',
        action_type: 'pause_campaign',
        action_value: null,
        cooldown_minutes: 720,
        interval_minutes: 60,
      },
      {
        id: crypto.randomUUID(),
        name: `${prefix}: avisar gasto sem eficiência suficiente`,
        enabled: true,
        scope_level: 'campaign',
        trigger_metric: 'spend',
        trigger_operator: 'gt',
        trigger_value: spendThreshold,
        trigger_window: 'last_3d',
        action_type: 'notify_only',
        action_value: null,
        cooldown_minutes: 1440,
        interval_minutes: 60,
      },
      {
        id: crypto.randomUUID(),
        name: `${prefix}: escalar somente após eficiência comprovada`,
        enabled: true,
        scope_level: 'adset',
        trigger_metric: isSales ? 'roas' : 'results',
        trigger_operator: 'gt',
        trigger_value: isSales ? 3 : 3,
        trigger_window: 'last_7d',
        action_type: 'increase_budget',
        action_value: 20,
        cooldown_minutes: 1440,
        interval_minutes: 120,
      },
    ];
  }, [form.id, form.personaId, form.adAccountId, form.description, form.copyGuidelines, form.defaultObjective, form.budgetAmount, form.targetingHints]);'''

s2, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit(f'suggestedRules block replacements={n}')

s2 = s2.replace('Sugerir regras\n                </button>', 'Sugerir regras\n                </button>')
s2 = s2.replace('Sem regras ainda. Uma estratégia sem regras vira só template de campo, a mágica está aqui.', 'Sem regras ainda. “Sugerir regras” usa a estratégia/playbook quando houver contexto; sem estratégia, cria um fallback seguro para você revisar antes de salvar.')
path.write_text(s2)
print('task6 patch applied')
