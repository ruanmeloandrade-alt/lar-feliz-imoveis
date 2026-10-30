import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, ExternalLink, Terminal } from "lucide-react";
import { toast } from "sonner";

export type AgentProvider = "codex" | "claude-code" | "openclaw";

const MCP_TOOLS = [
  { name: "workspace_info", desc: "Descobre a conta ativa, funis, pipelines, sites com tracking e integrações conectadas." },
  { name: "marketing_overview", desc: "Diagnóstico do período: leads novos, ganhos, perdidos, pipeline aberto, tarefas atrasadas e eventos." },
  { name: "crm_list_pipelines", desc: "Lista funis, etapas e quantidade de leads por etapa." },
  { name: "crm_list_leads", desc: "Busca leads com filtro de funil, etapa, status e data." },
  { name: "crm_create_lead", desc: "Cria lead já no funil e etapa certos, com telefone, e-mail, valor e etiquetas." },
  { name: "crm_update_lead", desc: "Move etapa, muda status, ajusta valor, adiciona etiquetas e registra anotação." },
  { name: "workflow_list_tasks", desc: "Lista tarefas do Fluxo de Trabalho, inclusive só as atrasadas." },
  { name: "workflow_create_task", desc: "Cria tarefa com prazo, prioridade e descrição." },
  { name: "tracking_recent_events", desc: "Lê os eventos do Pixel Vanessa Simoni para investigar queda de conversão." },
  { name: "social_add_idea", desc: "Grava pauta no Banco de Ideias do Social Media." },
  { name: "social_list_ideas", desc: "Lista as pautas disponíveis para virar post." },
];

const PROVIDERS: Record<
  AgentProvider,
  {
    name: string;
    tagline: string;
    docs: string;
    steps: string[];
    command?: string;
    configPath: string;
    config: (url: string) => string;
    useCases: string[];
  }
> = {
  codex: {
    name: "Codex (OpenAI)",
    tagline: "O Codex passa a enxergar seu CRM, suas tarefas e seu tracking enquanto trabalha.",
    docs: "https://developers.openai.com/codex/mcp",
    command: "codex mcp add saude-slim --url {URL}",
    configPath: "~/.codex/config.toml",
    steps: [
      "Instale o Codex CLI na sua máquina.",
      "Rode o comando abaixo no terminal, ou cole o bloco de configuração no arquivo indicado.",
      "Na primeira chamada o Codex abre o navegador pedindo autorização da sua conta Vanessa Simoni.",
      "Aprove o acesso na tela de consentimento e pronto.",
      "Peça algo como: leia o panorama de marketing dos últimos 7 dias e crie tarefas para o que estiver travado.",
    ],
    config: (url) => `[mcp_servers.saude-slim]\nurl = "${url}"`,
    useCases: [
      "Auditar o funil e abrir tarefas de correção automaticamente.",
      "Gerar relatório semanal de leads, conversão e origens.",
      "Criar leads em lote a partir de uma planilha ou lista.",
    ],
  },
  "claude-code": {
    name: "Claude Code",
    tagline: "O Claude Code opera a Vanessa Simoni direto do terminal ou do editor.",
    docs: "https://docs.anthropic.com/en/docs/claude-code/mcp",
    command: "claude mcp add --transport http saude-slim {URL}",
    configPath: ".mcp.json (na raiz do projeto) ou ~/.claude.json",
    steps: [
      "Instale o Claude Code.",
      "Rode o comando abaixo, ou cole o bloco no arquivo de configuração.",
      "Rode /mcp dentro do Claude Code e escolha autenticar na Vanessa Simoni.",
      "Aprove o acesso na tela de consentimento que abre no navegador.",
      "Peça: liste as tarefas atrasadas e me diga quais leads estão parados há mais tempo.",
    ],
    config: (url) =>
      JSON.stringify({ mcpServers: { "saude-slim": { type: "http", url } } }, null, 2),
    useCases: [
      "Diagnóstico de tracking: ver se os eventos do Pixel estão chegando.",
      "Puxar leads de um funil e propor cadência de follow-up.",
      "Despejar pautas no Banco de Ideias a partir de uma pesquisa.",
    ],
  },
  openclaw: {
    name: "OpenClaw",
    tagline: "Agente open source rodando na sua máquina, com acesso autorizado à Vanessa Simoni.",
    docs: "https://clawdocs.org/guides/mcp-servers",
    command: "openclaw mcp add saude-slim",
    configPath: "~/.openclaw/openclaw.json",
    steps: [
      "Instale o OpenClaw.",
      "Cole o bloco de configuração no arquivo indicado, ou rode o comando abaixo e informe a URL.",
      "Rode openclaw mcp login saude-slim para autorizar o acesso via OAuth.",
      "Aprove o acesso na tela de consentimento.",
      "Peça: compare os leads dessa semana com a anterior e crie tarefas para as origens que caíram.",
    ],
    config: (url) =>
      JSON.stringify(
        { mcp: { servers: { "saude-slim": { url, transport: "streamable-http" } } } },
        null,
        2,
      ),
    useCases: [
      "Rotina diária automatizada de revisão do CRM.",
      "Criação de tarefas a partir de decisões tomadas pelo agente.",
      "Consulta de métricas sem abrir a plataforma.",
    ],
  },

};

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        toast.success(`${label} copiado.`);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
      Copiar {label}
    </Button>
  );
}

export function AgentMcpPanel({
  provider,
  open,
  onOpenChange,
}: {
  provider: AgentProvider | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mcpUrl = useMemo(() => {
    const origin = typeof window === "undefined" ? "https://saude-slim.local" : window.location.origin;
    return `${origin}/mcp`;
  }, []);

  const meta = provider ? PROVIDERS[provider] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            {meta?.name ?? "Agente de IA"}
          </DialogTitle>
          <DialogDescription>{meta?.tagline}</DialogDescription>
        </DialogHeader>

        {meta && (
          <Tabs defaultValue="conectar" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="conectar">Conectar</TabsTrigger>
              <TabsTrigger value="ferramentas">O que ele pode fazer</TabsTrigger>
              <TabsTrigger value="usos">Exemplos de uso</TabsTrigger>
            </TabsList>

            <TabsContent value="conectar" className="space-y-4 pt-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Endereço do servidor Vanessa Simoni</p>
                <code className="mt-1 block break-all rounded bg-background px-2 py-1 text-xs">{mcpUrl}</code>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyBtn text={mcpUrl} label="endereço" />
                  <Button asChild size="sm" variant="ghost">
                    <a href={meta.docs} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-3.5 w-3.5" /> Documentação oficial
                    </a>
                  </Button>
                </div>
              </div>

              <ol className="space-y-2 text-sm">
                {meta.steps.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ol>

              {meta.command && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Comando no terminal</p>
                  <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                    {meta.command.replace("{URL}", mcpUrl)}
                  </pre>
                  <CopyBtn text={meta.command.replace("{URL}", mcpUrl)} label="comando" />
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Ou cole em {meta.configPath}
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{meta.config(mcpUrl)}</pre>
                <CopyBtn text={meta.config(mcpUrl)} label="configuração" />
              </div>

              <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                A conexão usa login da sua própria conta Vanessa Simoni. O agente só enxerga o workspace que estiver ativo para
                você, nunca dados de outro cliente. Você pode recusar ou revogar o acesso quando quiser.
              </p>
            </TabsContent>

            <TabsContent value="ferramentas" className="space-y-2 pt-4">
              {MCP_TOOLS.map((t) => (
                <div key={t.name} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[11px]">{t.name}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="usos" className="space-y-2 pt-4">
              {meta.useCases.map((u) => (
                <div key={u} className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                  {u}
                </div>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">
                Dica: peça sempre para o agente rodar workspace_info primeiro, assim ele confirma em qual conta está
                mexendo antes de criar qualquer coisa.
              </p>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
