-- Bring-up test results, one row per board and test (a retest overwrites the row).
create table public.board_tests (
  board_id uuid not null references public.boards(id) on delete cascade,
  test_key text not null,
  value numeric,
  passed boolean not null,
  note text,
  tested_by uuid references auth.users(id) default auth.uid(),
  tested_at timestamptz not null default now(),
  primary key (board_id, test_key)
);
alter table public.board_tests enable row level security;
create policy "tests read" on public.board_tests for select to authenticated using (true);
create policy "tests insert" on public.board_tests for insert to authenticated with check (tested_by = auth.uid());
create policy "tests update" on public.board_tests for update to authenticated using (true) with check (tested_by = auth.uid());
create policy "tests delete" on public.board_tests for delete to authenticated using (public.is_admin());

-- LCSC order CSVs imported from the Admin page (warns before importing the same file twice).
create table public.lcsc_imports (
  file_name text primary key,
  rows integer not null,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) default auth.uid()
);
alter table public.lcsc_imports enable row level security;
create policy "imports read" on public.lcsc_imports for select to authenticated using (true);
create policy "imports admin write" on public.lcsc_imports for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bag trace-back looks up placements by bag / order / part code.
create index placements_pbn_idx on public.placements (pbn);
create index placements_order_idx on public.placements (order_no);
create index placements_lcsc_idx on public.placements (lcsc_code);
create index placements_stock_idx on public.placements (stock_item_id);
