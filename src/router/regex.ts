import type { Paring } from "./intents.js";
import { leiaMaakonnaKood, MAAKONNAD } from "../tools/statistika.js";
import { KATASTRITUNNUS_RE } from "../tools/wfs.js";

/**
 * Deterministlik ruuter. Töötab 0 ms ja ei vaja LLM-i.
 *
 * Miks see on esmane: qwen3:8b vastab CPU-l ~20 s ja eksis testimisel juba
 * teisel küsimusel ("kas naabri kinnistul on raieluba" -> raie_maakonnas).
 * LLM jääb varuvariandiks, kui siin vastet ei ole.
 */

export type RuuteriTulemus = {
  paring: Paring;
  /** Kust vaste tuli - kasutajaliideses ja logides kasulik. */
  allikas: "regex" | "llm" | "puudub";
  /** Millise mustri järgi otsus tehti (silumiseks). */
  pohjus: string;
};

function norm(s: string): string {
  return s.toLocaleLowerCase("et").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Asukoha eraldamine
// ---------------------------------------------------------------------------

/**
 * Proovib küsimusest asukoha välja lugeda.
 *
 * Järjekord on tähtis: katastritunnus on üheselt mõistetav, seega esimene.
 * Seejärel otsime kohanime-vihjeid ("... külas", "... vallas", "aadressil ...").
 * Viimase abinõuna suurtähelised sõnajadad.
 */
export function eraldaAsukoht(kysimus: string): string | null {
  const kataster = KATASTRITUNNUS_RE.exec(kysimus)?.[0];
  if (kataster) return kataster;

  // "Pupli külas", "Kambja vallas", "Rõuge vald"
  const kohaTyybid =
    /([A-ZÕÄÖÜŠŽ][\w\-õäöüšž]*(?:\s+[A-ZÕÄÖÜŠŽ][\w\-õäöüšž]*)*)\s+(külas?|vallas?|linnas?|alevikus?|maakonnas?|vald|küla|alevik)\b/u;
  const m1 = kohaTyybid.exec(kysimus);
  if (m1) return `${m1[1]} ${m1[2]}`;

  // "aadressil X", "kinnistul X", "asukohas X"
  const eessona =
    /(?:aadressil|kinnistul|katastri(?:üksusel|tunnusel)?|asukohas|kohas)\s+([^?.,!]+)/iu;
  const m2 = eessona.exec(kysimus);
  if (m2) {
    const kandidaat = m2[1]!.trim();
    if (kandidaat.length >= 3) return kandidaat;
  }

  // Suurtaheline sonajada, mis ei ole lause algus ega maakonnanimi
  const suurtahed = [
    ...kysimus.matchAll(/(?<![.?!]\s)(?<!^)\b([A-ZÕÄÖÜŠŽ][\w\-õäöüšž]{2,}(?:\s+[A-ZÕÄÖÜŠŽ][\w\-õäöüšž]{2,})*)/gu),
  ]
    .map((m) => m[1]!)
    .filter((s) => !leiaMaakonnaKood(s));
  if (suurtahed.length > 0) return suurtahed[0]!;

  return null;
}

/** Kas küsimus üldse viitab konkreetsele kohale. */
function onAsukohaKysimus(t: string): boolean {
  return (
    KATASTRITUNNUS_RE.test(t) ||
    /\b(kinnistu|katastri|krunt|maatükk|minu mets|mu mets|meie mets|naabri|siin|selle koha|aadress)/u.test(t) ||
    /\b(külas?|vallas?|alevikus?)\b/u.test(t)
  );
}

// ---------------------------------------------------------------------------
// Mustrid
// ---------------------------------------------------------------------------

type Reegel = {
  nimi: string;
  /** Kõik mustrid peavad sobima. */
  kui: RegExp[];
  /** Ükski neist ei tohi sobida. */
  valjaArvatud?: RegExp[];
  ehita: (kysimus: string, t: string) => Paring | null;
};

const REEGLID: Reegel[] = [
  // --- Kaitsealad. Enne teatisi, sest "kas mu mets on kaitse all" on spetsiifilisem.
  {
    nimi: "kaitseala",
    kui: [/\b(kaitse all|kaitseala|kaitsealu|natura|loodusala|linnuala|hoiuala|sihtkaitse|piiranguvöönd|reservaat|rahvuspark|looduskaitse)/u],
    ehita: (k) => {
      const asukoht = eraldaAsukoht(k);
      return asukoht ? { intent: "kaitsealad_asukohas", asukoht } : null;
    },
  },

  // --- Raieload asukohas
  {
    nimi: "teatised_asukohas",
    kui: [/\b(raieluba|raielub|metsateatis|teatis|raiet? (?:plaan|kavanda)|lubatud raiu|raieõigus)/u],
    ehita: (k, t) => {
      if (!onAsukohaKysimus(t)) return null;
      const asukoht = eraldaAsukoht(k);
      return asukoht ? { intent: "teatised_asukohas", asukoht } : null;
    },
  },

  // --- Mis metsa kasvab
  {
    nimi: "eraldise_info",
    kui: [/\b(mis (?:metsa? )?kasvab|milline mets|kui vana|vanus|puuliigi?d?|koosseis|tagavara|palju puitu|raieküps|küps)/u],
    ehita: (k, t) => {
      if (!onAsukohaKysimus(t)) return null;
      const asukoht = eraldaAsukoht(k);
      return asukoht ? { intent: "eraldise_info", asukoht } : null;
    },
  },

  // --- Raie vs juurdekasv. Kõige tähtsam küsimus, seega lai muster.
  //     NB: mustrid on TÜVEPÕHISED, sest eesti keel on käändeline.
  //     "hukkunud" ei kattu sõnaga "hukkub", "säilikpuu" ei kattu "säilikpuid"-ga.
  {
    nimi: "raie_vs_juurdekasv",
    kui: [
      /(raiu|raie|langeta)/u,
      /(juurde ?kasv|kasvab|kasvu|peale kasva|taastu|jätkusuutlik|otsa saa|otsa lõp)/u,
    ],
    ehita: () => ({ intent: "raie_vs_juurdekasv" }),
  },
  {
    nimi: "raie_vs_juurdekasv_lyhi",
    kui: [
      /(kas (?:eesti )?mets(?:a)? saab otsa|raiume liiga palju|raiutakse liiga palju|üleraie|jätkusuutlik|säästlik)/u,
    ],
    ehita: () => ({ intent: "raie_vs_juurdekasv" }),
  },

  // --- Metsasus
  {
    nimi: "metsasus",
    kui: [/(metsasus|metsa all|metsaga kaetud|kui suur osa eestist|kui palju eestis metsa|protsent(?:i)? metsa)/u],
    ehita: () => ({ intent: "metsasus" }),
  },

  // --- Metsavaru trend
  {
    nimi: "metsavaru_trend",
    kui: [
      // "metsatagavara" ja "metsavaru" ei alga sonapiiriga tuve ees
      /(metsavaru|tagavara|üldvaru|puidu ?varu|metsa ?varu)/u,
      /(kahane|vähene|vähemaks|muutu|trend|kasva|suurene|ajas|aastate)/u,
    ],
    ehita: () => ({ intent: "metsavaru_trend" }),
  },

  // --- Raie liigiti
  {
    nimi: "raie_liigiti",
    kui: [/\b(lageraie|harvendusraie|turberaie|raieliik|raieliigi)/u],
    valjaArvatud: [
      /\b(tohib|lubatud|vanus|kui suur|lank|langi|millal|kevadel|pesitse|vahe on|mis on)/u,
    ],
    ehita: () => ({ intent: "raie_liigiti" }),
  },

  // --- Kahjustused
  {
    nimi: "kahjustused",
    kui: [
      /(ürask|kahjustu|kahjur|tormimurd|tuuleheide|hukku|haigus|uluki|põder|metssiga|torm)/u,
    ],
    valjaArvatud: [/(metsakaitseekspertiis|\bmke\b)/u],
    ehita: (k) => {
      const kood = leiaMaakond(k);
      return kood ? { intent: "kahjustused", maakond: kood } : { intent: "kahjustused" };
    },
  },

  // --- Uuendamine
  {
    nimi: "uuendamine",
    kui: [/\b(uuenda|uuenemi|uuendus|istuta|istutus|külv|raiesmik|taimed|metsakultuur)/u],
    valjaArvatud: [/\b(kohustus|tähtaeg|pean|nõue|mitu aastat|seadus)/u],
    ehita: (k) => {
      const kood = leiaMaakond(k);
      return kood ? { intent: "uuendamine", maakond: kood } : { intent: "uuendamine" };
    },
  },

  // --- Raie maakonnas
  {
    nimi: "raie_maakonnas",
    kui: [/\b(raiu|raie|raiemaht|raiutakse|raiuti)/u],
    ehita: (k) => {
      const kood = leiaMaakond(k);
      return kood ? { intent: "raie_maakonnas", maakond: kood } : null;
    },
  },

  // --- Reeglid (seadus, mõisted). Kõige laiem, seega viimane enne tundmatut.
  {
    nimi: "reeglid",
    kui: [
      /(tohib|tohi\b|lubatud|keelatud|kohustus|nõue|seadus|reegel|millal|mis vanuses|kui suur (?:tohib|võib)|langi|lank|pesitse|kevadel|säilikpu|seemnepu|riigilõiv|metsateatis|mis on|mis vahe|kaua kehtib|tähtaeg|alles jät|jätma)/u,
    ],
    ehita: (k) => ({ intent: "reeglid", kysimus: k }),
  },
];

function leiaMaakond(kysimus: string): string | null {
  // Otsi maakonnanime kõigist sõnadest ja sõnapaaridest (nt "Ida-Viru")
  const sonad = kysimus.split(/[\s,.!?]+/).filter(Boolean);
  for (const s of sonad) {
    if (s.length < 4) continue;
    const kood = leiaMaakonnaKood(s);
    if (kood) return kood;
  }
  // Otsi ka tervest tekstist täisnimesid ("Ida-Viru maakond")
  const t = norm(kysimus);
  for (const [kood, nimi] of Object.entries(MAAKONNAD)) {
    if (kood === "00") continue;
    const base = nimi.replace(/\s*maakond$/, "").toLocaleLowerCase("et");
    if (t.includes(base)) return kood;
  }
  return null;
}

/**
 * Marsruudib küsimuse. Tagastab `tundmatu`, kui ükski muster ei sobi -
 * sel juhul proovib pipeline LLM-i.
 */
export function marsruudi(kysimus: string): RuuteriTulemus {
  const t = norm(kysimus);
  if (!t) {
    return { paring: { intent: "tundmatu" }, allikas: "puudub", pohjus: "tühi sisend" };
  }

  for (const reegel of REEGLID) {
    if (!reegel.kui.every((r) => r.test(t))) continue;
    if (reegel.valjaArvatud?.some((r) => r.test(t))) continue;
    const paring = reegel.ehita(kysimus, t);
    if (paring) {
      return { paring, allikas: "regex", pohjus: reegel.nimi };
    }
  }

  return { paring: { intent: "tundmatu" }, allikas: "puudub", pohjus: "vastet ei leitud" };
}
