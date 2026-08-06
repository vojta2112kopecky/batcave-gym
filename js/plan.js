// ============================================================
// TRÉNINKOVÝ PLÁN – staženo z app.trenerpetr.cz
// Vlastní split · A prsa/ramena/triceps · B záda/biceps · C nohy
// Rotace po týdnech: A B – A B – –  /  A B – A C – –
//
// sets: type prep = rozcvičovací, work = pracovní
//       from–to = cílový rozsah opakování
//       kg = výchozí váha PRO TENHLE SET (prep bývá lehčí než pracovní)
// Váhy označené ★ jsou reálné z tréninku 26. 7. 2026, zbytek je odhad
// – po prvním odcvičení si je appka přepíše tvými čísly.
// ============================================================
const DEFAULT_PLAN = {
  source: "Trenér Petr · Vlastní split · 4× týdně",
  version: 10,
  meta: { level: "Pokročilý", freq: "4× týdně", rotation: 3 },
  // pauzy: po přípravné sérii i mezi přípravnou a pracovní 1:30,
  // mezi pracovními sériemi 1:45, mezi cviky 2:00
  restPrep: 90,
  restWork: 105,
  restBetweenExercises: 120,
  // kolik tréninků po sobě musíš dát horní hranici, než appka přidá kilo
  progressAfter: 2,
  // dvoutýdenní rotace, 1 = pondělí … 7 = neděle
  //   lichý týden:  A B – A B – –
  //   sudý týden:   A B – A C – –   (C = nohy)
  rotation: {
    a: { 1: "A", 2: "B", 4: "A", 5: "B" },
    b: { 1: "A", 2: "B", 4: "A", 5: "C" },
  },
  schedule: { 1: "A", 2: "B", 4: "A", 5: "B" },
  // konkrétní dny přebíjejí běžný rozvrh (null = volno) – mění se v appce
  overrides: {},
  workouts: [
    {
      id: "A", name: "TRÉNINK A", focus: "Prsa · Ramena · Triceps",
      exercises: [
        {
          id: "chest-upper-incline-smith-bench", name: "Tlaky na šikmé lavici v multipressu",
          sub: "Vrchní část prsou", part: "Prsa", step: 5, rest: 155, restPrep: 95,
          sets: [
            { type: "prep", from: 8, to: 10, kg: 25 },
            { type: "prep", from: 8, to: 10, kg: 30 },
            { type: "work", from: 4, to: 6, kg: 45 },
            { type: "work", from: 8, to: 10, kg: 40 }, // ★
          ],
        },
        {
          id: "chest-mid-flat-dumbbell-bench", name: "Tlaky na rovné lavici s jednoručkami",
          sub: "Středy a spodky prsou", part: "Prsa", step: 2, rest: 125, restPrep: 95,
          sets: [
            { type: "prep", from: 8, to: 10, kg: 17 }, // ★
            { type: "work", from: 8, to: 10, kg: 25 }, // ★
            { type: "work", from: 8, to: 10, kg: 22 }, // ★
          ],
        },
        {
          id: "chest-fly-machine", name: "Rozpažování na rovné lavici s jednoručkami",
          sub: "Prsa", part: "Prsa", step: 2, rest: 95, restPrep: 80,
          sets: [
            { type: "work", from: 10, to: 15, kg: 31 }, // ★
            { type: "work", from: 10, to: 15, kg: 31 }, // ★
            { type: "work", from: 10, to: 15, kg: 31 },
          ],
        },
        {
          id: "shoulders-side-dumbbell-lateral", name: "Upažování s jednoručkami",
          sub: "Boční delty", part: "Ramena", step: 1, rest: 95, restPrep: 65,
          sets: [
            { type: "work", from: 10, to: 15, kg: 7 }, // ★
            { type: "work", from: 10, to: 15, kg: 8 }, // ★
            { type: "work", from: 10, to: 15, kg: 8 },
          ],
        },
        {
          id: "triceps-lateral-pushdown", name: "Stahování kladky",
          sub: "Laterální a mediální hlava", part: "Triceps", step: 2.5, rest: 95, restPrep: 65,
          sets: [
            { type: "prep", from: 10, to: 12, kg: 15 },
            { type: "prep", from: 10, to: 12, kg: 20 },
            { type: "work", from: 8, to: 10, kg: 25 },
            { type: "work", from: 8, to: 10, kg: 25 },
          ],
        },
        {
          id: "triceps-long-seated-flat-smith-french-press", name: "Francouzské tlaky vstoje v multipressu",
          sub: "Dlouhá hlava", part: "Triceps", step: 5, rest: 125, restPrep: 80,
          sets: [
            { type: "prep", from: 10, to: 12, kg: 15 },
            { type: "work", from: 8, to: 10, kg: 25 },
            { type: "work", from: 8, to: 10, kg: 25 },
          ],
        },
      ],
    },
    {
      id: "B", name: "TRÉNINK B", focus: "Záda · Biceps",
      exercises: [
        {
          id: "back-lower-close-neutral-row", name: "Veslování úzkým paralelním úchopem",
          sub: "Spodní část zad", part: "Záda", step: 5, rest: 155, restPrep: 95,
          sets: [
            { type: "prep", from: 8, to: 10, kg: 35 },
            { type: "prep", from: 8, to: 10, kg: 45 },
            { type: "work", from: 8, to: 10, kg: 55 },
            { type: "work", from: 8, to: 10, kg: 55 },
          ],
        },
        {
          id: "back-mid-smith-wide-row", name: "Veslování širokým úchopem nadhmatem",
          sub: "Střed zad", part: "Záda", step: 5, rest: 125, restPrep: 95,
          sets: [
            { type: "prep", from: 8, to: 10, kg: 30 },
            { type: "work", from: 8, to: 10, kg: 40 },
            { type: "work", from: 8, to: 10, kg: 40 },
          ],
        },
        {
          id: "back-lats-upper-wide-pulldown", name: "Stahování horní kladky širokým úchopem",
          sub: "Latissimy – horní a vnější vlákna", part: "Záda", step: 5, rest: 125, restPrep: 95,
          sets: [
            { type: "prep", from: 8, to: 10, kg: 40 },
            { type: "work", from: 8, to: 10, kg: 55 },
            { type: "work", from: 8, to: 10, kg: 55 },
          ],
        },
        {
          id: "back-lats-lower-close-pulldown", name: "Stahování horní kladky úzkým paralelním úchopem",
          sub: "Latissimy – spodní a střední vlákna", part: "Záda", step: 5, rest: 125, restPrep: 95,
          sets: [
            { type: "work", from: 8, to: 10, kg: 50 },
            { type: "work", from: 8, to: 10, kg: 50 },
          ],
        },
        {
          id: "biceps-both-dumbbell-curl", name: "Zdvihy s jednoručkami bez vytáčení",
          sub: "Dlouhá a krátká hlava", part: "Biceps", step: 1, rest: 95, restPrep: 65,
          sets: [
            { type: "prep", from: 10, to: 12, kg: 8 },
            { type: "prep", from: 10, to: 12, kg: 10 },
            { type: "work", from: 8, to: 10, kg: 12 },
            { type: "work", from: 8, to: 10, kg: 12 },
          ],
        },
        {
          id: "biceps-short-preacher-curl", name: "Scottova lavice",
          sub: "Krátká hlava", part: "Biceps", step: 2.5, rest: 95, restPrep: 65,
          sets: [
            { type: "work", from: 8, to: 10, kg: 20 },
            { type: "work", from: 8, to: 10, kg: 20 },
          ],
        },
      ],
    },
    {
      id: "C", name: "TRÉNINK C", focus: "Nohy",
      exercises: [
        {
          id: "legs-hams-lying-leg-curl", name: "Zakopávání vleže",
          sub: "Zadní stehna", part: "Nohy", step: 5, rest: 125, restPrep: 95,
          sets: [
            { type: "prep", from: 10, to: 15, kg: 25 },
            { type: "prep", from: 10, to: 15, kg: 30 },
            { type: "work", from: 10, to: 15, kg: 35 },
            { type: "work", from: 10, to: 15, kg: 35 },
          ],
        },
        {
          id: "legs-quads-leg-press", name: "Leg press",
          sub: "Přední stehna", part: "Nohy", step: 10, rest: 185, restPrep: 95,
          sets: [
            { type: "prep", from: 8, to: 10, kg: 80 },
            { type: "prep", from: 8, to: 10, kg: 100 },
            { type: "work", from: 8, to: 10, kg: 120 },
            { type: "work", from: 8, to: 10, kg: 120 },
          ],
        },
        {
          id: "legs-quads-seated-leg-extension", name: "Předkopávání vsedě",
          sub: "Přední stehna", part: "Nohy", step: 5, rest: 125, restPrep: 80,
          sets: [
            { type: "prep", from: 10, to: 15, kg: 30 },
            { type: "prep", from: 10, to: 15, kg: 40 },
            { type: "work", from: 10, to: 15, kg: 45 },
            { type: "work", from: 10, to: 15, kg: 45 },
          ],
        },
        {
          id: "legs-calves-seated-calf-raise", name: "Výpony vsedě",
          sub: "Lýtka", part: "Nohy", step: 5, rest: 80, restPrep: 65,
          sets: [
            { type: "work", from: 15, to: 25, kg: 40 },
            { type: "work", from: 15, to: 25, kg: 40 },
            { type: "work", from: 15, to: 25, kg: 40 },
            { type: "work", from: 15, to: 25, kg: 40 },
          ],
        },
      ],
    },
  ],
};
