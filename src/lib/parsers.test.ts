import { describe, expect, it } from 'vitest'
import { labelMatchesLine, parseBoardCode, parseLcsc } from './parsers'
import type { BomLine } from './types'

const SAMPLE = '{pbn:PICK2610300010,on:WM2610300148001,pc:C3204125,pm:0031.8201,qty:10,mc:,cc:1,pdi:245670815,hp:null,wc:ZH}'

const line = (over: Partial<BomLine>): BomLine => ({
  id: 'l1', board_type: 'PW', step: 1, stage: 's', designators: ['F1'], value: null, footprint: null,
  manufacturer: null, mpn: '0031.8201', lcsc_code: null, orientation: null, notes: null, scan_required: true, sort: 1, ...over,
})

describe('parseLcsc', () => {
  it('parses the sample label', () => {
    const l = parseLcsc(SAMPLE)!
    expect(l.pc).toBe('C3204125')
    expect(l.pm).toBe('0031.8201')
    expect(l.pbn).toBe('PICK2610300010')
    expect(l.on).toBe('WM2610300148001')
    expect(l.qty).toBe(10)
  })
  it('rejects non-LCSC text', () => {
    expect(parseLcsc('PACT_MB_0001_0002')).toBeNull()
    expect(parseLcsc('{foo:bar}')).toBeNull()
  })
})

describe('parseBoardCode', () => {
  it('accepts mainboard and power codes', () => {
    expect(parseBoardCode('PACT_MB_0012_0034')).toMatchObject({ type: 'MB', batch: '0012', seq: '0034' })
    expect(parseBoardCode(' pact_pw_00012_00034\n')).toMatchObject({ serial: 'PACT_PW_00012_00034', type: 'PW' })
  })
  it('accepts the real board code with an alphanumeric batch, keeping case', () => {
    expect(parseBoardCode('PACT_PW_7m1z1_0001')).toMatchObject({ serial: 'PACT_PW_7m1z1_0001', type: 'PW', batch: '7m1z1', seq: '0001' })
  })
  it('rejects unknown prefixes and non-codes', () => {
    expect(parseBoardCode('PACT_XX_0012_0034')).toBeNull()
    expect(parseBoardCode('7m1z1_0001')).toBeNull()
  })
})

describe('labelMatchesLine', () => {
  const label = parseLcsc(SAMPLE)!
  it('matches by MPN', () => expect(labelMatchesLine(label, line({}), [])).toBe(true))
  it('matches by LCSC code', () => expect(labelMatchesLine(label, line({ mpn: 'X', lcsc_code: 'c3204125' }), [])).toBe(true))
  it('matches by alias', () =>
    expect(labelMatchesLine(label, line({ mpn: 'X' }), [{ lcsc_code: 'C3204125', bom_line_id: 'l1' }])).toBe(true))
  it('rejects other parts', () => expect(labelMatchesLine(label, line({ mpn: 'OTHER' }), [])).toBe(false))
})

describe('parseBoardCode tolerance', () => {
  it('ignores surrounding scanner noise', () => {
    expect(parseBoardCode('\u001d]d1PACT_MB_0001_0002\r\n')?.serial).toBe('PACT_MB_0001_0002')
  })
})
