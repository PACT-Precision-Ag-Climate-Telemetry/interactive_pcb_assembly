-- 1) Ultrasonic-bath ordering: washable parts first, then a "process" step (the bath), then non-washable parts.
alter table public.bom_lines
  add column washable boolean not null default true,
  add column kind text not null default 'part' check (kind in ('part', 'process'));

-- 2) Manually managed stock for parts that do not come with an LCSC label (own barcode, printed by the shop).
create sequence public.stock_seq;

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PACT_STK_' || lpad(nextval('public.stock_seq')::text, 4, '0')),
  name text not null,
  supplier text,
  qty integer not null default 0 check (qty >= 0),
  bom_line_ids uuid[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

alter table public.placements add column stock_item_id uuid references public.stock_items(id) on delete set null;

alter table public.stock_items enable row level security;
create policy "stock read" on public.stock_items for select to authenticated using (true);
create policy "stock admin write" on public.stock_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
