import { envBool, envNum, envStr } from "../lib/env.js";

/**
 * Ollama klient. LLM on siin LISAND, mitte sõltuvus - kui see puudub või
 * on aeglane, töötab bot edasi regex-ruuteri ja šabloonvastustega.
 *
 * Mõõdetud qwen3:8b CPU-l (Ryzen 7 7735HS, ilma GPU-toeta):
 *   genereerimine ~4,6 tok/s, lühike JSON-vastus ~20 s.
 * Seetõttu kutsutakse LLM-i ainult siis, kui regex vastet ei leidnud.
 */

export type Sonum = { role: "system" | "user" | "assistant"; content: string };

function seaded() {
  return {
    lubatud: envBool("LLM_ENABLED", true),
    url: envStr("OLLAMA_URL", "http://localhost:11434").replace(/\/+$/, ""),
    mudel: envStr("OLLAMA_MODEL", "qwen3:8b"),
    timeoutMs: envNum("LLM_TIMEOUT_S", 120) * 1000,
  };
}

export type Tervis = {
  saadaval: boolean;
  mudel: string;
  pohjus?: string;
};

/** Kontrollib, kas Ollama töötab ja soovitud mudel on olemas. */
export async function tervisekontroll(): Promise<Tervis> {
  const s = seaded();
  if (!s.lubatud) {
    return { saadaval: false, mudel: s.mudel, pohjus: "LLM_ENABLED=false" };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${s.url}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      return { saadaval: false, mudel: s.mudel, pohjus: `Ollama vastas ${res.status}` };
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const nimed = (data.models ?? []).map((m) => m.name);
    if (!nimed.includes(s.mudel)) {
      return {
        saadaval: false,
        mudel: s.mudel,
        pohjus:
          `mudelit "${s.mudel}" ei ole alla laaditud. Olemas: ` +
          `${nimed.join(", ") || "(ükski)"}. Käivita: ollama pull ${s.mudel}`,
      };
    }
    return { saadaval: true, mudel: s.mudel };
  } catch (err) {
    return {
      saadaval: false,
      mudel: s.mudel,
      pohjus: `Ollama ei vasta aadressil ${s.url} (${err instanceof Error ? err.message : "viga"})`,
    };
  }
}

/** Ühekordne vastus, ilma voogedastuseta. */
export async function chat(
  sonumid: Sonum[],
  valikud: { json?: boolean; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const s = seaded();
  if (!s.lubatud) throw new Error("LLM on välja lülitatud (LLM_ENABLED=false)");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), s.timeoutMs);
  try {
    const res = await fetch(`${s.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: s.mudel,
        messages: sonumid,
        stream: false,
        // qwen3 "thinking" lisaks 1000+ tokenit ehk CPU-l mitu minutit
        think: false,
        ...(valikud.json ? { format: "json" } : {}),
        options: {
          temperature: valikud.temperature ?? 0,
          num_ctx: 8192,
          num_predict: valikud.maxTokens ?? 512,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

/** Voogedastus - kutsub `onTykk` iga uue tekstitüki kohta. */
export async function chatStream(
  sonumid: Sonum[],
  onTykk: (tekst: string) => void,
  valikud: { temperature?: number; maxTokens?: number } = {},
): Promise<void> {
  const s = seaded();
  if (!s.lubatud) throw new Error("LLM on välja lülitatud (LLM_ENABLED=false)");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), s.timeoutMs);
  try {
    const res = await fetch(`${s.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: s.mudel,
        messages: sonumid,
        stream: true,
        think: false,
        options: {
          temperature: valikud.temperature ?? 0.2,
          num_ctx: 8192,
          num_predict: valikud.maxTokens ?? 512,
        },
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Ollama ${res.status}`);
    }

    const lugeja = res.body.getReader();
    const dekooder = new TextDecoder();
    let puhver = "";
    for (;;) {
      const { done, value } = await lugeja.read();
      if (done) break;
      puhver += dekooder.decode(value, { stream: true });
      const read = puhver.split("\n");
      puhver = read.pop() ?? "";
      for (const rida of read) {
        if (!rida.trim()) continue;
        try {
          const j = JSON.parse(rida) as { message?: { content?: string } };
          const tykk = j.message?.content;
          if (tykk) onTykk(tykk);
        } catch {
          // poolik rida - ignoreeri
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
