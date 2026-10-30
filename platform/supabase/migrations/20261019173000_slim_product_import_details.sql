-- Additive product import fields; no grants, policies, orders or stock movements changed.
alter table public.products
  add column if not exists cost_price numeric check (cost_price is null or cost_price >= 0),
  add column if not exists minimum_stock integer check (minimum_stock is null or minimum_stock >= 0),
  add column if not exists unit text,
  add column if not exists stock_known boolean not null default true,
  add column if not exists import_snapshot jsonb;
comment on column public.products.import_snapshot is 'Original source fields and historical aggregates from an import; never creates order revenue or retroactive stock movements.';
comment on column public.products.stock_known is 'False when the source did not report stock. The operational zero placeholder must not be displayed as a confirmed zero balance.';

