import { request } from "../lib/http.js";
import { cached, TTL } from "../lib/cache.js";

/**
 * Ilmateenistuse (Keskkonnaagentuur) avalik ilmainfo.
 *
 * Kasutame ilma-autentimiseta XML-vooge:
 *   - https://www.ilmateenistus.ee/ilma_andmed/xml/forecast.php?lang=et
 *       üleriigiline prognoos ~4-ks päevaks (öö/päev, min/max temp, tekst)
 *       + linnade kaupa (Harku, Jõhvi, Tartu, Pärnu, Kuressaare, Türi)
 *   - https://www.ilmateenistus.ee/ilma_andmed/xml/observations.php
 *       jaamade vaatlused (hetketemperatuur, tuul, sademed, niiskus)
 *
 * NB! "phenomenon" väärtused on inglisekeelsed isegi lang=et korral, seega
 * tõlgime need ise eesti keelde (vt PHENOMENONI_SONASTIK).
 */

const FORECAST_URL =
  "https://www.ilmateenistus.ee/ilma_andmed/xml/forecast.php?lang=et";
const OBSERVATIONS_URL =
  "https://www.ilmateenistus.ee/ilma_andmed/xml/observations.php";

/** Allikaviide vastusesse. */
export const ALLIKAS_ILM = "Keskkonnaagentuuri ilmateenistus (ilmateenistus.ee)";

export type IlmaPäevaosa = {
  nahtus: string;
  nimi: string;
  tempmin: number | null;
  tempmax: number | null;
  tekst: string;
};

export type PrognoosiPäev = {
  kuupaev: string;
  päev: IlmaPäevaosa | null;
  öö: IlmaPäevaosa | null;
};

export type IlmPrognoos = {
  onSademed: boolean;
  kuupaevad: PrognoosiPäev[];
  linnad: Record<string, { nimi: string; tempmin: number | null; onSademed: boolean }>;
};

export type IlmVaatlus = {
  jaam: string;
  temperatuur: number | null;
  tuul: number | null;
  tuulepuhang: number | null;
  nahtus: string;
  nimi: string;
  niiskus: number | null;
};

/** Ilmateenistuse inglisekeelsed "phenomenon" väärtused -> eesti. */
const PHENOMENONI_SONASTIK: Record<string, string> = {
  Clear: "selge",
  "Variable clouds": "vahelduv pilvisus",
  Cloudy: "pilves",
  Overcast: "pilves",
  "Cloudy with clear spells": "pilves selgimistega",
  "Partly cloudy": "osaliselt pilves",
  "Fair": "vahelduv pilvisus",
  Fog: "udu",
  Mist: "uduvine",
  "Light rain": "kerge vihm",
  "Moderate rain": "mõõdukas vihm",
  "Heavy rain": "tugev vihm",
  "Light shower": "hoovihm",
  "Moderate shower": "hoovihm",
  "Heavy shower": "tugev hoovihm",
  Thunderstorm: "äikesevihm",
  "Moderate thunderstorm": "äikesevihm",
  "Heavy thunderstorm": "tugev äikesevihm",
  "Freezing rain": "jäävihm",
  Sleet: "lörts",
  "Light snow": "kerge lumesadu",
  "Moderate snow": "lumesadu",
  "Heavy snow": "tugev lumesadu",
  Blizzard: "tuisklumi",
  "Snow shower": "hooglumi",
  Hail: "rahe",
  Drizzle: "uduvihm",
  Shower: "hoovihm",
  Rain: "vihm",
  Snow: "lumesadu",
};

/** Sademeid tähistavad inglisekeelsed nähtused. */
const SADEME_MUSTER = /rain|shower|snow|sleet|hail|drizzle|thunder/i;

function tõlgiNähtus(en: string): string {
  return PHENOMENONI_SONASTIK[en] ?? en;
}

function onSademed(nahtus: string): boolean {
  return SADEME_MUSTER.test(nahtus);
}

// ---------------------------------------------------------------------------
// Väike piiratud skeemi XML-parser (ei pea iga XML-i hakkama)
// ---------------------------------------------------------------------------

/** Tagastab kõik "<id ...>...</id>" plokid. */
function plokid(id: string, xml: string): string[] {
  const tulem: string[] = [];
  const re = new RegExp(`<${id}\\b[^>]*>([\\s\\S]*?)</${id}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) tulem.push(m[1]!);
  return tulem;
}

/** Võtab ploki siseselt ühe muutuja väärtuse. */
function väärtus(tag: string, blokk: string): string | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "");
  const m = re.exec(blokk);
  return m ? m[1]!.trim() : null;
}

function arv(tag: string, blokk: string): number | null {
  const s = väärtus(tag, blokk);
  if (s === null || s === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Prognoos
// ---------------------------------------------------------------------------

function päevaosa(blokk: string | undefined): IlmaPäevaosa | null {
  if (!blokk) return null;
  const en = väärtus("phenomenon", blokk) ?? "";
  return {
    nahtus: en,
    nimi: tõlgiNähtus(en),
    tempmin: arv("tempmin", blokk),
    tempmax: arv("tempmax", blokk),
    tekst: väärtus("text", blokk) ?? "",
  };
}

/** Laeb üleriigilise prognoosi (+ linnade alandmed). */
export async function ilmaPrognoos(): Promise<IlmPrognoos> {
  const xml = await cached("ilm:forecast", TTL.WFS, () =>
    request(FORECAST_URL, { timeoutMs: 20_000 }),
  );

  const kuupaevad: PrognoosiPäev[] = [];
  const forecastRe = /<forecast\b([^>]*)>([\s\S]*?)<\/forecast>/g;
  let fm: RegExpExecArray | null;
  while ((fm = forecastRe.exec(xml)) !== null) {
    const attrs = fm[1] ?? "";
    const kuupaev = /date="([^"]+)"/.exec(attrs)?.[1] ?? "";
    kuupaevad.push({
      kuupaev,
      päev: päevaosa(plokid("day", fm[2] ?? "")[0]),
      öö: päevaosa(plokid("night", fm[2] ?? "")[0]),
    });
  }

  // Linnaprognoos kogu failist: <place><name>..</name><phenomenon>..</phenomenon><tempmin>..</tempmin>
  const linnad: IlmPrognoos["linnad"] = {};
  const linnare = /<place>\s*<name>([^<]*)<\/name>\s*<phenomenon>([^<]*)<\/phenomenon>\s*<tempmin>([^<]*)<\/tempmin>/g;
  let mm: RegExpExecArray | null;
  while ((mm = linnare.exec(xml)) !== null) {
    const linn = mm[1]!.trim();
    if (!linn) continue;
    const en = mm[2] ?? "";
    linnad[linn] = {
      nimi: tõlgiNähtus(en),
      tempmin: Number(mm[3]),
      onSademed: onSademed(en),
    };
  }

  const mõnelPäevalSademed = kuupaevad.some(
    (p) =>
      (p.päev && onSademed(p.päev.nahtus)) ||
      (p.öö && onSademed(p.öö.nahtus)),
  );

  return { kuupaevad, linnad, onSademed: mõnelPäevalSademed };
}

/** Laeb jaamade hetkevaatlused. */
export async function ilmaVaatlused(): Promise<IlmVaatlus[]> {
  const xml = await cached("ilm:observations", TTL.WFS, () =>
    request(OBSERVATIONS_URL, { timeoutMs: 20_000 }),
  );
  const vaatlused: IlmVaatlus[] = [];
  for (const s of plokid("station", xml)) {
    const en = väärtus("phenomenon", s) ?? "";
    vaatlused.push({
      jaam: väärtus("name", s) ?? "",
      temperatuur: arv("airtemperature", s),
      tuul: arv("windspeed", s),
      tuulepuhang: arv("windspeedmax", s),
      nahtus: en,
      nimi: tõlgiNähtus(en),
      niiskus: arv("relativehumidity", s),
    });
  }
  return vaatlused;
}

/**
 * Otsib kasutaja nimetatud linna/jaama kohta ilmaandmed.
 * Tagastab prognoosi ja võimaliku jaamavaatluse (nime sobivuse järgi).
 */
export async function ilmAsukohaJaoks(
  asukoht?: string | null,
): Promise<{ prognoos: IlmPrognoos; vaatlus: IlmVaatlus | null }> {
  const [prognoos, vaatlused] = await Promise.all([
    ilmaPrognoos(),
    ilmaVaatlused(),
  ]);

  let vaatlus: IlmVaatlus | null = null;
  if (asukoht && asukoht.trim()) {
    const a = asukoht.toLocaleLowerCase("et").replace(/\s*linn$/, "").trim();
    if (a && a.length >= 2) {
      vaatlus =
        vaatlused.find((v) =>
          v.jaam.toLocaleLowerCase("et").includes(a) ||
          a.includes(v.jaam.toLocaleLowerCase("et").replace(/\s*linn$/, "")),
        ) ?? null;
    }
  }
  return { prognoos, vaatlus };
}

export { onSademed };
