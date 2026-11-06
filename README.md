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
