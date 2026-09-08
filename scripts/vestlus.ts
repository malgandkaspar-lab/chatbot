/**
 * Läbib näidisküsimuste komplekti ja näitab, millise intenti ruuter valis.
 * Eesmärk on tabada valesti marsruuditud küsimusi.
 *
 *   npx tsx scripts/vestlus.ts          - ainult ruuteri otsused
 *   npx tsx scripts/vestlus.ts --tais   - ka vastuste tekst
 */
import { loadEnv } from "../src/lib/env.js";
loadEnv();

import { marsruudi } from "../src/router/regex.js";
import { vasta } from "../src/pipeline.js";

const taisVastus = process.argv.includes("--tais");

/** [küsimus, oodatud intent] */
const KOMPLEKT: [string, string][] = [
  // raie vs juurdekasv
  ["Kas metsa raiutakse rohkem kui seda juurde kasvab?", "raie_vs_juurdekasv"],
  ["Kas Eestis raiutakse liiga palju metsa?", "raie_vs_juurdekasv"],
  ["Kas Eesti mets saab otsa?", "raie_vs_juurdekasv"],
  ["Kas raiemaht ületab juurdekasvu?", "raie_vs_juurdekasv"],
  ["Kas metsandus on Eestis jätkusuutlik?", "raie_vs_juurdekasv"],

  // metsavaru
  ["Kui palju muutub Eesti metsavaru?", "metsavaru_trend"],
  ["Kas Eesti puiduvaru suureneb või väheneb?", "metsavaru_trend"],

  // metsasus
  ["Kui suur osa Eestist on metsa all?", "metsasus"],
  ["Mis on Eesti metsasus?", "metsasus"],
  ["Kui metsane on Eesti?", "metsasus"],
  ["Kui suur osa Eestist on metsaga kaetud?", "metsasus"],
  ["Mis on metsamaa osakaal Eestis?", "metsasus"],
  // Maakonna kohta on vastus aus: riigi näit + märkus, et maakonna kaupa pole
  ["Kui suur osa Saaremaast on metsaga kaetud?", "metsasus"],

  // raie liigiti
  ["Kui palju on lageraiet võrreldes harvendusraiega?", "raie_liigiti"],
  ["Mis osa raiest on lageraie?", "raie_liigiti"],

  // raie kogu Eestis
  ["Kui palju raiuti Eestis kokku metsa 2025. aastal?", "raie_kogus"],
  ["Kui palju puitu raiuti Eestis kokku?", "raie_kogus"],
  ["Palju on Eesti aastane raiemaht?", "raie_kogus"],
  // Raieverb ei tohi sattuda metsasuse alla, kuigi lauses on "eestis metsa"
  ["Kui palju raiuti eestis metsa eelmine aasta?", "raie_kogus"],
  ["Kui palju metsa raiuti Eestis möödunud aastal?", "raie_kogus"],

  // maakond
  ["Kui palju raiuti Võrumaal?", "raie_maakonnas"],
  ["Kui palju metsa raiutakse Ida-Virumaal?", "raie_maakonnas"],
  ["Kui palju raiuti Saaremaal?", "raie_maakonnas"],

  // uuendamine
  ["Kui palju metsa istutatakse?", "uuendamine"],
  ["Kas raiesmikke uuendatakse?", "uuendamine"],
  ["Kas raiesmikke taasmetsastatakse?", "uuendamine"],
  ["Palju istikuid istutatakse?", "uuendamine"],

  // kahjustused
  ["Kui hull on kooreüraskiolukord?", "kahjustused"],
  ["Kui palju metsa hukkub tormide tõttu?", "kahjustused"],

  // teatised
  ["Kas kinnistul 46801:003:0053 on raieluba?", "teatised_asukohas"],
  ["Kas katastriüksusel 46801:003:0053 on metsateatis?", "teatised_asukohas"],
  ["Kas mu naabri kinnistul on raiet plaanitud, Pupli küla?", "teatised_asukohas"],

  // eraldise info
  ["Mis metsa kasvab katastriüksusel 46801:003:0053?", "eraldise_info"],
  ["Kui vana on mets kinnistul 46801:003:0053?", "eraldise_info"],
  ["Mitu eraldist on katastriüksusel 46801:003:0053?", "eraldise_info"],

  // kaitsealad
  ["Kas kinnistu 46801:003:0053 on kaitse all?", "kaitsealad_asukohas"],
  ["Kas katastriüksus 46801:003:0053 jääb Natura alale?", "kaitsealad_asukohas"],

  // reeglid
  ["Mis vanuses tohib männikut lageraiuda?", "reeglid"],
  ["Kui suur tohib lageraielank olla?", "reeglid"],
  ["Kas kevadel tohib metsa raiuda?", "reeglid"],
  ["Kas ma pean raiesmiku uuendama ja mis on tähtaeg?", "reeglid"],
  ["Kui kaua metsateatis kehtib?", "reeglid"],
  ["Mis vahe on turberaiel ja lageraiel?", "reeglid"],
  ["Kui palju säilikpuid tuleb alles jätta?", "reeglid"],
  ["Mis on metsaseaduse kohased raievanused?", "reeglid"],
  ["Mitu aastat pean raiesmiku uuendama?", "reeglid"],
  // "tohin" (mitte "tohib") ei tohi minna raie_liigiti alla
  ["Mul on kolm hektarit metsa, kas tohin lageraie teha?", "reeglid"],
  ["Kui vana peab mets olema enne raiet?", "reeglid"],

  // ilm
  ["Mis ilm täna on?", "ilm"],
  ["Mis ilm on homme?", "ilm"],
  ["Kas täna sajab?", "ilm"],
  ["Kas sajab?", "ilm"],
  ["Mis temperatuur Tartus praegu on?", "ilm"],
  ["Kas Tallinnas sajab?", "ilm"],
  ["Mis ilm Pärnus on?", "ilm"],
  ["Milline ilm on Rakveres?", "ilm"],
  ["Räägi mulle ilmast", "ilm"],
  ["Kuidas on ilm Tallinna lähistel?", "ilm"],

  // tundmatu
  ["Kui kaua elab kilpkonn?", "tundmatu"],
  ["Tere!", "tundmatu"],
  // päikese tõusu/loojangu aega meil pole - aus vastus on "ei oska"
  ["Mis kell päike loojub?", "tundmatu"],
];

let ok = 0;
const valed: string[] = [];

for (const [kysimus, oodatud] of KOMPLEKT) {
  const r = marsruudi(kysimus);
  const saadud = r.paring.intent;
  const klapib = saadud === oodatud;
  if (klapib) ok++;
  else valed.push(`  "${kysimus}"\n      oodatud=${oodatud}  saadud=${saadud} (${r.pohjus})`);

  const params = Object.entries(r.paring)
    .filter(([k]) => k !== "intent")
    .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
    .join(" ");

  console.log(
    `${klapib ? "OK  " : "VALE"} ${saadud.padEnd(20)} ${params.padEnd(30)} "${kysimus}"`,
  );
}

console.log(`\n${ok}/${KOMPLEKT.length} õigesti marsruuditud`);
if (valed.length > 0) {
  console.log("\nValesti:");
  console.log(valed.join("\n"));
}

if (taisVastus) {
  console.log("\n\n===== TÄISVASTUSED =====");
  for (const [kysimus] of KOMPLEKT) {
    console.log(`\n\n########## ${kysimus}`);
    try {
      const v = await vasta(kysimus);
      console.log(v.tekst);
      if (v.allikad.length) console.log(`\nAllikas: ${v.allikad.join("; ")}`);
      for (const h of v.hoiatused) console.log(`\nNB: ${h}`);
      console.log(`\n[${v.intent} ${v.kestusMs} ms]`);
    } catch (err) {
      console.log(`VIGA: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

process.exitCode = valed.length > 0 ? 1 : 0;
