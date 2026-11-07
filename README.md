# PACT Interactive PCB Assembly

Vite + TypeScript + Supabase (auth + database). Guides assembly of the **mainboard** (`PACT_MB_<batch>_<seq>`) and **power-management** (`PACT_PW_<batch>_<seq>`, e.g. `PACT_PW_7m1z1_0001`) boards and records every scanned LCSC part.

## Setup
1. Create a Supabase project. In the SQL editor run `supabase/migrations/0001_init.sql`, `0002_two_scan.sql`, then `supabase/seed.sql`.
2. `cp .env.example .env` and fill in the project URL and anon key.
3. `npm install && npm run dev`. The first account to sign up becomes **admin**; later ones are operators (admins can change roles in Admin).
4. Camera scanning needs HTTPS or localhost. USB scanners work anywhere (they type into the always-focused box).

## Workflow
1. **Scan the board Data Matrix** on the Boards page. The board is registered, or resumed if it already exists.
2. Steps follow the assembly guides. For a part **with an LCSC code**, scan its package QR **before** placing it (accepted only if it belongs to the current step) and **again after soldering** it to confirm. One part is in hand at a time.
   A part matches a BOM line by LCSC code (pc), MPN (pm), or an admin-defined alias. Wrong, too-early or already-complete parts are rejected.
3. Parts **without an LCSC code** (and modules/hardware) are not scanned: place them and press the confirm button.
4. When everything is soldered, **scan the board code again** to sign it off.

Every scan (accepted or rejected) is stored in `scan_events`; every placement records bag (`pbn`), order (`on`), LCSC code and MPN.

## LCSC codes
The BOMs were generated from the PCB projects' CSVs (`npm run gen:bom` rewrites `supabase/seed.sql`). They hold MPNs but mostly no LCSC codes. Matching on `pm` works when LCSC's MPN equals the BOM MPN. Otherwise fill the LCSC code in Admin, or, as admin, press **Link** on a rejected scan.

## Ultrasonic bath order

Each board is built in three phases: washable parts first, then a **Ultrasonic bath** step (confirm with the button), then parts that must not go in the bath (electrolytics, LEDs, buck modules, ESP32 DevKit, hardware). Which lines are washable is the "Washable" checkbox on the Admin BOM tables (defaults come from `scripts/build-bom.mjs`).

## Part stock (non-LCSC parts)

The **Stock** page (admins add/edit, everyone can view and print labels) manages parts that have no LCSC label, e.g. male Dupont headers from any seller. Adding an item generates a barcode `PACT_STK_nnnn` (Code 128). Print it with **Print label** on your label printer, stick it on the bag, and link the item to the BOM lines it can be used for. A linked line is then scanned before and after soldering like an LCSC part, and usage is counted against the received quantity.

## Build check, bring-up tests, trace-back, CSV import

- **Build check** (nav): enter how many power / main boards you want; it compares the BOM demand with LCSC and manual stock (ordered/received − used) and lists shortages. Parts with no LCSC code and no stock item are listed as not tracked.
- **Bring-up test**: appears on a signed-off board. Required checks (rail voltages, short check, ...) must pass; optional ones (solar disconnect, LVD, I2C scan) only count if recorded. Ranges and instructions are in `src/lib/bringup.ts`.
- **Trace** (nav): scan an LCSC bag QR, type a PICK... / WM... / C... code, scan a PACT_STK_ label -> every board that used it. Scan a board code -> which bags went onto it.
- **Admin → Import LCSC order**: upload an LCSC order CSV. It adds the ordered quantities and can link CSV parts to BOM lines (MPN matches are pre-selected). A file imported twice asks for confirmation.

## Board map (3D / 2D)

The board page has a **Board map** card. The current step's parts are orange, the next target is green (click a part to pick it) and the part to solder is red. 3D uses `public/models/<MB|PW>.glb` (exported from the KiCad boards with `kicad-cli`, nodes named by reference designator); parts without a 3D model (test points, buck modules, DevKit, standoffs) get a translucent marker box at their footprint position. 2D is drawn from `public/models/<MB|PW>.json` and is the automatic fallback when WebGL or the model is unavailable. Regenerate both after a PCB change with `node scripts/build-models.mjs` (needs KiCad's `kicad-cli`; set `KICAD_CLI` if it is not found) and commit the files.
