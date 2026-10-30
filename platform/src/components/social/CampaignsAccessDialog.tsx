import { useEffect, useRef, type ComponentProps } from "react";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { CampaignsDialog as FullCampaignsDialog } from "./CampaignsDialog";

export type { PostDraft, PostItem } from "./CampaignsDialog";

type Props = ComponentProps<typeof FullCampaignsDialog>;

/**
 * Cliente final continua com estratégia, texto, calendário, canais e upload manual.
 * Apenas controles de geração visual e motores de imagem ficam restritos ao super_admin.
 */
export function CampaignsDialog(props: Props) {
  const { isSuperAdmin, loaded } = useIsSuperAdmin();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!loaded || isSuperAdmin || !rootRef.current) return;
    const root = rootRef.current;
    const sanitizeCopy = () => {
      root.querySelectorAll<HTMLTextAreaElement>('textarea[placeholder*="prompt de imagem"]').forEach((field) => {
        field.placeholder = "O que este post precisa dizer? A IA usará isso para gerar título, legenda, hashtags e comentário.";
      });
      root.querySelectorAll<HTMLElement>('[title*="Usando "]').forEach((element) => {
        element.removeAttribute("title");
      });
    };
    sanitizeCopy();
    const observer = new MutationObserver(sanitizeCopy);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [loaded, isSuperAdmin]);

  if (!loaded) return null;
  if (isSuperAdmin) return <FullCampaignsDialog {...props} />;

  return (
    <div ref={rootRef} className="mkton-customer-social-campaigns contents">
      <style>{`
        .mkton-customer-social-campaigns section[class*="space-y-3"][class*="border-primary/20"][class*="bg-primary/5"] > :nth-child(1),
        .mkton-customer-social-campaigns section[class*="space-y-3"][class*="border-primary/20"][class*="bg-primary/5"] > :nth-child(2) {
          display: none !important;
        }
        .mkton-customer-social-campaigns section[class*="space-y-3"][class*="border-primary/20"][class*="bg-primary/5"] > :nth-child(3) > :first-child > :last-child > :nth-child(n+2) {
          display: none !important;
        }
        .mkton-customer-social-campaigns section[class*="space-y-3"][class*="border-primary/20"][class*="bg-primary/5"] > :nth-child(3) > :last-child {
          display: none !important;
        }
        .mkton-customer-social-campaigns section[class*="rounded-lg"][class*="bg-card"][class*="space-y-3"] > div[class*="border-t"][class*="pt-2"] {
          display: none !important;
        }
        .mkton-customer-social-campaigns div[class*="grid-cols-1"][class*="sm:grid-cols-3"] > div:nth-child(3) {
          display: none !important;
        }
        .mkton-customer-social-campaigns div[class*="grid-cols-1"][class*="sm:grid-cols-3"] {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
      `}</style>
      <FullCampaignsDialog {...props} />
    </div>
  );
}
