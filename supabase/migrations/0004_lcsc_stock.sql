-- Ordered quantity per LCSC part number (filled from the order CSVs by supabase/lcsc_stock.sql, editable on the Stock page).
create table public.lcsc_stock (
  lcsc_code text primary key,
  mpn text,
  description text,
  qty integer not null default 0 check (qty >= 0)
);
alter table public.lcsc_stock enable row level security;
create policy "lcsc_stock read" on public.lcsc_stock for select to authenticated using (true);
create policy "lcsc_stock admin write" on public.lcsc_stock for all to authenticated using (public.is_admin()) with check (public.is_admin());
