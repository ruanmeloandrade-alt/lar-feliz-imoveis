import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { vanessaClientPhotos, type ClientPhoto } from "@/lib/client-photos";
export default function ClientPhotoGallery() {
  const [selected, setSelected] = useState<ClientPhoto | null>(null);
  if (!vanessaClientPhotos.length) return null;
  return (
    <>
      <div
        className="vs-client-gallery"
        aria-label="Fotos da Vanessa com clientes"
      >
        {vanessaClientPhotos.map((photo, index) => (
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
