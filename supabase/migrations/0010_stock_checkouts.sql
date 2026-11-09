-- Manual checkout of stock that is not (or not only) used through a BOM line: spares, samples, scrap, rework.
-- qty is in the stock's own usage unit (pieces, or pins for pin-header strips / by_pins stock).
create table public.stock_checkouts (
  id uuid primary key default gen_random_uuid(),
  lcsc_code text references public.lcsc_stock(lcsc_code) on delete cascade,
  stock_item_id uuid references public.stock_items(id) on delete cascade,
  qty int not null check (qty > 0),
  board_id uuid references public.boards(id) on delete set null,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check ((lcsc_code is not null)::int + (stock_item_id is not null)::int = 1)
);
create index stock_checkouts_lcsc_idx on public.stock_checkouts (lcsc_code);
create index stock_checkouts_stock_idx on public.stock_checkouts (stock_item_id);
alter table public.stock_checkouts enable row level security;
create policy "checkouts read" on public.stock_checkouts for select to authenticated using (true);
create policy "checkouts insert" on public.stock_checkouts for insert to authenticated with check (created_by = auth.uid());
create policy "checkouts delete" on public.stock_checkouts for delete to authenticated using (created_by = auth.uid() or public.is_admin());

-- Usage = placements + manual checkouts.
create or replace view public.lcsc_usage with (security_invoker = true) as
  select code as lcsc_code, sum(used)::int as used from (
    select p.lcsc_code as code,
           case when coalesce(ls.pins_per_unit, 1) > 1 then coalesce((substring(b.footprint from '1x0*([0-9]+)'))::int, 1) else 1 end as used
    from public.placements p
    left join public.lcsc_stock ls on ls.lcsc_code = p.lcsc_code
    left join public.bom_lines b on b.id = p.bom_line_id
    where p.lcsc_code is not null
    union all
    select lcsc_code, qty from public.stock_checkouts where lcsc_code is not null
  ) u group by code;

create or replace view public.stock_usage with (security_invoker = true) as
  select code as stock_item_id, sum(used)::int as used from (
    select p.stock_item_id as code,
           case when s.by_pins then coalesce((substring(b.footprint from '1x0*([0-9]+)'))::int, 1) else 1 end as used
    from public.placements p
    join public.stock_items s on s.id = p.stock_item_id
    left join public.bom_lines b on b.id = p.bom_line_id
    where p.stock_item_id is not null
    union all
    select stock_item_id, qty from public.stock_checkouts where stock_item_id is not null
  ) u group by code;
