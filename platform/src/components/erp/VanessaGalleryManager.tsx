import { useEffect, useState } from "react";
import { Images, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Photo = { name: string; src: string; alt: string };
export function VanessaGalleryManager() {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function request(path: string, init: RequestInit = {}) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw Error("Entre novamente para gerenciar a galeria.");
    const response = await fetch(path, {
      ...init,
      headers: { ...init.headers, Authorization: "Bearer " + data.session.access_token },
      signal: AbortSignal.timeout(45000),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Não foi possível atualizar a galeria.");
    return result;
  }
  async function load() {
    const result = await request("/api/site-gallery");
    setPhotos(result.photos);
  }
  useEffect(() => {
    if (open) {
      setMessage("");
      setBusy(true);
      load()
        .catch((error) => setMessage(error.message))
        .finally(() => setBusy(false));
    }
  }, [open]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage("");
    let added = 0;
    try {
      for (const file of Array.from(files)) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 8 * 1024 * 1024
        )
          throw Error("Use fotos JPG, PNG ou WebP de até 8 MB.");
        await request("/api/site-gallery", {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        added++;
      }
      setMessage(added === 1 ? "Foto adicionada ao site." : `${added} fotos adicionadas ao site.`);
    } catch (error) {
      setMessage(
        (added ? `${added} foto(s) salva(s). ` : "") +
          (error instanceof Error ? error.message : "Falha no envio."),
      );
    } finally {
      await load().catch(() =>
        setMessage("Envio concluído; reabra a galeria para atualizar a visualização."),
      );
      setBusy(false);
    }
  }
  async function hide(photo: Photo) {
    setBusy(true);
    setMessage("");
    try {
      await request("/api/site-gallery/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: photo.name }),
      });
      await load();
      setMessage("Foto retirada do site e preservada no arquivo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ocultar a foto.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm"
        onClick={() => setOpen(true)}
      >
        <Images size={17} />
        Galeria do site
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[88dvh] max-w-3xl overflow-y-auto"
          aria-describedby={undefined}
        >
          <DialogTitle>Fotos com clientes</DialogTitle>
          <p className="text-sm text-muted-foreground">
            As fotos aparecem abaixo dos depoimentos no site, em miniaturas quadradas. A ampliação
            preserva a imagem inteira.
          </p>
          <label
            className={
              "inline-flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-3 text-sm text-primary-foreground " +
              (busy ? "opacity-50" : "cursor-pointer")
            }
          >
            <Upload size={17} />
            {busy ? "Atualizando galeria…" : "Adicionar fotos"}
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy}
              onChange={(event) => {
                void upload(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">JPG, PNG ou WebP. Até 8 MB por foto.</p>
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {photos.map((photo) => (
              <figure key={photo.name} className="overflow-hidden rounded-md border">
                <img
                  className="aspect-square w-full object-cover"
                  src={photo.src}
                  alt={photo.alt}
                />
                <button
                  type="button"
                  className="w-full px-2 py-2 text-xs hover:bg-muted disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void hide(photo)}
                >
                  Retirar do site
                </button>
              </figure>
            ))}
          </div>
          {!busy && !photos.length && !message && (
            <p className="text-sm">Nenhuma foto publicada. Adicione a primeira foto acima.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
