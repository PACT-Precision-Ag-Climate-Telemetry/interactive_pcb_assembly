import { describe, expect, it } from 'vitest'
import { pinsOf, stockWeight } from './pins'

describe('pins', () => {
  it('reads the pin count from the footprint', () => {
    expect(pinsOf({ footprint: 'PinHeader_1x06_P2.54mm_Vertical' })).toBe(6)
    expect(pinsOf({ footprint: 'PinHeader_1x02_P2.54mm_Vertical' })).toBe(2)
    expect(pinsOf({ footprint: 'PinSocket_1x10_P2.54mm_Vertical' })).toBe(10)
    expect(pinsOf({ footprint: null })).toBe(1)
  })
  it('only strip stock counts pins', () => {
    const line = { footprint: 'PinHeader_1x06_P2.54mm_Vertical' }
    expect(stockWeight({ by_pins: true }, line)).toBe(6)
    expect(stockWeight({ by_pins: false }, line)).toBe(1)
  })
})
