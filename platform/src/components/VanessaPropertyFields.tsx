import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { vanessaPropertySchema, type VanessaProperty } from "@/lib/vanessa-property";
const control = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
export function VanessaPropertyFields({
  value,
  onChange,
  onCoverChange,
  onBusy,
}: {
  value?: VanessaProperty;
  onChange: (v: VanessaProperty) => void;
  onCoverChange: (v: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const property = value ?? vanessaPropertySchema.parse({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof VanessaProperty, v: unknown) => onChange({ ...property, [key]: v });
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw Error("Entre novamente.");
      const photos = [...property.images],
        pdfs = [...property.pdfs];
      for (const file of Array.from(files)) {
        const ext = (
          {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
            "video/mp4": "mp4",
            "application/pdf": "pdf",
          } as Record<string, string>
        )[file.type];
        if (!ext || file.size > 50 * 1024 * 1024)
          throw Error("Envie JPG, PNG, WebP, GIF, MP4 ou PDF de até 50 MB.");
        if ((ext === "pdf" ? pdfs.length : photos.length) >= (ext === "pdf" ? 10 : 40))
          throw Error("Limite de arquivos por imóvel atingido.");
        const path = user.id + "/" + crypto.randomUUID() + "." + ext;
        const { error } = await supabase.storage
          .from("vanessa-listings")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw Error("Não foi possível enviar " + file.name + ". " + error.message);
        const url = "/api/listing-media/" + path;
        (ext === "pdf" ? pdfs : photos).push(url);
        // Preserve every successful upload in the form even if a later file fails.
        onChange({ ...property, images: [...photos], pdfs: [...pdfs] });
      }
      if (photos[0]) onCoverChange(photos[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar mídia.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-lg border border-border p-4">
      <h3 className="font-semibold">Publicação no site · Imóvel</h3>
      <label className="flex gap-2 items-center text-sm">
        <input
          type="checkbox"
          checked={property.published}
          onChange={(e) => set("published", e.target.checked)}
        />
        Publicar no site principal
      </label>
      <p className="text-xs text-muted-foreground">
        Um imóvel ativo e publicado aparece automaticamente no site após salvar. Desmarque para
        manter como rascunho.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["city", "Cidade"],
          ["neighborhood", "Bairro"],
          ["address", "Endereço"],
          ["tag", "Destaque / selo"],
        ].map(([key, label]) => (
          <label key={key} className="text-xs space-y-1">
            {label}
            <input
              aria-label={label}
              className={control}
              value={String(property[key as keyof VanessaProperty] ?? "")}
              onChange={(e) => set(key as keyof VanessaProperty, e.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          ["bedrooms", "Quartos"],
          ["bathrooms", "Banheiros"],
          ["kitchens", "Cozinhas"],
          ["living_rooms", "Salas"],
          ["area_m2", "Área (m²)"],
          ["subsidy_estimate", "Subsídio estimado"],
          ["monthly_parcel", "Parcela mensal"],
          ["down_payment", "Entrada"],
        ].map(([key, label]) => (
          <label key={key} className="text-xs space-y-1">
            {label}
            <input
              aria-label={label}
              type="number"
              min="0"
              step={
                ["bedrooms", "bathrooms", "kitchens", "living_rooms"].includes(key) ? "1" : "0.01"
              }
              className={control}
              value={(property[key as keyof VanessaProperty] as number) ?? ""}
              onChange={(e) =>
                set(
                  key as keyof VanessaProperty,
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">
          Situação da obra
          <select
            aria-label="Situação da obra"
            className={control}
            value={property.construction_status}
            onChange={(e) => set("construction_status", e.target.value)}
          >
            <option value="na_planta">Na planta / em construção</option>
            <option value="pronto">Pronto</option>
          </select>
        </label>
        <label className="text-xs">
          Previsão de entrega
          <input
            aria-label="Previsão de entrega"
            type="date"
            className={control}
            value={property.launch_date ?? ""}
            onChange={(e) => set("launch_date", e.target.value || null)}
          />
        </label>
      </div>
      <div className="flex gap-4 text-xs">
        {[
          ["show_parcel", "Exibir parcela"],
          ["show_down_payment", "Exibir entrada"],
        ].map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={Boolean(property[key as keyof VanessaProperty])}
              onChange={(e) => set(key as keyof VanessaProperty, e.target.checked)}
            />{" "}
            {label}
          </label>
        ))}
      </div>
      <div>
        <span className="text-xs font-semibold">Fotos, vídeos e PDFs do empreendimento</span>
        <input
          aria-label="Enviar fotos, vídeos e PDFs"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,application/pdf"
          disabled={busy}
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = "";
          }}
          className="mt-2 block w-full text-xs"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {busy
            ? "Enviando arquivos..."
            : "Até 40 fotos/vídeos e 10 PDFs. A primeira foto é a capa."}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {property.images.map((url, index) => (
          <div key={url} className="border rounded p-1">
            {/\.mp4$/.test(url) ? (
              <video src={url} className="h-16 w-full object-cover" />
            ) : (
              <img src={url} alt={"Foto " + (index + 1)} className="h-16 w-full object-cover" />
            )}
            <button
              type="button"
              className="text-xs"
              onClick={() => {
                const images = property.images.filter((x) => x !== url);
                set("images", images);
                onCoverChange(images[0] ?? "");
              }}
            >
              Remover foto {index + 1}
            </button>
          </div>
        ))}
      </div>
      {property.pdfs.map((url, index) => (
        <div key={url} className="flex justify-between text-xs">
          <a href={url} target="_blank" rel="noreferrer">
            PDF {index + 1}
          </a>
          <button
            type="button"
            onClick={() =>
              set(
                "pdfs",
                property.pdfs.filter((x) => x !== url),
              )
            }
          >
            Remover PDF
          </button>
        </div>
      ))}
      <div className="space-y-2">
        <span className="text-xs font-semibold">Opções de planta</span>
        {property.plans.map((plan, index) => (
          <div key={index} className="flex gap-2">
            <input
              aria-label={"Nome da planta " + (index + 1)}
              className={control}
              value={plan.name}
              onChange={(e) =>
                set(
                  "plans",
                  property.plans.map((p, i) => (i === index ? { ...p, name: e.target.value } : p)),
                )
              }
            />
            <input
              aria-label={"Área da planta " + (index + 1)}
              type="number"
              min="0"
              step="0.01"
              className={control}
              value={plan.area_m2 ?? ""}
              onChange={(e) =>
                set(
                  "plans",
                  property.plans.map((p, i) =>
                    i === index
                      ? { ...p, area_m2: e.target.value === "" ? null : Number(e.target.value) }
                      : p,
                  ),
                )
              }
            />
            <button
              type="button"
              onClick={() =>
                set(
                  "plans",
                  property.plans.filter((_, i) => i !== index),
                )
              }
            >
              Remover
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-xs underline"
          onClick={() => set("plans", [...property.plans, { name: "", area_m2: null }])}
        >
          Adicionar opção de planta
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}
