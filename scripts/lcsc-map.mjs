// LCSC part number -> BOM placements it is used for, as "BOARD:DESIGNATOR".
// Source orders: data/lcsc_order_*.csv. Exact-MPN matches are noted "=", deliberate substitutes "~".
export const lcscMap = {
  C694551: ['PW:C8'],                              // ~ TDK FG24X7R1H105KRT06 1uF 50V (BOM: FG28X7R1E105KRT06 1uF 25V), 5 mm pitch
  C3028822: ['PW:D5', 'PW:D6'],                    // ~ MEIHUA green 3 mm LED (BOM: WP710A10GD)
  C2564: ['PW:Q4'],                                // = IRF4905PBF
  C1575407: ['PW:U2'],                             // ~ TL431BILP (BOM: TL431BCLP), both TO-92 0.5 %
  C107290: ['MB:Q2'],                              // = 2N7000TA
  C9114: ['PW:Q3'],                                // = 2N7000
  C1369905: ['PW:R4'],                             // = 470R
  C3537012: ['PW:R10'],                            // = 220R
  C632588: ['PW:Q2'],                              // = TP2104N3-G
  C15127: ['MB:Q1'],                               // = AO3401A
  C6300650: ['PW:R1', 'MB:R7', 'MB:R8'],           // = 100R
  C38774: ['PW:Q1'],                               // = IRLZ44NPBF
  C1370982: ['PW:R13'],                            // = 27K
  C3204125: ['PW:F1'],                             // = 0031.8201
  C413563: ['PW:F2'],                              // = RXEF160
  C1519255: ['PW:R5', 'PW:R17', 'MB:R4', 'MB:R5'], // = 10K
  C109225: ['PW:U1'],                              // ~ LTV-817-C (BOM: EL817, same DIP-4 footprint per README)
  C180188: ['PW:D1'],                              // = SB560
  C109066: ['PW:C3', 'PW:C5'],                     // ~ Rubycon 16ZLH470M 470uF 16V 8x11.5 (BOM: EEU-FR1C471)
  C241989: ['PW:D7'],                              // = 1N4744A-TAP
  C3371307: ['PW:R3', 'PW:R16'],                   // = 1M
  C3454390: ['PW:R7'],                             // = 2K2
  C131334: ['MB:J4'],                              // = B4B-PH-K-S(LF)(SN)
  C1370651: ['PW:R2', 'PW:R8', 'PW:R11', 'PW:R12'],// ~ MFR-25FTF52-100K (BOM: MFR-25FBF52-100K)
  C1364283: ['PW:R15'],                            // = 20K
  C6369271: ['PW:D2'],                             // = 1N4742A-TAP
  C1364484: ['PW:R18', 'MB:R3', 'MB:R6'],          // = 1K
  C3507801: ['PW:R14'],                            // = 80K6
  C342794: ['PW:C2', 'PW:C4', 'PW:C6', 'PW:C7', 'MB:C1', 'MB:C2'], // = FG28X7R1H104KNT06 (5 mm pitch also fits MB C1/C2 footprint)
  C173023: ['PW:R6', 'MB:R1', 'MB:R2'],            // ~ MFR-25FTE52-4K7 (BOM: MFR-25FBF52-4K7)
  C84734: ['PW:D4'],                               // ~ P6KE33CA/B (BOM: P6KE33CA)
  C3690543: ['MB:C4'],                             // ~ KEMET C315C104K5R5TA (BOM: C320C104K5R5TA), 2.54 mm pitch
  C1369890: ['PW:R9'],                             // = 47K
  C143658: ['PW:D3'],                              // = 1N5408-E3/54
  // --- order WM2610310379 (connectors) ---
  C144394: ['MB:J5'],                              // = B3B-XH-A(LF)(SN)
  C144395: ['MB:J1', 'MB:J2', 'MB:J3'],            // = B4B-XH-A(LF)(SN)
  C157972: ['MB:J7'],                              // = B8B-XH-A(LF)(SN)
  C144397: ['MB:J9', 'PW:J4'],                     // = B6B-XH-A(LF)(SN)
  C480503: ['PW:J1', 'PW:J2'],                     // = Phoenix 1755736
  C480510: ['PW:J3'],                              // = Phoenix 1755752
  C50950: ['MB:J8'],                               // ~ BOOMELE 1x5 female header (BOM: Sullins PPTC051LFBN-RC)
  C2905418: ['MB:J6'],                             // ~ kinghelm 1x10 female header (BOM: Sullins PPTC101LFBN-RC)
  // C2895846 (1x40 male pin header / "male Dupont") is intentionally NOT mapped: it may come from any seller, track it as manual stock.
  // Not on-board placements (loose parts): C3715628 shunt, C90073 + C699486 mating plugs.
  // C1579437 EEU-FR1C471B is intentionally unmapped: the -B suffix is the 5 mm pitch version (see mainboard DigiKey BOM note).
}

// Extra codes that are an acceptable alternative for a placement that already has its own code.
export const lcscAliases = {
  C9114: ['MB:Q2'],   // plain 2N7000 can replace 2N7000TA
  C107290: ['PW:Q3'], // 2N7000TA can replace 2N7000
}
