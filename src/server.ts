import { loadEnv, envNum, envBool } from "./lib/env.js";
loadEnv();

import express from "express";
import { resolve } from "node:path";
import { vasta } from "./pipeline.js";
import { llmRuuter } from "./llm/router.js";
import { tervisekontroll, chatStream } from "./llm/ollama.js";
import { VASTAJA_PROMPT } from "./llm/prompts.js";
import { KIRJELDUSED } from "./router/intents.js";
import {
  leiaSeanss,
  kustutaSeanss,
  seansideArv,
} from "./router/kontekst.js";

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(express.static(resolve(process.cwd(), "public")));

const llmLubatud = () => envBool("LLM_ENABLED", true);

app.get("/api/tervis", async (_req, res) => {
  const llm = await tervisekontroll();
  res.json({
    ok: true,
    llm,
    /** Bot töötab ka ilma LLM-ita - see on lisand, mitte sõltuvus. */
    sabloonidToovad: true,
    seansse: seansideArv(),
  });
});

app.get("/api/intents", (_req, res) => {
  res.json(KIRJELDUSED);
});

/**
 * Küsimuse töötlemine SSE-na.
 *
 * Sündmused:
 *   staatus  - lühike edenemisteade ("otsin andmeid...")
 *   vastus   - valmis vastus (šabloonist, kiire tee)
 *   tykk     - LLM-i voogedastuse tükk (ainult tundmatu intenti korral)
 *   lopp     - metaandmed ja lõpetamine
 *   viga     - veateade
 */
/** Vestluse mälu lähtestamine. */
app.post("/api/uus", (req, res) => {
  const id = String((req.body as { seanss?: unknown })?.seanss ?? "").trim();
  if (id) kustutaSeanss(id);
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const keha = req.body as { kysimus?: unknown; seanss?: unknown };
  const kysimus = String(keha?.kysimus ?? "").trim();
  const seanssId = String(keha?.seanss ?? "").trim();
  // Mälu on seansipõhine. Ilma ID-ta töötab bot mäluta.
  const kontekst = seanssId ? leiaSeanss(seanssId) : null;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const saada = (syndmus: string, andmed: unknown) => {
    res.write(`event: ${syndmus}\ndata: ${JSON.stringify(andmed)}\n\n`);
  };

  if (!kysimus) {
    saada("viga", { sonum: "Küsimus on tühi" });
    return res.end();
  }

  const algus = Date.now();
  try {
    saada("staatus", { sonum: "Otsin andmeid…" });

    // LLM-ruuter antakse kaasa ainult siis, kui see on lubatud. Pipeline
    // kutsub seda ainult juhul, kui regex vastet ei leidis.
    const ruuter = llmLubatud()
      ? async (k: string) => {
          llmKasutatud = true;
          saada("staatus", {
            sonum: "Küsimus ei sobitunud tuntud mustriga, mõtlen",
          });
          return llmRuuter(k);
        }
      : undefined;

    const v = await vasta(kysimus, { llmRuuter: ruuter, kontekst });

    // Kui vastus tugines varasemale vestlusele, ütleme seda kohe välja
    if (v.kontekstiSelgitus) {
      saada("kontekst", { sonum: v.kontekstiSelgitus });
    }

   
    saada("vastus", { tekst: v.tekst });
    saada("lopp", {
      intent: v.intent,
      ruuter: v.ruuter,
      ruuteriPohjus: v.ruuteriPohjus,
      allikad: v.allikad,
      hoiatused: v.hoiatused,
      ...(v.graafik ? { graafik: v.graafik } : {}),
      malu: kontekst
        ? {
            asukoht: kontekst.viimaneAsukohaNimi,
            maakond: kontekst.viimaneMaakonnaNimi,
            kysimusi: kontekst.kysimusi,
          }
        : null,
      kestusMs: Date.now() - algus,
    });
    res.end();
  } catch (err) {
    saada("viga", {
      sonum: err instanceof Error ? err.message : "Tundmatu viga",
    });
    res.end();
  }
});

const port = envNum("PORT", 3000);
app.listen(port, async () => {
  console.log(`Metsabot: http://localhost:${port}`);
  const llm = await tervisekontroll();
  if (llm.saadaval) {
    console.log(`LLM: ${llm.mudel} (varuvariant tundmatute küsimuste jaoks)`);
  } else {
    console.log(`LLM: pole kasutusel — ${llm.pohjus}`);
    console.log("Šabloonvastused ja regex-ruuter töötavad tavapäraselt.");
  }
});
