import { loadEnv } from "../src/lib/env.js";
loadEnv();
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { uusKontekst } from "../src/router/kontekst.js";
import { vasta } from "../src/pipeline.js";

/**
 * Generatiivsed näiteküsimused-vastused: katavad kõik intentid ja
 * salvestatakse JSON-faili (docs/naited.json). Lehel neid ei kuvata -
 * fail on arenduseks ja testimiseks, et näha, kuidas bot eri küsimustele
 * vastab ilma lehte avamata.
 *
 * Käivitamine:  npm run naited   (või:  npx tsx scripts/naited.ts)
 * NB! Vajab andmete-APIde ligipääsu (nagu servergi).
 */

// Iga kirje: küsimus + soovitud intent (kontrollime, et ruuter tabab)
const NAIDED: { kysimus: string; oodatudIntent: string }[] = [
  // --- Üleriigilised numbrilised intentid ---
  { kysimus: "Kas metsa raiutakse rohkem, kui seda juurde kasvab?", oodatudIntent: "raie_vs_juurdekasv" },
  { kysimus: "Kuidas on Eesti metsavaru ajas muutunud?", oodatudIntent: "metsavaru_trend" },
  { kysimus: "Kui suur osa Eestist on metsa all?", oodatudIntent: "metsasus" },
  { kysimus: "Mis osa raiest on lageraie?", oodatudIntent: "raie_liigiti" },
  { kysimus: "Kui palju raiuti Eestis kokku metsa 2023. aastal?", oodatudIntent: "raie_kogus" },
  { kysimus: "Kui palju raiuti Võrumaal 2022. aastal?", oodatudIntent: "raie_maakonnas" },
  { kysimus: "Kui palju metsa Eestis istutatakse?", oodatudIntent: "uuendamine" },
  { kysimus: "Kui hull on kooreüraskiolukord?", oodatudIntent: "kahjustused" },

  // --- Asukohapõhised (kasutame smokes testitud katastritunnuseid) ---
  { kysimus: "Kas kinnistul 46801:003:0053 on raieluba?", oodatudIntent: "teatised_asukohas" },
  { kysimus: "Mis metsa kasvab katastriüksusel 46801:003:0053?", oodatudIntent: "eraldise_info" },
  { kysimus: "Kas kinnistu 46801:003:0053 jääb Natura alale?", oodatudIntent: "kaitsealad_asukohas" },

  // --- Reeglid ja tundmatu ---
  { kysimus: "Mis vanuses tohib männikut lageraiuda?", oodatudIntent: "reeglid" },
  { kysimus: "Mis vahe on turberaiel ja lageraiel?", oodatudIntent: "reeglid" },
  { kysimus: "Kui kaua metsateatis kehtib?", oodatudIntent: "reeglid" },
  { kysimus: "Mis ilm täna on?", oodatudIntent: "tundmatu" },
];

const valjund = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/naited.json",
);

const kontekst = uusKontekst();
const kirjed: unknown[] = [];
let vigu = 0;

for (const n of NAIDED) {
  try {
    const v = await vasta(n.kysimus, { kontekst });
    const langes = v.intent === n.oodatudIntent;
    if (!langes) vigu++;
    kirjed.push({
      kysimus: n.kysimus,
      intent: v.intent,
      oodatudIntent: n.oodatudIntent,
      tabavus: langes ? "OK" : "LAHKNE",
      ruuter: v.ruuter,
      kestusMs: v.kestusMs,
      allikad: v.allikad ?? [],
      tekst: v.tekst,
    });
    console.log(
      `${langes ? "OK  " : "LAHK"} [${v.intent}] ${n.kysimus}  (${v.kestusMs}ms)`,
    );
  } catch (err) {
    vigu++;
    kirjed.push({
      kysimus: n.kysimus,
      viga: err instanceof Error ? err.message : String(err),
    });
    console.error(`VIGA [${n.oodatudIntent}] ${n.kysimus}: ${(err as Error).message}`);
  }
}

await mkdir(dirname(valjund), { recursive: true });
const dokument = {
  loodud: new Date().toISOString(),
  arv: kirjed.length,
  vigu,
  kirjed,
};
await writeFile(valjund, JSON.stringify(dokument, null, 2), "utf8");
console.log(`\nSalvestatud: ${valjund} (${kirjed.length} kirjet, ${vigu} viga)`);

if (vigu > 0) process.exitCode = 1;
