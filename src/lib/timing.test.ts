import { describe, expect, it } from 'vitest'
import { boardTiming } from './timing'
import type { BomLine, Placement } from './types'

const line = (id: string, step: number, kind: 'part' | 'process' = 'part'): BomLine => ({
  id, board_type: 'PW', step, stage: 'S' + step, designators: [id], value: null, footprint: null, manufacturer: null, mpn: null, lcsc_code: null,
  orientation: null, notes: null, scan_required: true, washable: true, kind, sort: step,
})
const at = (min: number) => new Date(Date.UTC(2026, 0, 1, 10, min)).toISOString()
const pl = (d: string, lineId: string, placed: number, soldered: number | null, by = 'u1'): Placement => ({
  id: d, board_id: 'b', designator: d, bom_line_id: lineId, scan_raw: null, pbn: null, order_no: null, lcsc_code: null, mpn: null, pack_qty: null,
  stock_item_id: null, placed_at: at(placed), soldered_at: soldered == null ? null : at(soldered), soldered_raw: null, placed_by: by, soldered_by: by,
})

describe('boardTiming', () => {
  it('attributes gaps to the later event, ignores idle gaps and the bath', () => {
    const lines = [line('a', 1), line('b', 2), line('bath', 3, 'process')]
    const t = boardTiming(at(0), [pl('A1', 'a', 1, 3), pl('B1', 'b', 5, 8), pl('BATH', 'bath', 100, 100)], lines)
    // events: 1 (gap 1 from creation), 3 (+2), 5 (+2), 8 (+3), bath at 100 (idle, not a part step)
    expect(t.steps.map((s) => [s.step, s.parts, s.activeSec / 60])).toEqual([[1, 1, 3], [2, 1, 5]])
    expect(t.totalSec / 60).toBe(8)
    expect(t.byUser.get('u1')?.sec).toBe(8 * 60)
  })
  it('does not count a long break', () => {
    const t = boardTiming(at(0), [pl('A1', 'a', 1, 2), pl('A2', 'a', 60, 61)], [line('a', 1)])
    expect(t.totalSec / 60).toBe(3) // 1 + 1 + 1: the 58 min gap before A2 is a break
  })
})
