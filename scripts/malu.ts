import { loadEnv } from "../src/lib/env.js";
loadEnv();
import { uusKontekst } from "../src/router/kontekst.js";
import { vasta } from "../src/pipeline.js";

const kontekst = uusKontekst();
const voog = [
  "Kas kinnistul 46801:003:0053 on raieluba?",
  "Kas see on kaitse all?",            // asesõna -> eelmine asukoht
  "Mis seal kasvab?",                  // asesõna -> eelmine asukoht
  "Kui palju raiuti Võrumaal?",
  "Aga Tartumaal?",                    // jätkuküsimus, uus maakond
  "Ja Saaremaal?",
  "Kui hull on kooreüraskiolukord?",
  "Aga Ida-Virumaal?",                 // jätkab kahjustused-intenti
];

for (const q of voog) {
  const v = await vasta(q, { kontekst });
  const esimene = v.tekst.split("\n")[0]!.replace(/\*\*/g, "").slice(0, 95);
  console.log(`\n> ${q}`);
  console.log(`  [${v.intent}] ${v.kontekstiSelgitus ? "(" + v.kontekstiSelgitus + ") " : ""}${v.kestusMs} ms`);
  console.log(`  ${esimene}`);
}
console.log(`\nmälu: asukoht=${kontekst.viimaneAsukohaNimi} maakond=${kontekst.viimaneMaakonnaNimi} kysimusi=${kontekst.kysimusi}`);
