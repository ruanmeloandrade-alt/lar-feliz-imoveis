import type { ReactNode } from "react";

export function FeaturePlanGate({
  module,
  children,
  className,
}: {
  module: string;
  children: ReactNode;
  className?: string;
}) {
  void module;
  void className;
  return <>{children}</>;
}
