-- Parts with an LCSC code are scanned twice: before placing (row created) and after soldering (soldered_at set).
-- Parts without an LCSC code are confirmed by button and are soldered_at = placed_at immediately.
alter table public.placements
  add column soldered_at timestamptz,
  add column soldered_raw text,
  add column soldered_by uuid references auth.users(id);

-- Everything recorded before this migration counts as soldered.
update public.placements set soldered_at = placed_at where soldered_at is null;

create policy "placements solder" on public.placements for update to authenticated
  using (exists (select 1 from public.boards b where b.id = board_id and b.status = 'in_progress'))
  with check (soldered_by = auth.uid());

-- Progress counts only soldered/confirmed parts.
create or replace view public.board_progress with (security_invoker = true) as
select b.*,
  (select count(*) from public.placements p where p.board_id = b.id and p.soldered_at is not null) as placed,
  (select coalesce(sum(cardinality(l.designators)), 0) from public.bom_lines l where l.board_type = b.board_type) as total
from public.boards b;
