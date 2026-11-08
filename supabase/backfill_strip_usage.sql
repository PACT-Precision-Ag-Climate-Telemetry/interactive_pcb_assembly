-- Header strip C2895846 (LCSC, 1x40) for boards that were already built. Run after migration 0009
-- and after supabase/lcsc_codes.sql (or seed.sql) so MB J10/J11 and PW JP1 have the code. Safe to re-run.
do $$
declare
  hdr_ids uuid[];
  n int;
begin
  select array_agg(id) into hdr_ids from public.bom_lines
    where kind = 'part' and ((board_type = 'MB' and (designators @> array['J10'] or designators @> array['J11']))
                          or (board_type = 'PW' and designators @> array['JP1']));

  -- 0) undo the earlier mistaken back-fill (it treated PACT_STK_0003, the 220 uF capacitor, as the header strip)
  update public.stock_items set by_pins = false;
  update public.placements set stock_item_id = null where bom_line_id = any (hdr_ids) and stock_item_id is not null;
  get diagnostics n = row_count;
  raise notice 'Removed % wrong stock tag(s) from header placements', n;
  update public.stock_items
    set bom_line_ids = (select coalesce(array_agg(x), '{}') from unnest(bom_line_ids) x where x <> all (hdr_ids))
    where bom_line_ids && hdr_ids;

  -- 1) BOM lines and stock row for the LCSC strip
  update public.bom_lines set lcsc_code = 'C2895846' where id = any (hdr_ids);
  insert into public.lcsc_stock (lcsc_code, mpn, description, qty, pins_per_unit)
    values ('C2895846', 'PZ254V-11-40P', 'Pin Header 40 Position 2.54mm Pitch Single Row Through Hole', 10, 40)
    on conflict (lcsc_code) do update set pins_per_unit = 40;

  -- 2) header placements already made on built boards count as taken from this strip
  update public.placements set lcsc_code = 'C2895846' where bom_line_id = any (hdr_ids) and lcsc_code is null;
  get diagnostics n = row_count;
  raise notice 'Tagged % header placement(s) with C2895846', n;
end $$;

-- Check: strips ordered, pins used and left
select s.lcsc_code, s.qty as strips, s.pins_per_unit, u.used as pins_used, s.qty * s.pins_per_unit - u.used as pins_left
from public.lcsc_stock s left join public.lcsc_usage u on u.lcsc_code = s.lcsc_code
where s.lcsc_code = 'C2895846';
