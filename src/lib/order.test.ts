import { describe, expect, it } from 'vitest'
import { orderForBath } from './order'
import type { BomLine } from './types'

const l = (id: string, board_type: 'MB' | 'PW', step: number, over: Partial<BomLine> = {}): BomLine => ({
  id, board_type, step, stage: id, designators: [id], value: null, footprint: null, manufacturer: null, mpn: null, lcsc_code: null,
  orientation: null, notes: null, scan_required: true, washable: true, kind: 'part', sort: step, ...over,
})

describe('orderForBath', () => {
  it('puts washable parts, then the bath, then non-washable parts, renumbered per board', () => {
    const out = orderForBath([
      l('cap', 'PW', 3, { washable: false }), l('bath', 'PW', 0, { kind: 'process' }), l('r', 'PW', 1), l('d', 'PW', 2),
      l('mb1', 'MB', 1), l('mbbath', 'MB', 0, { kind: 'process' }), l('mbU', 'MB', 2, { washable: false }),
    ])
    expect(out.map((x) => x.id)).toEqual(['mb1', 'mbbath', 'mbU', 'r', 'd', 'bath', 'cap'])
    expect(out.filter((x) => x.board_type === 'PW').map((x) => x.step)).toEqual([1, 2, 3, 4])
    expect(out.filter((x) => x.board_type === 'MB').map((x) => x.step)).toEqual([1, 2, 3])
  })
})
