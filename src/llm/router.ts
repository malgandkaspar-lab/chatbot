import { chat } from "./ollama.js";
import { ruuteriPrompt } from "./prompts.js";
import { INTENDID, type Paring, type IntentNimi } from "../router/intents.js";
import { leiaMaakonnaKood } from "../tools/statistika.js";

type LlmVastus = {
  intent?: string;
  params?: Record<string, unknown>;
  kindlus?: number;
};

/** Alammäär - alla selle ei usalda me LLM-i otsust. */
const KINDLUSE_LATI = 0.4;

function sone(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * LLM-ruuteri varuvariant. Kutsutakse AINULT siis, kui regex vastet ei leidnud.
 *
 * Valideerib mudeli väljundi rangelt: tundmatu intent, puuduv kohustuslik
 * parameeter või madal kindlus -> null (jääme "tundmatu" juurde). Mudel
 * eksis testimisel juba teisel küsimusel, seega usaldust on vähe.
 */
export async function llmRuuter(kysimus: string): Promise<Paring | null> {
  const vastus = await chat(
    [
      { role: "system", content: ruuteriPrompt() },
      { role: "user", content: kysimus },
    ],
    { json: true, temperature: 0, maxTokens: 200 },
  );

  let j: LlmVastus;
  try {
    j = JSON.parse(vastus) as LlmVastus;
  } catch {
    return null;
  }

  const intent = sone(j.intent) as IntentNimi | null;
  if (!intent || !INTENDID.includes(intent) || intent === "tundmatu") return null;
  if (typeof j.kindlus === "number" && j.kindlus < KINDLUSE_LATI) return null;

  const p = j.params ?? {};

  switch (intent) {
    case "raie_vs_juurdekasv":
    case "metsavaru_trend":
    case "metsasus":
    case "raie_liigiti":
      return { intent };

    case "raie_maakonnas": {
      const nimi = sone(p.maakond);
      const kood = nimi ? leiaMaakonnaKood(nimi) : null;
      // Ilma maakonnata ei ole see intent täidetav
      return kood ? { intent, maakond: kood } : null;
    }

    case "uuendamine":
    case "kahjustused": {
      const nimi = sone(p.maakond);
      const kood = nimi ? leiaMaakonnaKood(nimi) : null;
      return kood ? { intent, maakond: kood } : { intent };
    }

    case "teatised_asukohas":
    case "eraldise_info":
    case "kaitsealad_asukohas": {
      const asukoht = sone(p.asukoht);
      return asukoht ? { intent, asukoht } : null;
    }

    case "reeglid":
      // Kasutame ALATI kasutaja algset küsimust, mitte mudeli ümbersõnastust
      return { intent, kysimus };

    default:
      return null;
  }
}
