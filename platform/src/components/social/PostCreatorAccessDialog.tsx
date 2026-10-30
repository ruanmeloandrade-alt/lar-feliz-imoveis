import type { ComponentProps } from "react";
import { useIsSuperAdmin } from "@/hooks/use-roles";
import { PostCreatorDialog as FullPostCreatorDialog } from "./PostCreatorDialog";

type Props = ComponentProps<typeof FullPostCreatorDialog>;

/**
 * Mantém o fluxo original para o super_admin. Para o cliente final, remove somente
 * a superfície de geração visual por IA; upload manual, canais, texto, preview,
 * agendamento e publicação continuam no componente original.
 */
export function PostCreatorDialog(props: Props) {
  const { isSuperAdmin, loaded } = useIsSuperAdmin();
  if (!loaded) return null;
  if (isSuperAdmin) return <FullPostCreatorDialog {...props} />;

  return (
    <div className="mkton-customer-post-creator contents">
      <style>{`
        .mkton-customer-post-creator section[class*="space-y-4"][class*="border-primary/20"][class*="bg-primary/5"] > :nth-child(-n+4) {
          display: none !important;
        }
        .mkton-customer-post-creator section[class*="space-y-4"][class*="border-primary/20"][class*="bg-primary/5"] {
          background: transparent !important;
          border-color: var(--border) !important;
          box-shadow: none !important;
        }
      `}</style>
      <FullPostCreatorDialog {...props} />
    </div>
  );
}
