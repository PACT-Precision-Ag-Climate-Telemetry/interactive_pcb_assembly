// Builds supabase/seed.sql from the CSVs of the two PCB projects.
// Usage: node scripts/build-bom.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pact = path.resolve(root, '..')

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '')
  const rows = []
  let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  const [head, ...rest] = rows
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}
const readCsv = (p) => parseCsv(fs.readFileSync(p, 'utf8'))
const desigs = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true })

// ---------- Power management (PW) ----------
const pwRows = readCsv(path.join(pact, 'power-management-master/assembly/power-management-master_parts.csv'))
const pwConfirmOnly = (r) => r.Group.startsWith('Buck modules') || r.Group === 'Mechanical'
const pw = []
for (const r of pwRows) {
  if (!/^\d+$/.test(r.Step)) continue // loose parts are not placed on the board
  const key = `${r.Step}|${r.MPN}|${r.Group.startsWith("Buck modules") ? r.Value : ""}` // the two buck modules are set to different voltages: one line each
  let line = pw.find((l) => l.key === key)
  if (!line) {
    line = { key, board_type: 'PW', step: +r.Step, stage: r.Group, designators: [], values: [], footprint: r['Footprint / Package'],
      manufacturer: r.Manufacturer, mpn: r.MPN, orientation: r.Orientation, notes: r.Notes, scan_required: !pwConfirmOnly(r) }
    pw.push(line)
  }
  line.designators.push(...desigs(r.Designators))
  if (!line.values.includes(r.Value)) line.values.push(r.Value)
}

// ---------- Mainboard (MB) ----------
const mbDir = path.join(pact, 'mainboard-master/PACT_Mainboard_RevA/assembly')
const dk = readCsv(path.join(mbDir, 'PACT_Mainboard_RevA_DigiKey_BOM.csv'))
const mpnByRef = {}
for (const r of dk) for (const d of desigs(r['Customer Reference'])) {
  mpnByRef[d] = { mpn: r['Manufacturer Part Number'], manufacturer: r.Manufacturer }
}
const mbSteps = readCsv(path.join(mbDir, 'PACT_Mainboard_RevA_Soldering_Steps.csv'))
const mb = []
for (const r of mbSteps) {
  const step = parseInt(r.Stage, 10)
  const info = mpnByRef[r.Reference]
  if (!info) throw new Error(`No MPN for ${r.Reference}`)
  const key = `${step}|${info.mpn}`
  let line = mb.find((l) => l.key === key)
  if (!line) {
    line = { key, board_type: 'MB', step, stage: r.Stage.replace(/^\d+\s*/, ''), designators: [], values: [], footprint: r.Footprint,
      manufacturer: info.manufacturer, mpn: info.mpn, orientation: r['Orientation / polarity'],
      notes: [r.Check && `Check: ${r.Check}`, r['Perfboard note']].filter(Boolean).join(' | '),
      scan_required: r.Reference !== 'U1' } // ESP32 DevKit is not an LCSC packaged part
    mb.push(line)
  }
  line.designators.push(r.Reference)
  if (!line.values.includes(r.Value)) line.values.push(r.Value)
}

// LCSC codes come from the order CSV + scripts/lcsc-map.mjs
import { lcscMap, lcscAliases } from './lcsc-map.mjs'
const lcscRows = fs.readdirSync(path.join(root, 'data')).filter((f) => /^lcsc_order_.*.csv$/.test(f)).flatMap((f) => readCsv(path.join(root, 'data', f)))
const lcscOf = {} // 'PW:R4' -> code
for (const [code, targets] of Object.entries(lcscMap)) {
  if (!lcscRows.some((r) => r['LCSC Part Number'] === code)) throw new Error(code + ' is not in the LCSC order CSV')
  for (const t of targets) {
    if (lcscOf[t]) throw new Error(t + ' mapped twice')
    lcscOf[t] = code
  }
}
const codeForLine = (l) => {
  const codes = new Set(l.designators.map((d) => lcscOf[l.board_type + ':' + d] ?? null))
  if (codes.size > 1) throw new Error('Mixed LCSC codes within one BOM line: ' + l.board_type + ' ' + l.designators)
  return [...codes][0]
}

const q = (s) => (s == null || s === '' ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const bath = (board_type) => ({ board_type, step: 0, stage: 'Ultrasonic bath', designators: ['BATH'], values: ['Ultrasonic bath'], footprint: null,
  manufacturer: null, mpn: null, orientation: null, scan_required: false, process: true,
  notes: 'Everything washable is soldered. Remove the parts that must not get wet (they are fitted after this step), run the board through the ultrasonic cleaner, rinse and dry fully.' })
const lines = [...pw, bath('PW'), ...mb, bath('MB')]
const known = new Set(lines.flatMap((l) => l.designators.map((d) => l.board_type + ':' + d)))
for (const t of [...Object.values(lcscMap).flat(), ...Object.values(lcscAliases).flat()]) {
  if (!known.has(t)) throw new Error('Unknown BOM placement in LCSC map: ' + t)
}
// Parts that must not go into the ultrasonic bath: electrolytics, LEDs, modules/DevKit, hardware.
const NOT_WASHABLE = (l) => /electrolytic|\bLEDs?\b|buck module|\bMCU\b|mechanical/i.test(l.stage)
let sort = 0
const values = lines.map((l) => {
  const d = [...new Set(l.designators)].sort(natural)
  return `(${[q(l.board_type), l.step, q(l.stage), `array[${d.map(q).join(',')}]`, q(l.values.join(' / ')), q(l.footprint),
    q(l.manufacturer), q(l.mpn), q(codeForLine(l)), q(l.orientation === '-' ? null : l.orientation), q(l.notes === '-' ? null : l.notes),
    l.scan_required, !NOT_WASHABLE(l), q(l.process ? 'process' : 'part'), ++sort].join(', ')})`
})

const aliasInserts = Object.entries(lcscAliases).flatMap(([code, targets]) => targets.map((t) => {
  const [b, d] = t.split(':')
  return `insert into public.part_aliases (lcsc_code, bom_line_id)\n  select '${code}', id from public.bom_lines where board_type = '${b}' and designators @> array['${d}']\n  on conflict (lcsc_code) do update set bom_line_id = excluded.bom_line_id;`
}))

// 1) Full seed for a fresh database.
fs.writeFileSync(path.join(root, 'supabase/seed.sql'), `-- Generated by scripts/build-bom.mjs - do not edit by hand.
-- Fresh database only: it deletes all BOM lines. For an existing database use supabase/lcsc_codes.sql.
delete from public.bom_lines;
insert into public.bom_lines
  (board_type, step, stage, designators, value, footprint, manufacturer, mpn, lcsc_code, orientation, notes, scan_required, washable, kind, sort)
values
${values.join(',\n')};

${aliasInserts.join('\n')}
`)

// 2) Idempotent LCSC update for a database that already has BOM lines / placements.
const updates = Object.entries(lcscMap).flatMap(([code, targets]) => targets.map((t) => {
  const [b, d] = t.split(':')
  return `update public.bom_lines set lcsc_code = '${code}' where board_type = '${b}' and designators @> array['${d}'];`
}))
fs.writeFileSync(path.join(root, 'supabase/lcsc_codes.sql'), `-- Generated by scripts/build-bom.mjs from data/lcsc_order_WM2610300148.csv + scripts/lcsc-map.mjs.
-- Safe to re-run; keeps existing placements.
${updates.join('\n')}

${aliasInserts.join('\n')}
`)

// 3) Existing database: apply washable flags and add the bath step (idempotent).
const proc = []
for (const l of lines) {
  if (l.process) continue
  const d = l.designators[0]
  proc.push("update public.bom_lines set washable = " + !NOT_WASHABLE(l) + " where board_type = '" + l.board_type + "' and designators @> array['" + d + "'];")
}
for (const t of ['PW', 'MB']) {
  proc.push(`insert into public.bom_lines (board_type, step, stage, designators, value, scan_required, washable, kind, notes, sort)
  select '${t}', 0, 'Ultrasonic bath', array['BATH'], 'Ultrasonic bath', false, true, 'process', ${q(bath(t).notes)}, 0
  where not exists (select 1 from public.bom_lines where board_type = '${t}' and kind = 'process');`)
}
fs.writeFileSync(path.join(root, 'supabase/process_update.sql'),
  `-- Generated by scripts/build-bom.mjs. Run after migration 0003 on an existing database.\n${proc.join('\n')}\n`)

// 4) Ordered LCSC quantities (summed over all order CSVs).
const ordered = new Map()
for (const r of lcscRows) {
  const code = r['LCSC Part Number']
  const o = ordered.get(code) ?? { mpn: r['Manufacture Part Number'], description: r.Description, qty: 0 }
  o.qty += parseInt(r.Quantity, 10) || 0
  ordered.set(code, o)
}
const stockRows = [...ordered].map(([code, o]) => `  (${q(code)}, ${q(o.mpn)}, ${q(o.description)}, ${o.qty})`)
fs.writeFileSync(path.join(root, 'supabase/lcsc_stock.sql'),
  `-- Generated by scripts/build-bom.mjs from data/lcsc_order_*.csv. Run after migration 0004. Re-running resets quantities to the order totals.
insert into public.lcsc_stock (lcsc_code, mpn, description, qty) values
${stockRows.join(',\n')}
on conflict (lcsc_code) do update set mpn = excluded.mpn, description = excluded.description, qty = excluded.qty;
`)

console.log(`PW lines: ${pw.length} (${pw.reduce((n, l) => n + l.designators.length, 0)} placements)`)
console.log(`MB lines: ${mb.length} (${mb.reduce((n, l) => n + l.designators.length, 0)} placements)`)
const withCode = lines.filter((l) => codeForLine(l))
console.log(`Lines with LCSC code: ${withCode.length}/${lines.length}`)
console.log('Scan-required lines WITHOUT a code:')
for (const l of lines.filter((l) => l.scan_required && !codeForLine(l))) console.log(`  ${l.board_type} ${l.designators.join(',')}  ${l.mpn}`)
