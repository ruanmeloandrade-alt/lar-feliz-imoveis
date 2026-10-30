import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminCouponUsageDetails } from "@/lib/admin-coupon-usage.functions";

export function CouponUsageButton({ couponId, uses, maxUses }: { couponId: string; uses: number; maxUses?: number | null }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 20 | 50>(20);
  const loadUsage = useServerFn(getAdminCouponUsageDetails);
  const usage = useQuery({
    queryKey: ["admin", "coupon-usage", couponId, page, pageSize],
    queryFn: () => loadUsage({ data: { couponId, page, pageSize } }),
    enabled: open && uses > 0,
    retry: false,
  });
  const rows = usage.data?.rows ?? [];
  const pagination = usage.data?.pagination;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto px-2 py-1 font-semibold text-primary"
        disabled={uses === 0}
        onClick={() => { setPage(1); setOpen(true); }}
        title={uses > 0 ? "Ver quem utilizou este cupom" : "Este cupom ainda não foi utilizado"}
      >
        <Users className="mr-1 h-3.5 w-3.5" />
        {uses}{maxUses ? `/${maxUses}` : ""}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Usos do cupom</DialogTitle>
            <DialogDescription>Clientes e workspaces que efetivamente registraram uso deste cupom.</DialogDescription>
          </DialogHeader>

          {usage.isLoading ? (
            <div className="grid min-h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : usage.isError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">Não foi possível carregar os usos deste cupom. Tente novamente.</div>
          ) : (
            <>
              <div className="max-h-[55vh] overflow-auto rounded-xl border border-border">
                <Table>
                  <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Workspace</TableHead><TableHead>Contato</TableHead><TableHead>Usado em</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rows.map((row: any, index: number) => (
                      <TableRow key={`${row.workspaceId ?? "sem-workspace"}:${row.paymentId ?? index}:${row.usedAt ?? index}`}>
                        <TableCell className="font-medium">{row.customerName}</TableCell>
                        <TableCell>{row.workspaceName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.email ?? row.phone ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.usedAt ? new Date(row.usedAt).toLocaleString("pt-BR") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum uso registrado.</div>}
              </div>
              {pagination && pagination.total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                  <div className="text-xs text-muted-foreground">Página {pagination.page} de {pagination.totalPages} · {pagination.total} uso(s)</div>
                  <div className="flex items-center gap-2">
                    <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value) as 10 | 20 | 50); setPage(1); }}>
                      <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem></SelectContent>
                    </Select>
                    <Button type="button" size="sm" variant="outline" disabled={page <= 1 || usage.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button>
                    <Button type="button" size="sm" variant="outline" disabled={page >= pagination.totalPages || usage.isFetching} onClick={() => setPage((value) => value + 1)}>Próxima</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
