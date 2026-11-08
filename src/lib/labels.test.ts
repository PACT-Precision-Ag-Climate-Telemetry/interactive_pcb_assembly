import { describe, expect, it } from 'vitest'
import { labelPayload, targetCells } from './labels'
import { parseStockCode } from './parsers'

describe('labels', () => {
  it('payload starts with the stock code so scanning still works', () => {
    const p = labelPayload('PACT_STK_0003', 'Lazada|shop', 'WM2411250001')
    expect(p).toBe('PACT_STK_0003|Lazada/shop|WM2411250001')
    expect(parseStockCode(p)).toBe('PACT_STK_0003')
  })
  it('fills free cells from one picked cell', () => {
    expect(targetCells([5], 3, new Set([6]))).toEqual([5, 7, 8])
    expect(targetCells([9, 2], 5, new Set())).toEqual([2, 9])
    expect(targetCells([54], 5, new Set())).toEqual([54, 55])
    expect(targetCells([], 3, new Set([0, 1]))).toEqual([2, 3, 4])
  })
})
