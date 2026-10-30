import { useEffect, type ComponentProps } from "react";
import { InboxPage as LegacyInboxPage } from "./InboxPage.legacy";

export * from "./InboxPage.legacy";

type InboxPageProps = ComponentProps<typeof LegacyInboxPage>;

/**
 * Camada visual conservadora do hotfix de entrega.
 *
 * O Inbox legado desenhava `CheckCheck` para toda mensagem própria, mesmo quando
 * a Evolution só tinha aceitado a requisição (PENDING). Até o componente passar
 * a consumir delivery_status por mensagem, mostramos um único check, que significa
 * "enviado/aceito", e deixamos de afirmar visualmente que houve entrega no aparelho.
 */
export function InboxPage(props: InboxPageProps) {
  useEffect(() => {
    const styleId = "mkton-whatsapp-safe-delivery-check";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      [data-chat-surface] svg.lucide-check-check path:nth-of-type(2) {
        display: none;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.getElementById(styleId)?.remove();
    };
  }, []);

  return <LegacyInboxPage {...props} />;
}
