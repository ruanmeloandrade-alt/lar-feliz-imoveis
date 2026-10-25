import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2, Search, Trash2, Phone, Mail, MapPin, Wallet, Briefcase,
  Landmark, FileCheck2, Home as HomeIcon, MessageCircle, Calendar as CalIcon,
} from "lucide-react";
import { waUrl } from "@/lib/brand";

export type Lead = {
  id: string;
  created_at: string;
  nome: string;
  whatsapp: string;
  email: string | null;
  renda: number | null;
  tipo_trabalho: string | null;
  fgts: string | null;
  cpf_limpo: string | null;
  possui_imovel: string | null;
  cidade: string | null;
  entrada: number | null;
  faixa: string | null;
  subsidio_resultado: string | null;
  produto_interesse: string | null;
  observacoes: string | null;
};

const money = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const useLeads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setLeads((data ?? []) as Lead[]);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, []);

  return { leads, loading, refetch: fetchLeads };
};

const LeadCard = ({ lead, onOpen }: { lead: Lead; onOpen: (l: Lead) => void }) => (
  <button
    onClick={() => onOpen(lead)}
    className="w-full text-left bg-card rounded-lg border border-border p-4 hover:border-primary hover:shadow-card transition-all"
  >
    <div className="flex items-start justify-between gap-2 mb-2">
      <div className="min-w-0">
        <h3 className="font-heading font-bold text-foreground truncate">{lead.nome}</h3>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          <Phone className="w-3 h-3" /> {lead.whatsapp}
        </p>
      </div>
      {lead.faixa && (
        <span className="shrink-0 bg-primary/10 text-primary text-[10px] font-bold uppercase px-2 py-1 rounded">
          {lead.faixa}
        </span>
      )}
    </div>
    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-2">
      {lead.cidade && (
        <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{lead.cidade}</span>
      )}
      {lead.renda != null && (
        <span className="flex items-center gap-1"><Wallet className="w-3 h-3 shrink-0" />{money(lead.renda)}</span>
      )}
    </div>
    <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
      <CalIcon className="w-3 h-3" /> {fmtDate(lead.created_at)}
    </p>
  </button>
);

const LeadDialog = ({ lead, onClose, onDelete }: { lead: Lead | null; onClose: () => void; onDelete: (id: string) => void }) => {
  if (!lead) return null;
  const row = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 text-primary">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
        <p className="text-sm text-foreground break-words">{value || "—"}</p>
      </div>
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{lead.nome}</DialogTitle>
          <p className="text-xs text-muted-foreground">Cadastrado em {fmtDate(lead.created_at)}</p>
        </DialogHeader>

        <div className="mt-3">
          {row(<Phone className="w-4 h-4" />, "WhatsApp", lead.whatsapp)}
          {row(<Mail className="w-4 h-4" />, "E-mail", lead.email)}
          {row(<MapPin className="w-4 h-4" />, "Cidade / região", lead.cidade)}
          {row(<Wallet className="w-4 h-4" />, "Renda familiar", money(lead.renda))}
          {row(<Briefcase className="w-4 h-4" />, "Tipo de trabalho", lead.tipo_trabalho)}
          {row(<Landmark className="w-4 h-4" />, "Possui FGTS", lead.fgts)}
          {row(<FileCheck2 className="w-4 h-4" />, "CPF sem restrições", lead.cpf_limpo)}
          {row(<HomeIcon className="w-4 h-4" />, "Já possui imóvel", lead.possui_imovel)}
          {row(<Wallet className="w-4 h-4" />, "Entrada disponível", money(lead.entrada))}
          {row(<FileCheck2 className="w-4 h-4" />, "Faixa provável", lead.faixa)}
          {row(<FileCheck2 className="w-4 h-4" />, "Resultado subsídio", lead.subsidio_resultado)}
        </div>

        <div className="flex gap-2 mt-4 sticky bottom-0 bg-background pt-2">
          <a
            href={waUrl(`Olá ${lead.nome.split(" ")[0]}, tudo bem? Sou a Vanessa da corretora MCMV, vi seu cadastro no site.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button variant="whatsapp" className="w-full">
              <MessageCircle className="w-4 h-4" /> Chamar no WhatsApp
            </Button>
          </a>
          <Button
            variant="outline"
            onClick={() => {
              if (confirm(`Excluir a ficha de ${lead.nome}?`)) {
                onDelete(lead.id);
                onClose();
              }
            }}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const LeadsList = () => {
  const { leads, loading, refetch } = useLeads();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Lead | null>(null);

  const filtered = leads.filter((l) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return [l.nome, l.whatsapp, l.email, l.cidade, l.faixa].some((v) => v && v.toLowerCase().includes(s));
  });

  const remove = async (id: string) => {
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Ficha removida."); refetch(); }
  };

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground">Fichas de clientes</h2>
          <p className="text-xs text-muted-foreground">{leads.length} cadastrada{leads.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="relative w-72 max-w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, cidade..." className="pl-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center text-muted-foreground text-sm">
          {leads.length === 0 ? "Nenhum lead cadastrado ainda." : "Nenhum resultado para essa busca."}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((l) => <LeadCard key={l.id} lead={l} onOpen={setOpen} />)}
        </div>
      )}

      <LeadDialog lead={open} onClose={() => setOpen(null)} onDelete={remove} />
    </div>
  );
};

// ============ Calendário ============
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEK = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

export const LeadsCalendar = () => {
  const { leads, loading, refetch } = useLeads();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [open, setOpen] = useState<Lead | null>(null);

  const remove = async (id: string) => {
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Ficha removida."); refetch(); }
  };

  const byDay = new Map<string, Lead[]>();
  for (const l of leads) {
    const d = new Date(l.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(l);
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = first.getDay();
  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (d: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground">Calendário de leads</h2>
          <p className="text-xs text-muted-foreground">Veja quando cada cliente chegou.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</Button>
          <span className="font-heading font-semibold text-foreground min-w-[160px] text-center">
            {MONTHS[month]} {year}
          </span>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</Button>
        </div>
      </div>


      <div className="bg-card border border-border rounded-xl p-3 md:p-5">
        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
          {WEEK.map((w) => (
            <div key={w} className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase text-center py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} className="aspect-square rounded-md bg-muted/40" />;
            const key = `${year}-${month}-${d}`;
            const dayLeads = byDay.get(key) ?? [];
            return (
              <div
                key={i}
                className={`aspect-square rounded-md border p-1.5 flex flex-col overflow-hidden ${
                  isToday(d) ? "border-primary bg-primary/5" : "border-border bg-background"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className={isToday(d) ? "text-primary" : "text-foreground"}>{d}</span>
                  {dayLeads.length > 0 && (
                    <span className="bg-accent text-accent-foreground rounded-full px-1.5 min-w-[16px] text-center leading-tight">
                      {dayLeads.length}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex-1 flex flex-col gap-0.5 overflow-hidden">
                  {dayLeads.slice(0, 3).map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setOpen(l)}
                      className="text-[9px] md:text-[10px] leading-tight text-left truncate rounded px-1 py-0.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition"
                      title={l.nome}
                    >
                      {l.nome.split(" ")[0]}
                    </button>
                  ))}
                  {dayLeads.length > 3 && (
                    <span className="text-[9px] text-muted-foreground">+{dayLeads.length - 3}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LeadDialog lead={open} onClose={() => setOpen(null)} onDelete={remove} />
    </div>
  );
};
