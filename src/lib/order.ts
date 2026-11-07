import type { BomLine } from './types'

/**
 * Washable parts first, then the ultrasonic-bath process step, then the parts that must not go in the bath.
 * Steps are renumbered 1..n per board so the UI shows a continuous sequence.
 */
export function orderForBath(lines: BomLine[]): BomLine[] {
  const rank = (l: BomLine) => (l.kind === 'process' ? 1 : l.washable ? 0 : 2)
  const sorted = [...lines].sort((a, b) => a.board_type.localeCompare(b.board_type) || rank(a) - rank(b) || a.step - b.step || a.sort - b.sort)
  let n = 0
  let prev = ''
  return sorted.map((l) => {
    const key = l.board_type + '|' + rank(l) + '|' + (rank(l) === 1 ? 0 : l.step)
    if (key !== prev) { n = prev.startsWith(l.board_type + '|') ? n + 1 : 1; prev = key }
    return { ...l, step: n }
  })
}
