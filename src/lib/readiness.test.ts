import { describe, expect, it } from 'vitest'
import { BRINGUP, evaluate, summarize } from './bringup'
import { parseLcscOrder } from './csv'
import { manualShortages, readiness, shoppingCsv } from './readiness'
import type { BomLine, StockItem } from './types'

const line = (id: string, board_type: 'MB' | 'PW', designators: string[], over: Partial<BomLine> = {}): BomLine => ({
  id, board_type, step: 1, stage: 's', designators, value: id, footprint: null, manufacturer: null, mpn: null, lcsc_code: null,
  orientation: null, notes: null, scan_required: true, washable: true, kind: 'part', sort: 1, ...over,
})

describe('readiness', () => {
  const bom = [
    line('r10k-pw', 'PW', ['R5', 'R17'], { lcsc_code: 'C1' }),
    line('r10k-mb', 'MB', ['R4', 'R5'], { lcsc_code: 'C1' }),
    line('hdr', 'MB', ['J10'], {}),
    line('tp', 'PW', ['TP1']),
    line('bath', 'PW', ['BATH'], { kind: 'process', scan_required: false }),
  ]
  const stock: StockItem[] = [{ id: 's1', code: 'PACT_STK_0001', name: 'Header', supplier: null, order_no: null, by_pins: false, qty: 3, bom_line_ids: ['hdr'], notes: null, created_at: '' }]
  it('pools LCSC demand across boards and flags shortages', () => {
    const r = readiness({ MB: 5, PW: 5 }, bom, [{ lcsc_code: 'C1', mpn: 'R', description: null, qty: 25, pins_per_unit: 1 }], new Map([['C1', 3]]), stock, new Map([['s1', 1]]))
    const c1 = r.rows.find((x) => x.key === 'C1')!
    expect([c1.needed, c1.left, c1.short]).toEqual([20, 22, 0])
    const hdr = r.rows.find((x) => x.key === 'PACT_STK_0001')!
    expect([hdr.needed, hdr.left, hdr.short]).toEqual([5, 2, 3])
    expect(r.shortages.map((x) => x.key)).toEqual(['PACT_STK_0001'])
    expect(r.untracked.map((u) => u.line.id)).toEqual(['tp'])
  })
  it('counts pin-header strips in pins', () => {
    const hdr6 = { ...bom[2], footprint: 'PinHeader_1x06_P2.54mm_Vertical' }
    const strip: StockItem[] = [{ ...stock[0], by_pins: true, qty: 40 }]
    const r = readiness({ MB: 5 }, [hdr6], [], new Map(), strip, new Map([['s1', 6]]))
    const row = r.rows.find((x) => x.key === 'PACT_STK_0001')!
    expect([row.needed, row.left, row.short]).toEqual([30, 34, 0])
  })
})

describe('bring-up', () => {
  it('evaluates ranges and summarizes', () => {
    const v33 = BRINGUP.PW.find((t) => t.key === 'v33')!
    expect(evaluate(v33, 3.3, false)).toBe(true)
    expect(evaluate(v33, 3.6, false)).toBe(false)
    expect(evaluate(v33, null, false)).toBe(false)
    const required = BRINGUP.MB.filter((t) => !t.optional)
    const res = required.map((t) => ({ test_key: t.key, value: null, passed: true, note: null }))
    expect(summarize('MB', res).passed).toBe(true)
    expect(summarize('MB', res.slice(1)).passed).toBe(false)
    expect(summarize('MB', [...res, { test_key: 'i2c', value: null, passed: false, note: null }]).passed).toBe(false)
  })
})

describe('csv', () => {
  it('parses an LCSC order and sums duplicate codes', () => {
    const rows = parseLcscOrder('LCSC Part Number,Manufacture Part Number,Description,Quantity\nC1,A,"x, y",10\nC1,A,"x, y",5\nfoo,B,z,1\n')
    expect(rows).toEqual([{ lcsc_code: 'C1', mpn: 'A', description: 'x, y', qty: 15 }])
    expect(() => parseLcscOrder('a,b\n1,2\n')).toThrow()
  })
})

describe('shopping list', () => {
  it('counts an LCSC 1x40 header strip in pins and orders whole strips', () => {
    const hdr = { ...line('j10', 'MB', ['J10'], { lcsc_code: 'C2895846' }), footprint: 'PinHeader_1x06_P2.54mm_Vertical' }
    const lcsc = [{ lcsc_code: 'C2895846', mpn: 'PZ254V-11-40P', description: 'Pin Header 40 Position', qty: 1, pins_per_unit: 40 }]
    const r = readiness({ MB: 10 }, [hdr], lcsc, new Map([['C2895846', 6]]), [], new Map())
    expect(r.rows[0]).toMatchObject({ needed: 60, left: 34, short: 26 })
    expect(shoppingCsv(r, lcsc)).toContain('C2895846,1,')
  })
  it('adds spare parts and exports LCSC shortages as CSV', () => {
    const bom = [line('r', 'PW', ['R1', 'R2'], { lcsc_code: 'C9' }), line('h', 'PW', ['J1'])]
    const stock: StockItem[] = [{ id: 's', code: 'PACT_STK_0002', name: 'Hdr', supplier: null, order_no: null, by_pins: false, qty: 0, bom_line_ids: ['h'], notes: null, created_at: '' }]
    const lcsc = [{ lcsc_code: 'C9', mpn: 'RES, 10k', description: 'x', qty: 5, pins_per_unit: 1 }]
    const r = readiness({ PW: 10 }, bom, lcsc, new Map(), stock, new Map(), 0.1)
    expect(r.rows.find((x) => x.key === 'C9')).toMatchObject({ needed: 22, left: 5, short: 17 })
    expect(shoppingCsv(r, lcsc)).toBe('LCSC Part Number,Quantity,Manufacture Part Number,Description\nC9,17,"RES, 10k",x\n')
    expect(manualShortages(r)).toEqual(['PACT_STK_0002 · Hdr: order 11'])
  })
})
