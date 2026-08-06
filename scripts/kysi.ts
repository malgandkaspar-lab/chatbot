/**
 * Vestlus terminalis, ILMA LLM-ita. Kiireim viis kogu voo testimiseks.
 *
 *   npx tsx scripts/kysi.ts "kas metsa raiutakse rohkem kui juurde kasvab"
 *   npx tsx scripts/kysi.ts            (interaktiivne)
 */
import { loadEnv } from "../src/lib/env.js";
loadEnv();

import { createInterface } from "node:readline/promises";
import { vasta } from "../src/pipeline.js";

async function kysi(kysimus: string): Promise<void> {
  const v = await vasta(kysimus);
  console.log("");
  console.log(v.tekst);
  if (v.allikad.length > 0) {
    console.log("");
    console.log(`Allikas: ${v.allikad.join("; ")}`);
  }
  for (const h of v.hoiatused) {
    console.log("");
    console.log(`NB: ${h}`);
  }
  console.log("");
  console.log(
    `[intent=${v.intent} ruuter=${v.ruuter}/${v.ruuteriPohjus} ${v.kestusMs} ms]`,
  );
}

const argument = process.argv.slice(2).join(" ").trim();

if (argument) {
  await kysi(argument);
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("Metsabot (ilma LLM-ita). Tühi rida või Ctrl+C lõpetab.\n");
  for (;;) {
    const rida = (await rl.question("> ")).trim();
    if (!rida) break;
    try {
      await kysi(rida);
    } catch (err) {
      console.log(`\nViga: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
  rl.close();
}
