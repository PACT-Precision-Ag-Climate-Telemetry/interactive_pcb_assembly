-- Pin-header strips (e.g. 1x40 Dupont headers) are broken into pieces of different lengths.
-- With by_pins = true the stock quantity is counted in PINS and each placement uses as many pins
-- as its BOM footprint says (1x06 = 6 pins). Other stock items still count 1 per placement.
alter table public.stock_items add column if not exists by_pins boolean not null default false;

create or replace view public.stock_usage with (security_invoker = true) as
  select p.stock_item_id,
         sum(case when s.by_pins then coalesce((substring(b.footprint from '1x0*([0-9]+)'))::int, 1) else 1 end)::int as used
  from public.placements p
  join public.stock_items s on s.id = p.stock_item_id
  left join public.bom_lines b on b.id = p.bom_line_id
  where p.stock_item_id is not null
  group by p.stock_item_id;
