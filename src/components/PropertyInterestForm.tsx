import { useState, type FormEvent } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { waUrl } from "@/lib/brand";
import { trackPublicEvent } from "@/lib/public-site";
import type { Property } from "@/types/property";

type Props = {
  property: Pick<Property, "id" | "title" | "city">;
  onBack: () => void;
  onContinue?: (url: string) => void;
};
async function chatPost(body: Record<string, unknown>) {
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),30000);
  try{
  const response = await fetch("/api/public/vanessa-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(
      typeof data.error === "string"
        ? data.error
        : "Não foi possível salvar seu contato. Tente novamente.",
    );
  return data;
  }finally{window.clearTimeout(timeout);}
}
export default function PropertyInterestForm({
  property,
  onBack,
  onContinue = (url) => window.location.assign(url),
}: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const digits = phone.replace(/\D/g, "");
    if (name.trim().length < 2 || !/^\d{10,15}$/.test(digits)) {
      setError("Informe seu nome e WhatsApp com DDD.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let current = token;
      if (!current) {
        const started = await chatPost({
          action: "start",
          propertyId: property.id,
        });
        if (typeof started.token !== "string")
          throw Error("Não foi possível iniciar o atendimento.");
        current = started.token;
        setToken(current);
      }
      const saved = await chatPost({
        action: "contact",
        token: current,
        name: name.trim(),
        phone,
        consent: true,
      });
      if (!saved.registered)
        throw Error("Não foi possível confirmar o cadastro. Tente novamente.");
      trackPublicEvent(saved.leadCreated ? "lead" : "site_contact_updated", {
        source: "site-property",
        product_id: property.id,
        product_name: property.title,
      });
      trackPublicEvent("whatsapp_click", {
        product_id: property.id,
        product_name: property.title,
      });
      onContinue(
        waUrl(
          `Olá Vanessa, sou ${name.trim()} e tenho interesse no imóvel "${property.title}" em ${property.city}.`,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar. Tente novamente.",
      );
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="vs-property-contact"
      aria-label="Cadastro para atendimento do imóvel"
    >
      <h3>Vamos conversar sobre este imóvel?</h3>
      <p>Deixe seu nome e WhatsApp para continuar com a Vanessa.</p>
      <label htmlFor={"interest-name-" + property.id}>Nome</label>
      <input
        id={"interest-name-" + property.id}
        name="name"
        autoComplete="name"
        autoFocus
        maxLength={120}
        required
        minLength={2}
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={busy}
      />
      <label htmlFor={"interest-phone-" + property.id}>WhatsApp com DDD</label>
      <input
        id={"interest-phone-" + property.id}
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        maxLength={30}
        required
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        disabled={busy}
      />
      {error && <p role="alert">{error}</p>}
      <Button
        type="submit"
        variant="whatsapp"
        size="lg"
        className="w-full"
        disabled={busy}
      >
        <MessageCircle className="h-4 w-4" />
        {busy ? "Salvando seu contato…" : "Continuar no WhatsApp"}
      </Button>
      <small>
        Ao continuar, você solicita atendimento sobre este imóvel pelo WhatsApp
        informado.
      </small>
      <button
        type="button"
        className="vs-property-contact-back"
        disabled={busy}
        onClick={onBack}
      >
        Voltar ao imóvel
      </button>
    </form>
  );
}
