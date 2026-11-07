-- Defect / rework log. The bag data is copied from the placement at report time, because a rework deletes the placement.
create table public.defects (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  designator text not null,
  kind text not null check (kind in ('wrong_part', 'bad_solder', 'damaged', 'polarity', 'missing', 'other')),
  note text,
  status text not null default 'open' check (status in ('open', 'fixed')),
  lcsc_code text,
  pbn text,
  order_no text,
  stock_item_id uuid references public.stock_items(id) on delete set null,
  reported_by uuid references auth.users(id) default auth.uid(),
  reported_at timestamptz not null default now(),
  fixed_by uuid references auth.users(id),
  fixed_at timestamptz
);
create index defects_board_idx on public.defects (board_id);
create index defects_pbn_idx on public.defects (pbn);
alter table public.defects enable row level security;
create policy "defects read" on public.defects for select to authenticated using (true);
create policy "defects insert" on public.defects for insert to authenticated with check (reported_by = auth.uid());
create policy "defects update" on public.defects for update to authenticated using (true) with check (true);
create policy "defects delete" on public.defects for delete to authenticated using (public.is_admin());

-- Usage counts computed in the database (a plain select would be cut off at 1000 rows).
create view public.lcsc_usage with (security_invoker = true) as
  select lcsc_code, count(*)::int as used from public.placements where lcsc_code is not null group by lcsc_code;
create view public.stock_usage with (security_invoker = true) as
  select stock_item_id, count(*)::int as used from public.placements where stock_item_id is not null group by stock_item_id;
