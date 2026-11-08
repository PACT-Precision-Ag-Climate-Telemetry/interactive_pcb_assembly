-- Splits the power-board BOM line "M1, M2" (buck modules) into one line per module (M1 = 5 V, M2 = 3.3 V).
-- Run once on an existing database. Already-placed M2 parts are moved to the new line. Safe to re-run.
do $$
declare old_id uuid; new_id uuid;
begin
  select id into old_id from public.bom_lines
    where board_type = 'PW' and designators @> array['M1','M2'] limit 1;
  if old_id is null then return; end if;

  insert into public.bom_lines (board_type, step, stage, designators, value, footprint, manufacturer, mpn, lcsc_code, orientation, notes, scan_required, sort, washable, kind)
    select board_type, step, stage, array['M2'], 'DE054 MP1584EN 3.3V', footprint, manufacturer, mpn, lcsc_code, orientation, notes, scan_required, sort, washable, kind
    from public.bom_lines where id = old_id
    returning id into new_id;

  update public.bom_lines set designators = array['M1'], value = 'DE054 MP1584EN 5V' where id = old_id;
  update public.placements set bom_line_id = new_id where bom_line_id = old_id and designator = 'M2';
end $$;
