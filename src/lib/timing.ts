import type { BomLine, Placement } from './types'

/** A pause longer than this between two scans/confirmations counts as a break, not work time. */
export const IDLE_GAP_SEC = 600

export interface StepTime {
  step: number
  stage: string
  parts: number
  activeSec: number
}

export interface BoardTiming {
  steps: StepTime[]
  totalSec: number
  /** user id -> parts handled and active seconds */
  byUser: Map<string, { parts: number; sec: number }>
}

/**
 * Active working time per step, derived from the timestamps already stored on every placement
 * (placed_at when the part was scanned/confirmed, soldered_at when it was confirmed after soldering).
 * Time between two consecutive events is attributed to the step (and user) of the later event, unless the
 * gap exceeds IDLE_GAP_SEC. The ultrasonic bath (a process step) is not counted.
 */
export function boardTiming(boardCreatedAt: string, placements: Placement[], lines: BomLine[]): BoardTiming {
  const lineById = new Map(lines.map((l) => [l.id, l]))
  const steps = new Map<number, StepTime>()
  for (const l of lines) {
    if (l.kind === 'process') continue
    const s = steps.get(l.step) ?? { step: l.step, stage: l.stage, parts: 0, activeSec: 0 }
    steps.set(l.step, s)
  }

  interface Ev { t: number; step: number | null; user: string | null }
  const events: Ev[] = []
  for (const p of placements) {
    const line = lineById.get(p.bom_line_id)
    const step = line && line.kind === 'part' ? line.step : null
    if (step != null) steps.get(step)!.parts++
    events.push({ t: Date.parse(p.placed_at), step, user: p.placed_by ?? null })
    if (p.soldered_at && p.soldered_at !== p.placed_at) events.push({ t: Date.parse(p.soldered_at), step, user: p.soldered_by ?? p.placed_by ?? null })
  }
  events.sort((a, b) => a.t - b.t)

  const byUser = new Map<string, { parts: number; sec: number }>()
  for (const p of placements) {
    if (!p.placed_by) continue
    const u = byUser.get(p.placed_by) ?? { parts: 0, sec: 0 }
    u.parts++
    byUser.set(p.placed_by, u)
  }

  let prev = Date.parse(boardCreatedAt)
  let total = 0
  for (const e of events) {
    const gap = (e.t - prev) / 1000
    prev = e.t
    if (e.step == null || gap < 0 || gap > IDLE_GAP_SEC) continue
    steps.get(e.step)!.activeSec += gap
    total += gap
    if (e.user) {
      const u = byUser.get(e.user) ?? { parts: 0, sec: 0 }
      u.sec += gap
      byUser.set(e.user, u)
    }
  }
  return { steps: [...steps.values()].sort((a, b) => a.step - b.step), totalSec: total, byUser }
}

export const fmtDuration = (sec: number) => {
  if (sec < 90) return `${Math.round(sec)} s`
  const m = sec / 60
  return m < 90 ? `${m.toFixed(1)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`
}
