import { loadEnv } from "../src/lib/env.js";
loadEnv();
import { uusKontekst } from "../src/router/kontekst.js";
import { vasta } from "../src/pipeline.js";

const kontekst = uusKontekst();
const voog = [
  // Asukoha põhine küsimus - seab mällu asukoha (Rõuge vald, Pupli küla, Kädso)
  "Kas kinnistul 46801:003:0053 on raieluba?",
  // Asesõnaline jätkuküsimus peaks kasutama eelmist asukohta
  "Kas see on kaitse all?",
  "Mis seal kasvab?",
  // Uus küsimus ILMA asukohata - ei tohi vana asukohta sisse segada
  "Palju on terves Eestis metsa?",
  // Maakonnapõhine, siis jätkuküsimus uue maakonnaga
  "Kui palju raiuti Võrumaal?",
  "Aga Ida-Virumaal?",
  // ──── Aasta-konteksti test ────
  // Aasta peab jätkuküsimusse kanduma
  "Kui palju raiuti Tartumaal 2023. aastal?",
  "Aga Pärnumaal?",              // peab jääma 2023-sse, mitte hüppama 2025
  "Aga 2019?",                   // peab kasutama eelmist maakonda (Pärnumaa) + uus aasta
  "Kui palju raiuti Eestis 2020. aastal kokku?", // uus küsimus, aasta=2020, riik
  "Aga 2022?",                   // peab jääma riiklikule tasandile, mitte maakonnale
];

for (const q of voog) {
  const v = await vasta(q, { kontekst });
  const graafik = v.graafik
    ? ` | graafik:${v.graafik.tyyp}/${v.graafik.sildid.length}`
    : "";
  console.log(
    `> ${q}\n  [${v.intent}]${v.kontekstiSelgitus ? " " + v.kontekstiSelgitus : ""} ${v.kestusMs}ms${graafik}\n  ${(v.tekst.split("\n")[0] ?? "").replace(/\*\*/g, "").slice(0, 90)}`,
  );
}
