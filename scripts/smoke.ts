/**
 * Smoke-test: kutsub kõik tööriistad otse, ILMA LLM-ita.
 * Eesmärk on kontrollida, et API-d vastavad ja arvud on mõistlikud.
 *
 *   npm run smoke            - kõik
 *   npm run smoke -- raie    - ainult nimes "raie" sisaldavad testid
 */
import { loadEnv } from "../src/lib/env.js";
loadEnv();

import {
  raieVsJuurdekasv,
  metsavaruTrend,
  metsasus,
  raieLiigiti,
  raieMaakonnas,
  uuendamine,
  kahjustused,
  leiaMaakonnaKood,
} from "../src/tools/statistika.js";
import {
  m3FromThousands,
  haFromThousands,
  num,
  pct,
  ha,
  m3,
  date,
} from "../src/lib/format.js";
import { otsiAsukoht, leiaAsukoht, paringuAla } from "../src/tools/geocode.js";
import {
  teatisedKatastril,
  teatisedAlal,
  eraldisedKatastril,
  eraldisteKokkuvote,
  mkeAlal,
} from "../src/tools/metsaregister.js";

/** Null on "andmed puuduvad", mitte null hektarit. */
const hOrNull = (v: number | null) => (v === null ? "andmed puuduvad" : ha(v));
const mOrNull = (v: number | null) => (v === null ? "andmed puuduvad" : m3(v));

const filter = process.argv[2]?.toLowerCase();
const tests: { nimi: string; fn: () => Promise<void> }[] = [];

function test(nimi: string, fn: () => Promise<void>) {
  tests.push({ nimi, fn });
}

// ---------------------------------------------------------------------------

test("raie_vs_juurdekasv", async () => {
  const b = await raieVsJuurdekasv();
  console.log(`  aasta:               ${b.aasta}`);
  console.log(
    `  koguraie:            ${m3FromThousands(b.raiemaht)} (SMI veapiir ±${pct(b.raiemahuViga)})`,
  );
  console.log(`  ..sh lageraie:       ${m3FromThousands(b.lageraie)}`);
  console.log(`  puistute pindala:    ${haFromThousands(b.puistutePindala)}`);
  console.log(`  juurdekasv:          ${num(b.juurdekasvHa, 1)} m³/ha aastas`);
  console.log(`  juurdekasv kokku:    ${m3FromThousands(b.juurdekasvKokku)}`);
  console.log(`  raie / juurdekasv:   ${num(b.suhe * 100, 0)}%`);
  console.log(`  puistute üldvaru:    ${m3FromThousands(b.uldvaru)}`);
  const t = b.varuTrend;
  console.log(
    `  varu ${t.algusAasta}->${t.loppAasta}:      ${m3FromThousands(t.algusVaru)} -> ${m3FromThousands(t.loppVaru)} (${t.muutus > 0 ? "+" : ""}${pct(t.muutusPct)})`,
  );
  console.log("");
  console.log(
    `  >>> SIGNAAL 1: raiutakse ${b.suhe < 1 ? "VÄHEM" : "ROHKEM"} kui brutojuurdekasv`,
  );
  console.log(
    `  >>> SIGNAAL 2: tegelik üldvaru ${t.muutus < 0 ? "KAHANEB" : "KASVAB"}`,
  );
  if (b.suhe < 1 && t.muutus < 0) {
    console.log(
      "  >>> VASTUOLU: signaalid on eri suunas. Vastuses tuleb MÕLEMAD välja tuua.",
    );
  }
});

test("metsavaru_trend", async () => {
  const t = await metsavaruTrend(10);
  for (const r of t.read) {
    console.log(
      `  ${r.aasta}  üldvaru ${m3FromThousands(r.uldvaru).padEnd(18)} pindala ${haFromThousands(r.pindala).padEnd(16)} ${num(r.hektarivaru)} m³/ha`,
    );
  }
  console.log(
    `  muutus ${t.esimene.aasta}->${t.viimane.aasta}: ${t.muutusPct > 0 ? "+" : ""}${pct(t.muutusPct)}`,
  );
});

test("metsasus", async () => {
  const m = await metsasus();
  console.log(`  ${m.aasta}: metsasus ${pct(m.metsasusPct)}`);
  console.log(`  metsamaa pindala:  ${haFromThousands(m.metsamaaPindala)}`);
  console.log(`  puistute pindala:  ${haFromThousands(m.puistutePindala)}`);
  console.log(
    `  võrdlus ${m.vordlusAasta}: ${pct(m.vordlusMetsasusPct)}`,
  );
});

test("raie_liigiti", async () => {
  const r = await raieLiigiti();
  console.log(`  ${r.aasta}, koguraie ${m3FromThousands(r.koguraie)}`);
  for (const l of r.liigid) {
    console.log(
      `    ${l.nimi.padEnd(18)} ${m3FromThousands(l.raiemaht).padEnd(18)} ${pct(l.osakaalPct)} koguraiest, ${haFromThousands(l.raiepindala)}`,
    );
  }
});

test("raie_maakonnas", async () => {
  for (const sisend of ["Võrumaal", "Ida-Viru", "Tartu maakond", "Saaremaa"]) {
    const kood = leiaMaakonnaKood(sisend);
    if (!kood) {
      console.log(`  "${sisend}" -> maakonda ei leitud`);
      continue;
    }
    const r = await raieMaakonnas(kood);
    console.log(
      `  "${sisend}" -> ${r.maakond} (${r.aasta}): ${m3(r.raiemaht)}, ${hOrNull(r.raiepindala)}, ${pct(r.osakaalEestistPct)} Eesti raiest`,
    );
    console.log(
      `      riigimets ${mOrNull(r.riigimets)} | erametsa ${mOrNull(r.erametsa)}`,
    );
  }
  console.log("  NB: MM04 = raiedokumendid, EI ole võrreldav SMI arvudega");
});

test("uuendamine", async () => {
  const u = await uuendamine();
  console.log(`  ${u.aasta}, ${u.maakond}`);
  console.log(`  aktiivne uuendamine kokku: ${hOrNull(u.kokku)}`);
  console.log(`    metsaistutus:            ${hOrNull(u.metsaistutus)}`);
  console.log(`      ..kuusk:               ${hOrNull(u.kuuseistutus)}`);
  console.log(`      ..mänd:                ${hOrNull(u.mannistutus)}`);
  console.log(`      ..kask:                ${hOrNull(u.kaseistutus)}`);
  console.log(`    metsakülv:               ${hOrNull(u.metsakulv)}`);
  console.log(
    `    loodusliku uuenemise kaasaaitamine: ${hOrNull(u.looduslikKaasaaitamine)}`,
  );
  console.log(
    `  lageraie pindala (MM04):   ${hOrNull(u.lageraiePindalaDokumendid)}`,
  );
  console.log(`  HOIATUS: ${u.hoiatus}`);
});

test("kahjustused", async () => {
  const k = await kahjustused();
  console.log(`  ${k.aasta}, ${k.maakond}`);
  console.log(`  hukkunud puistud:   ${ha(k.hukkunudKokku)}`);
  for (const p of k.hukkunudPohjused) {
    console.log(`      ${p.nimi.padEnd(28)} ${ha(p.pindala)}`);
  }
  console.log(`  kahjustatud puistud: ${ha(k.kahjustatudKokku)}`);
  for (const p of k.kahjustatudPohjused) {
    console.log(`      ${p.nimi.padEnd(28)} ${ha(p.pindala)}`);
  }
});

// --- Etapp 4: geocode + metsaregister --------------------------------------

const TEST_KATASTER = "46801:003:0053"; // Kädso, Pupli küla, Rõuge vald

test("geocode", async () => {
  for (const p of [
    "Tartu maakond, Kambja vald, Sipe küla",
    TEST_KATASTER,
    "Raekoja plats 1, Tartu",
  ]) {
    const vasted = await otsiAsukoht(p, 2);
    if (vasted.length === 0) {
      console.log(`  "${p}" -> ei leitud`);
      continue;
    }
    const a = vasted[0]!;
    console.log(`  "${p}"`);
    console.log(`      ${a.aadress}  [${a.liik}]`);
    console.log(
      `      L-EST ${num(a.x)} ${num(a.y)} | WGS84 ${a.lat.toFixed(5)},${a.lon.toFixed(5)}`,
    );
    console.log(
      `      kataster=${a.katastritunnus ?? "-"} bbox=${a.bbox ? "olemas" : "puudub"}`,
    );
  }
});

test("teatised_katastril", async () => {
  const k = await teatisedKatastril(TEST_KATASTER);
  console.log(`  kataster ${TEST_KATASTER}: leitud ${k.leitud} teatist`);
  console.log(
    `  kokku ${ha(k.kokkuPindala)}, ${m3(k.kokkuMaht)}, kehtivaid ${k.kehtivaidArv}`,
  );
  for (const l of k.liigid) {
    console.log(
      `      ${l.nimi.padEnd(16)} ${l.arv}x  ${ha(l.pindala).padEnd(10)} ${m3(l.maht)}`,
    );
  }
  for (const t of k.teatised.slice(0, 3)) {
    console.log(
      `      nr ${t.teatiseNr} er.${t.eraldiseNr} ${t.raieliik} ${m3(t.raiutavMaht ?? 0)} otsus=${t.otsus} kehtiv kuni ${date(t.kehtivKuni)} ${t.onKehtiv ? "(KEHTIV)" : "(aegunud)"}`,
    );
  }
});

test("teatised_alal", async () => {
  const a = await leiaAsukoht("Tartu maakond, Kambja vald, Sipe küla");
  if (!a) throw new Error("asukohta ei leitud");
  const ala = paringuAla(a, 1500);
  const k = await teatisedAlal(ala);
  console.log(`  ${a.aadress}, raadius 1500 m`);
  console.log(
    `  leitud ${k.leitud} teatist${k.karbitud ? " (kärbitud)" : ""}, kehtivaid ${k.kehtivaidArv}`,
  );
  console.log(`  kokku ${ha(k.kokkuPindala)}, ${m3(k.kokkuMaht)}`);
  for (const l of k.liigid) {
    console.log(`      ${l.nimi.padEnd(16)} ${l.arv}x ${ha(l.pindala)}`);
  }
});

test("eraldised_katastril", async () => {
  const e = await eraldisedKatastril(TEST_KATASTER);
  const k = eraldisteKokkuvote(TEST_KATASTER, e);
  console.log(
    `  ${k.eraldisteArv} eraldist, ${ha(k.kokkuPindala)}, tagavara ${m3(k.kokkuTagavara)}`,
  );
  console.log(`  riigimets: ${k.onRiigimets ? "jah" : "ei"}`);
  if (k.vanuseVahemik) {
    console.log(`  vanus ${k.vanuseVahemik.min}-${k.vanuseVahemik.max} a`);
  }
  for (const p of k.puuliigid) {
    console.log(`      ${p.nimi.padEnd(14)} ${ha(p.pindala).padEnd(10)} ${pct(p.osakaalPct)}`);
  }
  for (const x of k.eraldised.slice(0, 2)) {
    console.log(
      `      er.${x.eraldiseNr}: ${x.peapuuliik}, ${ha(x.pindala ?? 0)}, ${x.kasvukoht}, ${x.omandivorm}`,
    );
    console.log(
      `          tagavara ${x.tagavaraHa ?? "?"} m³/ha, juurdekasv ${x.juurdekasv ?? "?"} m³/ha, kõrgus ${x.korgus ?? "?"} m`,
    );
    for (const pl of x.puuliigid) {
      console.log(
        `          ${pl.puuliik.padEnd(12)} osakaal ${pl.osakaal ?? "?"}/10 vanus ${pl.vanus ?? "?"} a, d=${pl.diameeter ?? "?"} cm${pl.onEnamuspuuliik ? "  <- enamus" : ""}`,
      );
    }
  }
});

test("mke_alal", async () => {
  const a = await leiaAsukoht(TEST_KATASTER);
  if (!a) throw new Error("asukohta ei leitud");
  const read = await mkeAlal(paringuAla(a, 10_000), 50);
  console.log(`  MKE akte 10 km raadiuses: ${read.length}`);
  for (const m of read.slice(0, 5)) {
    console.log(
      `      akt ${m.aktiNr} ${m.katastritunnus} er.${m.eraldiseNr} ${m.raieliik} ${ha(m.pindala ?? 0)} ${m3(m.maht ?? 0)} kehtiv kuni ${date(m.kehtivKuni)}`,
    );
  }
});

// ---------------------------------------------------------------------------

let ok = 0;
let fail = 0;

for (const t of tests) {
  if (filter && !t.nimi.toLowerCase().includes(filter)) continue;
  console.log(`\n=== ${t.nimi}`);
  const started = Date.now();
  try {
    await t.fn();
    console.log(`  [OK ${Date.now() - started} ms]`);
    ok++;
  } catch (err) {
    console.log(`  [VIGA] ${err instanceof Error ? err.message : String(err)}`);
    fail++;
  }
}

console.log(`\n${ok} õnnestus, ${fail} ebaõnnestus`);
// process.exitCode (mitte process.exit) - vaeldib libuv assertiooni Windowsis
process.exitCode = fail > 0 ? 1 : 0;
