import type { BoardType, BomLine, LcscStock, StockItem } from './types'

export interface ReadinessRow {
  kind: 'lcsc' | 'stock'
  key: string // LCSC code or stock barcode
  label: string
  needed: number
  left: number
  short: number
  lines: BomLine[]
}

export interface Readiness {
  rows: ReadinessRow[]
  /** Part lines that need parts but have no LCSC code and no stock item: nothing to check against. */
  untracked: { line: BomLine; needed: number }[]
  shortages: ReadinessRow[]
}

/**
 * How many parts do `counts` boards need, and does the remaining LCSC / manual stock cover it?
 * - A line with an LCSC code draws from that code's pool (shared by every line using the code).
 * - A line without a code draws from its linked stock items (demand split evenly if several items are linked).
 */
export function readiness(
  counts: Partial<Record<BoardType, number>>,
  bom: BomLine[],
  lcsc: LcscStock[],
  lcscUsed: Map<string, number>,
  stock: StockItem[],
  stockUsed: Map<string, number>,
): Readiness {
  const rows = new Map<string, ReadinessRow>()
  const untracked: Readiness['untracked'] = []
  const lcscByCode = new Map(lcsc.map((s) => [s.lcsc_code, s]))

  for (const line of bom) {
    if (line.kind !== 'part') continue
    const needed = line.designators.length * (counts[line.board_type] ?? 0)
    if (!needed) continue
    if (line.lcsc_code) {
      const s = lcscByCode.get(line.lcsc_code)
      const row = rows.get('L' + line.lcsc_code) ?? {
        kind: 'lcsc' as const, key: line.lcsc_code, label: line.lcsc_code + (s?.mpn ? ' · ' + s.mpn : ''),
        needed: 0, left: s ? s.qty - (lcscUsed.get(line.lcsc_code) ?? 0) : 0, short: 0, lines: [],
      }
      row.needed += needed
      row.lines.push(line)
      rows.set('L' + line.lcsc_code, row)
      continue
    }
    const items = stock.filter((s) => s.bom_line_ids.includes(line.id))
    if (!items.length) {
      if (line.scan_required) untracked.push({ line, needed })
      continue
    }
    for (const it of items) {
      const row = rows.get('S' + it.code) ?? {
        kind: 'stock' as const, key: it.code, label: it.code + ' · ' + it.name, needed: 0, left: it.qty - (stockUsed.get(it.id) ?? 0), short: 0, lines: [],
      }
      row.needed += needed / items.length
      row.lines.push(line)
      rows.set('S' + it.code, row)
    }
  }
  const list = [...rows.values()].map((r) => {
    const needed = Math.ceil(r.needed)
    return { ...r, needed, short: Math.max(0, needed - r.left) }
  })
  list.sort((a, b) => b.short - a.short || a.key.localeCompare(b.key, undefined, { numeric: true }))
  return { rows: list, untracked, shortages: list.filter((r) => r.short > 0) }
}
