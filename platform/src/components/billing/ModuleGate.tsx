export function ModuleGate({ module, children }: { module: string; children: React.ReactNode }) {
  void module;
  return <>{children}</>;
}
