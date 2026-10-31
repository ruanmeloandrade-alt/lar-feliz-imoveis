import { useState } from "react";
import { ArrowRight, ArrowLeft, ShieldCheck, CheckCircle2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { apiClient } from "@/lib/api-client";
import { openVanessaChat, trackPublicEvent } from "@/lib/public-site";
type Profile = {
  renda: string;
  tipoTrabalho: string;
  fgts: string;
  fgtsValor: string;
  cpfLimpo: string;
  possuiImovel: string;
  cidade: string;
  entrada: string;
  nome: string;
  whatsapp: string;
};
const initial: Profile = {
  renda: "",
  tipoTrabalho: "",
  fgts: "",
  fgtsValor: "",
  cpfLimpo: "",
  possuiImovel: "",
  cidade: "",
  entrada: "",
  nome: "",
  whatsapp: "",
};
const questions = [
  "Qual é a renda mensal da sua família?",
  "Como você trabalha hoje?",
  "Você pretende usar o FGTS?",
  "Como está a situação do seu CPF?",
  "Você já tem um imóvel no seu nome?",
  "Em qual cidade você quer morar?",
  "Quanto pretende usar como entrada?",
  "Vamos dar o próximo passo?",
];
const hints = [
  "Considere a soma da renda de quem vai participar da compra.",
  "Essa informação ajuda a preparar a orientação e a documentação.",
  "Informe apenas o saldo que você conhece. Não precisa estimar.",
  "Não pedimos o número do seu CPF nesta etapa.",
  "Conte como está sua situação hoje. A análise será individual.",
  "Vamos buscar opções próximas de onde você quer construir sua história.",
  "Pode incluir os recursos que já reservou. Se ainda não definiu, pode continuar.",
  "Deixe seu nome e WhatsApp para a Vanessa continuar sua pré-análise.",
];
const digits = (s: string) => s.replace(/\D/g, "");
const amount = (s: string) => (digits(s) ? Number(digits(s)) : null);
const moneyInput = (s: string) =>
  digits(s) ? Number(digits(s)).toLocaleString("pt-BR") : "";
function formatPhone(s: string) {
  const d = digits(s).slice(0, 11);
  if (d.length < 3) return d;
  if (d.length < 8) return "(" + d.slice(0, 2) + ") " + d.slice(2);
  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
}
const AnaliseSection = () => {
  const [step, setStep] = useState(0),
    [data, setData] = useState<Profile>(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const update = (key: keyof Profile, value: string) =>
    setData((d) => ({ ...d, [key]: value }));
  const valid = [
    !!data.renda,
    !!data.tipoTrabalho,
    !!data.fgts && (data.fgts !== "Sim" || !!data.fgtsValor),
    !!data.cpfLimpo,
    !!data.possuiImovel,
    data.cidade.trim().length > 1,
    true,
    data.nome.trim().length > 1 && digits(data.whatsapp).length >= 10,
  ];
  async function next() {
    if (busy || !valid[step]) return;
    setError("");
    trackPublicEvent("pre_analysis_step", { step: step + 1 });
    if (step < 7) {
      setStep(step + 1);
      return;
    }
    const firstInvalid = valid.findIndex((v) => !v);
    if (firstInvalid >= 0) {
      setStep(firstInvalid);
      return;
    }
    setBusy(true);
    try {
      const { error } = await apiClient.from("leads").insert({
        nome: data.nome.trim(),
        whatsapp: data.whatsapp.trim(),
        renda: amount(data.renda),
        tipo_trabalho: data.tipoTrabalho,
        fgts:
          data.fgts === "Sim" ? "Sim (R$ " + data.fgtsValor + ")" : data.fgts,
        cpf_limpo: data.cpfLimpo,
        possui_imovel: data.possuiImovel,
        cidade: data.cidade.trim(),
        entrada: amount(data.entrada),
        faixa: null,
        subsidio_resultado: null,
        produto_interesse: "Pré-análise de perfil imobiliário",
        observacoes:
          "Contato solicitado pelo formulário do site. Cliente autorizou retorno por WhatsApp.",
      });
      if (error)
        throw Error(
          "Não conseguimos enviar agora. Confira sua conexão e tente novamente.",
        );
      setDone(true);
      trackPublicEvent("lead", {
        form: "pre-analise",
        city: data.cidade,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível enviar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  const choose = (key: keyof Profile, options: Array<[string, string]>) => (
    <div className="vs-form-grid">
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          className="vs-choice"
          data-selected={data[key] === value}
          onClick={() => update(key, value)}
        >
          <span>{label}</span>
          <span aria-hidden="true" />
        </button>
      ))}
    </div>
  );
  return (
    <section id="analise" className="vs-analysis">
      <div className="container vs-analysis-grid">
        <div className="vs-analysis-intro">
          <span className="vs-eyebrow">Um passo de cada vez</span>
          <h2>
            Seu plano merece
            <br />
            uma orientação
            <br />
            <em>feita para você.</em>
          </h2>
          <p>
            Conte um pouco sobre seu momento. Com essas informações, a Vanessa
            prepara uma conversa mais objetiva sobre os imóveis e os próximos
            passos da sua compra.
          </p>
          <p className="vs-form-privacy">
            <ShieldCheck size={15} />
            <span>
              Pré-análise gratuita e sem compromisso. As condições de
              financiamento dependem da avaliação da instituição financeira.
            </span>
          </p>
        </div>
        <div>
          <div className="vs-analysis-card">
            <div className="vs-form-top">
              <div className="vs-form-step">
                <span>
                  {done ? "Solicitação enviada" : "Seu perfil imobiliário"}
                </span>
                <span>
                  {done ? "Concluído" : "Etapa " + (step + 1) + " de 8"}
                </span>
              </div>
              <div className="vs-progress">
                <span
                  style={{
                    width: done ? "100%" : ((step + 1) / 8) * 100 + "%",
                  }}
                />
              </div>
            </div>
            <div className="vs-form-body">
              {done ? (
                <>
                  <CheckCircle2 size={36} className="text-primary mb-5" />
                  <h3>
                    Recebemos seu perfil,
                    <br />
                    {data.nome.split(" ")[0]}.
                  </h3>
                  <p className="vs-form-hint">
                    Suas informações já estão com a Vanessa. O próximo passo é
                    conversar sobre as opções e conferir as condições para o seu
                    caso.
                  </p>
                  <dl className="vs-form-summary">
                    <div>
                      <dt>Cidade desejada</dt>
                      <dd>{data.cidade}</dd>
                    </div>
                    <div>
                      <dt>Renda familiar informada</dt>
                      <dd>R$ {data.renda}</dd>
                    </div>
                    <div>
                      <dt>Entrada informada</dt>
                      <dd>
                        {data.entrada ? "R$ " + data.entrada : "A definir"}
                      </dd>
                    </div>
                    <div>
                      <dt>Retorno pelo WhatsApp</dt>
                      <dd>{data.whatsapp}</dd>
                    </div>
                  </dl>
                  <button
                    className="vs-button w-full"
                    onClick={() =>
                      openVanessaChat({ name: data.nome, phone: data.whatsapp })
                    }
                  >
                    Continuar meu atendimento
                    <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <>
                  <h3>{questions[step]}</h3>
                  <p className="vs-form-hint">{hints[step]}</p>
                  {step === 0 && (
                    <label>
                      <span className="vs-form-label">
                        Renda familiar mensal (R$)
                      </span>
                      <input
                        aria-label="Renda familiar mensal"
                        className="vs-form-input"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Ex.: 4.500"
                        value={data.renda}
                        onChange={(e) =>
                          update("renda", moneyInput(e.target.value))
                        }
                      />
                    </label>
                  )}
                  {step === 1 &&
                    choose("tipoTrabalho", [
                      ["CLT", "Trabalho com carteira assinada"],
                      ["Autônomo", "Sou autônomo(a)"],
                      ["MEI", "Sou MEI / empresário(a)"],
                      ["Informal", "Trabalho de forma informal"],
                      ["Aposentado", "Sou aposentado(a) / pensionista"],
                      ["Outros", "Outra situação"],
                    ])}
                  {step === 2 && (
                    <>
                      {choose("fgts", [
                        ["Sim", "Sim, tenho saldo de FGTS"],
                        ["Não", "Não tenho saldo disponível"],
                        ["Não sei", "Ainda não sei meu saldo"],
                      ])}
                      {data.fgts === "Sim" && (
                        <label className="block mt-5">
                          <span className="vs-form-label">
                            Saldo informado de FGTS (R$)
                          </span>
                          <input
                            aria-label="Saldo de FGTS"
                            className="vs-form-input"
                            inputMode="numeric"
                            value={data.fgtsValor}
                            onChange={(e) =>
                              update("fgtsValor", moneyInput(e.target.value))
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                  {step === 3 &&
                    choose("cpfLimpo", [
                      ["Sim", "Sem restrições"],
                      ["Não", "Tenho restrições"],
                      ["Estou regularizando", "Estou regularizando"],
                    ])}
                  {step === 4 &&
                    choose("possuiImovel", [
                      ["Não", "Não, será meu primeiro imóvel"],
                      ["Sim", "Sim, já tenho um imóvel"],
                    ])}
                  {step === 5 && (
                    <>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {BRAND.cities.map((city) => (
                          <button
                            type="button"
                            key={city}
                            className="vs-choice"
                            data-selected={data.cidade === city}
                            onClick={() => update("cidade", city)}
                          >
                            <span>{city}</span>
                            <span />
                          </button>
                        ))}
                      </div>
                      <input
                        aria-label="Cidade desejada"
                        className="vs-form-input"
                        placeholder="Ou informe outra cidade"
                        value={data.cidade}
                        onChange={(e) => update("cidade", e.target.value)}
                      />
                    </>
                  )}
                  {step === 6 && (
                    <label>
                      <span className="vs-form-label">
                        Valor disponível para entrada (R$)
                      </span>
                      <input
                        aria-label="Entrada disponível"
                        className="vs-form-input"
                        inputMode="numeric"
                        placeholder="Ainda não defini"
                        value={data.entrada}
                        onChange={(e) =>
                          update("entrada", moneyInput(e.target.value))
                        }
                      />
                    </label>
                  )}
                  {step === 7 && (
                    <div className="vs-form-grid">
                      <label>
                        <span className="vs-form-label">Seu nome</span>
                        <input
                          aria-label="Seu nome"
                          autoComplete="name"
                          className="vs-form-input"
                          maxLength={120}
                          value={data.nome}
                          onChange={(e) => update("nome", e.target.value)}
                        />
                      </label>
                      <label>
                        <span className="vs-form-label">WhatsApp com DDD</span>
                        <input
                          aria-label="Seu WhatsApp"
                          autoComplete="tel"
                          inputMode="tel"
                          className="vs-form-input"
                          placeholder="(19) 99999-9999"
                          value={data.whatsapp}
                          onChange={(e) =>
                            update("whatsapp", formatPhone(e.target.value))
                          }
                        />
                      </label>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Ao enviar, você solicita a pré-análise e o retorno da
                        Vanessa pelo WhatsApp informado.
                      </p>
                    </div>
                  )}
                  {error && (
                    <p role="alert" className="mt-5 text-sm text-red-700">
                      {error}
                    </p>
                  )}
                </>
              )}
            </div>
            {!done && (
              <div className="vs-form-footer">
                <button
                  type="button"
                  disabled={step === 0 || busy}
                  onClick={() => {
                    setStep(step - 1);
                    setError("");
                  }}
                >
                  <ArrowLeft size={14} />
                  Voltar
                </button>
                <button
                  type="button"
                  className="vs-button"
                  disabled={busy || !valid[step]}
                  onClick={next}
                >
                  {busy
                    ? "Enviando..."
                    : step === 7
                      ? "Enviar pré-análise"
                      : "Continuar"}
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </div>
          <p className="vs-form-privacy">
            <ShieldCheck size={14} />
            <span>
              Seus dados são usados para atender esta solicitação. Este
              formulário não aprova crédito nem garante subsídio.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
};
export default AnaliseSection;
