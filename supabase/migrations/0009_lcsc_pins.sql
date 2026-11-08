-- LCSC pin-header strips (e.g. C2895846, 1x40) are broken into headers of different lengths.
-- pins_per_unit > 1: the ordered quantity is in strips, usage and "left" are counted in PINS
-- (each placement uses as many pins as its BOM footprint says, 1x06 = 6).
alter table public.lcsc_stock add column if not exists pins_per_unit int not null default 1;
update public.lcsc_stock set pins_per_unit = 40 where lcsc_code = 'C2895846';

create or replace view public.lcsc_usage with (security_invoker = true) as
  select p.lcsc_code,
         sum(case when coalesce(ls.pins_per_unit, 1) > 1 then coalesce((substring(b.footprint from '1x0*([0-9]+)'))::int, 1) else 1 end)::int as used
  from public.placements p
  left join public.lcsc_stock ls on ls.lcsc_code = p.lcsc_code
  left join public.bom_lines b on b.id = p.bom_line_id
  where p.lcsc_code is not null
  group by p.lcsc_code;
