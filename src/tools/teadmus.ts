import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Käsitsi kirjutatud faktibaasi (data/teadmus.md) otsing.
 *
 * Fail on jagatud "## PEALKIRI" lõikudeks. Otsing on lihtne kaalutud
 * võtmesõnade kattuvus - piisav 20 lõigu jaoks, ei vaja vektorandmebaasi.
 */

export type Loik = {
  pealkiri: string;
  sisu: string;
  /**
   * Märksõnad failist real `<!-- märksõnad: a, b, c -->`.
   *
   * Vajalikud, sest eesti keeles ei kattu küsimuse sõnavorm tekstiga:
   * "kas kevadel tohib raiuda" ei sisalda ühtegi sõna, mis oleks
   * PESITSUSRAHU lõigus olemas ("15. aprill", "pesitsemine").
   * Sünonüümid hoitakse andmefailis teadmuse kõrval, mitte koodis.
   */
  marksonad: string[];
};

let loigud: Loik[] | null = null;

function laeFail(): Loik[] {
  const path = resolve(process.cwd(), "data/teadmus.md");
  if (!existsSync(path)) return [];

  const raw = readFileSync(path, "utf8");
  const tulemus: Loik[] = [];

  // Jaga "## " pealkirjade jargi. Esimene osa (fail-tasandi juhised) jaetakse valja.
  const osad = raw.split(/^## /m).slice(1);
  for (const osa of osad) {
    const reavahetus = osa.indexOf("\n");
    if (reavahetus === -1) continue;
    const pealkiri = osa.slice(0, reavahetus).trim();
    let sisu = osa.slice(reavahetus + 1).trim();
    // Halduslikud lõigud ei ole vastuse materjal
    if (pealkiri.startsWith("KUS BOT")) continue;

    const mk = /^<!--\s*märksõnad:\s*(.+?)\s*-->\s*$/m.exec(sisu);
    const marksonad = mk
      ? mk[1]!.split(",").map((s) => s.trim().toLocaleLowerCase("et")).filter(Boolean)
      : [];
    // Märksõnade rida ei kuulu kasutajale näidatavasse sisusse
    if (mk) sisu = sisu.replace(mk[0], "").trim();

    tulemus.push({ pealkiri, sisu, marksonad });
  }
  return tulemus;
}

export function koikLoigud(): Loik[] {
  loigud ??= laeFail();
  return loigud;
}

/** Eesti keele sagedased sõnad, mis otsingut ei aita. */
const STOPP = new Set([
  "on", "ja", "või", "kui", "see", "ei", "mis", "kas", "ka", "et", "aga",
  "siis", "oma", "kuid", "ning", "ta", "ma", "sa", "me", "nad", "kes",
  "kus", "millal", "kuidas", "palju", "mitu", "peab", "tohib", "saab",
  "olema", "teha", "mul", "minu", "sinu", "tema", "nende", "selle",
]);

/**
 * Valdkonnamüra: sõnad, mis esinevad pea igas metsandusküsimuses ja pea igas
 * lõigus, seega ei eralda neid teineteisest.
 *
 * Miks vaja: "Kas kevadel tohib METSA raiuda?" andis lõigule
 * "METSA UUENDAMISE KOHUSTUS" täispealkirja tabamuse (+6) ja tõstis selle
 * PESITSUSRAHU ette, mis on ainuõige vastus. Nende sõnade kaalu vähendame,
 * kuid ei eemalda päris - kui midagi muud ei sobi, on nõrk signaal parem
 * kui mitte midagi.
 */
const MYRA = new Set(["mets", "metsa", "metsas", "metsad", "puu", "puud", "puid"]);
const MYRA_KAAL = 0.15;

function kaal(sona: string): number {
  return MYRA.has(sona) ? MYRA_KAAL : 1;
}

function tokenid(tekst: string): string[] {
  return tekst
    .toLocaleLowerCase("et")
    .split(/[^a-zõäöüšž0-9]+/u)
    .filter((t) => t.length >= 3 && !STOPP.has(t));
}

/**
 * Otsib küsimusele kõige sobivamad lõigud.
 *
 * Kaalud: pealkirjas leidumine kaalub 3x rohkem kui sisus. Tüve-kattuvus
 * (nt "raievanus" vs "raievanused") loetakse osaliseks tabamuseks, sest
 * eesti keel on käändeline ja täpne sõnavorm ei kattu peaaegu kunagi.
 */
export function otsiTeadmus(kysimus: string, mitu = 3): Loik[] {
  return skoorid(kysimus)
    .filter((s) => s.skoor >= LATI)
    .slice(0, mitu)
    .map((s) => s.loik);
}

/** Alammäär, millest väiksema skooriga lõiku ei loeta vasteks. */
const LATI = 3;

/** Skoorid kahanevas järjekorras. Avalik, et otsingut saaks siluda. */
export function skoorid(kysimus: string): { loik: Loik; skoor: number }[] {
  const otsingud = tokenid(kysimus);
  if (otsingud.length === 0) return [];

  const tulemus = koikLoigud().map((loik) => {
    const pealkiriTokens = tokenid(loik.pealkiri);
    // Märksõnad võivad olla mitmesõnalised ("kui suur", "millal ei tohi")
    const mkTokens = loik.marksonad.flatMap((m) => tokenid(m));
    const mkFraasid = loik.marksonad.filter((m) => m.includes(" "));
    const sisuTokens = tokenid(loik.sisu);
    let skoor = 0;

    // Mitmesõnaline märksõnafraas tervikuna küsimuses = tugev signaal
    const kysimusNorm = kysimus.toLocaleLowerCase("et");
    for (const f of mkFraasid) {
      if (kysimusNorm.includes(f)) skoor += 5;
    }

    for (const q of otsingud) {
      const w = kaal(q);
      if (pealkiriTokens.includes(q)) skoor += 6 * w;
      else if (mkTokens.includes(q)) skoor += 5 * w;
      else if (pealkiriTokens.some((t) => tyveKattuvus(t, q))) skoor += 3 * w;
      else if (mkTokens.some((t) => tyveKattuvus(t, q))) skoor += 2.5 * w;
      else {
        const sisuTaied = sisuTokens.filter((t) => t === q).length;
        if (sisuTaied > 0) skoor += Math.min(sisuTaied, 4) * w;
        else if (sisuTokens.some((t) => tyveKattuvus(t, q))) skoor += 0.5 * w;
      }
    }
    return { loik, skoor };
  });

  return tulemus.sort((a, b) => b.skoor - a.skoor);
}

/** Kas kaks sõna jagavad piisavalt pikka algust (lihtne tüvestamine). */
function tyveKattuvus(a: string, b: string): boolean {
  const min = Math.min(a.length, b.length);
  if (min < 5) return false;
  const pikkus = Math.max(5, Math.floor(min * 0.75));
  return a.slice(0, pikkus) === b.slice(0, pikkus);
}
