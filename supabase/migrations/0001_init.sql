-- PACT interactive PCB assembly schema

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'operator' check (role in ('operator', 'admin')),
  created_at timestamptz not null default now()
);

-- First user to sign up becomes admin; everyone else is an operator.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email, split_part(new.email, '@', 1),
          case when exists (select 1 from public.profiles) then 'operator' else 'admin' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- One row per BOM line (a group of designators sharing the same part)
create table public.bom_lines (
  id uuid primary key default gen_random_uuid(),
  board_type text not null check (board_type in ('MB', 'PW')),
  step int not null,
  stage text not null,
  designators text[] not null,
  value text,
  footprint text,
  manufacturer text,
  mpn text,
  lcsc_code text,                 -- e.g. C3204125, optional (matching also works on MPN)
  orientation text,
  notes text,
  scan_required boolean not null default true,  -- false = confirm by button (modules, hardware)
  sort int not null default 0
);
create index on public.bom_lines (board_type, step, sort);

-- Extra LCSC codes that map to a BOM line (when LCSC ships an equivalent part number)
create table public.part_aliases (
  lcsc_code text primary key,
  bom_line_id uuid not null references public.bom_lines(id) on delete cascade,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  serial text not null unique,
  board_type text not null check (board_type in ('MB', 'PW')),
  batch text not null,
  seq text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  completed_by uuid references auth.users(id),
  completed_at timestamptz
);

create table public.placements (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  designator text not null,
  bom_line_id uuid not null references public.bom_lines(id),
  scan_raw text,                  -- null when confirmed manually (scan_required = false)
  pbn text, order_no text, lcsc_code text, mpn text, pack_qty int,
  placed_by uuid references auth.users(id) default auth.uid(),
  placed_at timestamptz not null default now(),
  unique (board_id, designator)
);
create index on public.placements (pbn, order_no);

-- Audit trail of every scan, including rejected ones
create table public.scan_events (
  id bigint generated always as identity primary key,
  board_id uuid references public.boards(id) on delete cascade,
  raw text not null,
  result text not null check (result in ('accepted', 'rejected')),
  reason text,
  scanned_by uuid references auth.users(id) default auth.uid(),
  scanned_at timestamptz not null default now()
);

create view public.board_progress with (security_invoker = true) as
select b.*,
  (select count(*) from public.placements p where p.board_id = b.id) as placed,
  (select coalesce(sum(cardinality(l.designators)), 0) from public.bom_lines l where l.board_type = b.board_type) as total
from public.boards b;

-- Row level security
alter table public.profiles enable row level security;
alter table public.bom_lines enable row level security;
alter table public.part_aliases enable row level security;
alter table public.boards enable row level security;
alter table public.placements enable row level security;
alter table public.scan_events enable row level security;

create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "bom read" on public.bom_lines for select to authenticated using (true);
create policy "bom admin write" on public.bom_lines for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "alias read" on public.part_aliases for select to authenticated using (true);
create policy "alias admin write" on public.part_aliases for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "boards read" on public.boards for select to authenticated using (true);
create policy "boards insert" on public.boards for insert to authenticated with check (created_by = auth.uid());
create policy "boards update" on public.boards for update to authenticated using (true) with check (true);
create policy "placements read" on public.placements for select to authenticated using (true);
create policy "placements insert" on public.placements for insert to authenticated
  with check (placed_by = auth.uid() and exists (select 1 from public.boards b where b.id = board_id and b.status = 'in_progress'));
create policy "placements undo" on public.placements for delete to authenticated
  using ((placed_by = auth.uid() or public.is_admin()) and exists (select 1 from public.boards b where b.id = board_id and b.status = 'in_progress'));
create policy "scan_events read" on public.scan_events for select to authenticated using (true);
create policy "scan_events insert" on public.scan_events for insert to authenticated with check (scanned_by = auth.uid());
create policy "profiles admin update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
