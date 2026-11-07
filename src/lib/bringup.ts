import type { BoardType } from './types'

/** A measurement with an accepted range, or a yes/no check. */
export interface BringupTest {
  key: string
  title: string
  how: string
  unit?: string
  /** Numeric test: pass when min <= value <= max. Absent for a yes/no check. */
  min?: number
  max?: number
  optional?: boolean
}

export const BRINGUP: Record<BoardType, BringupTest[]> = {
  PW: [
    { key: 'short', title: 'No short on the battery rail', how: 'Power off. Multimeter in resistance mode between TP1 (VBAT) and TP5 (GND): it must not read ~0 ohm (it may rise slowly while the capacitors charge).' },
    { key: 'vbat', title: 'VBAT (TP1)', how: 'Connect a 12 V battery or bench supply to J2 (observe polarity) and measure TP1 against GND.', unit: 'V', min: 11, max: 15 },
    { key: 'vin_buck', title: 'VIN_BUCK after the low-voltage disconnect (TP2)', how: 'Should follow VBAT. 0 V means the LVD has tripped (battery below ~11.8 V) or Q4/U2 has a fault.', unit: 'V', min: 11, max: 15 },
    { key: 'v5', title: '+5 V rail (TP3)', how: 'Measure against GND with the 5 V buck module fitted.', unit: 'V', min: 4.85, max: 5.15 },
    { key: 'v33', title: '+3.3 V rail (TP4)', how: 'Measure against GND with the 3.3 V buck module fitted.', unit: 'V', min: 3.2, max: 3.4 },
    { key: 'leds', title: 'Rail LEDs D5 / D6 light up', how: 'With the LED-enable jumper JP1 fitted, both green LEDs are on.' },
    { key: 'solar_on', title: 'Solar connected: TP8 to TP9', how: 'Panel and charger connected, J4 pin 1 (SOLAR_DIS) left low. Q1 is on, so TP8 to TP9 reads about 0 V.', unit: 'V', min: -0.3, max: 0.3, optional: true },
    { key: 'solar_dis', title: 'SOLAR_DIS disconnects the panel', how: 'Tie J4 pin 1 to J4 pin 5 (+3.3 V). Q1 turns off, so TP8 to TP9 must no longer read ~0 V (it floats or shows panel voltage).', optional: true },
    { key: 'lvd', title: 'LVD cuts out below ~11.8 V', how: 'On a bench supply lower the voltage under 11.8 V: TP2 must drop to 0 V and return above ~12.75 V.', optional: true },
  ],
  MB: [
    { key: 'short', title: 'No short between 3V3 and GND', how: 'Power off. Resistance between J9 pin 5 (+3.3 V) and pin 4 (GND) must not be ~0 ohm.' },
    { key: 'v33', title: '3.3 V present on J9', how: 'Power the board through J9 and measure pin 5 against pin 4.', unit: 'V', min: 3.2, max: 3.4 },
    { key: 'esp', title: 'ESP32-S3 boots and can be flashed', how: 'Connect USB, open the serial monitor or flash a test sketch.' },
    { key: 'i2c', title: 'I2C devices respond', how: 'Run an I2C scan: ADS1115, SCD40, SHT30 and the ToF sensor are found.', optional: true },
    { key: 'modem', title: 'MODEM_PWR switch works', how: 'Drive the modem power GPIO high: Q2 pulls MODEM_PWR_D low and the modem rail turns on.', optional: true },
  ],
}

export interface TestResult {
  test_key: string
  value: number | null
  passed: boolean
  note: string | null
}

export const evaluate = (t: BringupTest, value: number | null, checked: boolean): boolean =>
  t.min != null || t.max != null
    ? value != null && Number.isFinite(value) && (t.min == null || value >= t.min) && (t.max == null || value <= t.max)
    : checked

/** Overall: every required test has a passing result; any recorded failure (even optional) fails the board. */
export function summarize(type: BoardType, results: TestResult[]): { done: number; required: number; failed: number; passed: boolean } {
  const tests = BRINGUP[type]
  const byKey = new Map(results.map((r) => [r.test_key, r]))
  const required = tests.filter((t) => !t.optional)
  const failed = tests.filter((t) => byKey.get(t.key) && !byKey.get(t.key)!.passed).length
  const done = required.filter((t) => byKey.get(t.key)?.passed).length
  return { done, required: required.length, failed, passed: done === required.length && failed === 0 }
}
