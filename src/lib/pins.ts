import type { BomLine, StockItem } from './types'

/** Number of pins of a header/socket BOM line, from its footprint (PinHeader_1x06_... = 6). Other parts = 1. */
export function pinsOf(line: Pick<BomLine, 'footprint'>): number {
  const m = /1x0*(\d+)/i.exec(line.footprint ?? '')
  return m ? Math.max(1, +m[1]) : 1
}

/** How much one placement of `line` takes from `item`: pins for strip stock (by_pins), otherwise 1. */
export const stockWeight = (item: Pick<StockItem, 'by_pins'> | undefined, line: Pick<BomLine, 'footprint'> | undefined): number =>
  item?.by_pins && line ? pinsOf(line) : 1
