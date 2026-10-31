import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type ClientPhoto } from "@/lib/client-photos";
export default function ClientPhotoGallery() {
  const [selected, setSelected] = useState<ClientPhoto | null>(null);
  const [photos, setPhotos] = useState<ClientPhoto[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/client-gallery", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw Error("Galeria indisponível");
        return response.json();
      })
      .then((result) => {
        if (Array.isArray(result.photos))
          setPhotos(
            result.photos.filter(
              (photo: ClientPhoto) =>
                typeof photo.src === "string" &&
                /^\/api\/client-gallery-media\/\d{13}-[a-f0-9-]{36}\.(jpg|png|webp)$/.test(photo.src),
            ),
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!photos.length) return null;
  return (
    <>
      <div
        className="vs-client-gallery"
        aria-label="Fotos da Vanessa com clientes"
      >
        {photos.map((photo, index) => (
          <button
            type="button"
            key={photo.src}
            onClick={() => setSelected(photo)}
            aria-label={
              "Ampliar foto " + (index + 1) + " da Vanessa com clientes"
            }
          >
            <img
              src={photo.src}
              alt={photo.alt}
              loading="lazy"
              decoding="async"
              style={{
                objectPosition: photo.position ?? "center",
                objectFit: photo.fit ?? "cover",
              }}
            />
          </button>
        ))}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent
          className="vs-client-lightbox"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Vanessa com clientes</DialogTitle>
          {selected && <img src={selected.src} alt={selected.alt} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
