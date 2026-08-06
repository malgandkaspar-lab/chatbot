import type { Paring, IntentNimi } from "./intents.js";
import type { Kontekst } from "./kontekst.js";
import { leiaMaakonnaKood, MAAKONNAD } from "../tools/statistika.js";
import { maakondInessive } from "../lib/format.js";
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
  /**
   * Kui vastus tugineb varasemale kontekstile, on siin selgitus, mida
   * kasutajale näidata ("Kasutan eelmist asukohta: ..."). Nii ei jää
   * kasutajale mulje, et bot teadis midagi, mida ta ei öelnud.
   */
  kontekstiSelgitus?: string;
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
    /\b(külas?|vallas?|alevikus?)\b/u.test(t) ||
    onAsesonaViide(t)
  );
}

/**
 * Asesõnaline viide varem mainitud kohale: "kas SEE on kaitse all",
 * "mis SEAL kasvab", "SELLE kinnistu". Ilma kontekstita on need mõttetud,
 * kontekstiga aga kõige loomulikum jätkuküsimuse vorm.
 */
function onAsesonaViide(t: string): boolean {
  return /\b(see|seda|selle|sellel|seal|sinna|sealt|samal|sama|antud)\b/u.test(t);
}

/**
 * Jätkuküsimus, mis kordab eelmist küsimust uue maakonnaga:
 * "aga Võrumaal?", "ja Tartumaal?", "Saaremaal?"
 *
 * Tunnus: lühike lause, mille sisuks on sisuliselt ainult maakonnanimi,
 * millele võib eelneda sidesõna.
 */
function onMaakonnaJatkuk(kysimus: string, kood: string | null): boolean {
  if (!kood) return false;
  const puhas = kysimus
    .toLocaleLowerCase("et")
    .replace(/[?!.,]/g, " ")
    .replace(/\b(aga|ja|ning|kuidas|mis|siis|no|nt|näiteks|kas)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sonu = puhas.split(" ").filter(Boolean).length;
  // "võrumaal" = 1 sõna, "ida-viru maakonnas" = 2 sõna
  return sonu <= 2;
}

// ---------------------------------------------------------------------------
// Mustrid
// ---------------------------------------------------------------------------

type Ehitus = {
  paring: Paring;
  kontekstiSelgitus?: string;
};

type Reegel = {
  nimi: string;
  /** Kõik mustrid peavad sobima. */
  kui: RegExp[];
  /** Ükski neist ei tohi sobida. */
  valjaArvatud?: RegExp[];
  ehita: (kysimus: string, t: string, k: Kontekst | null) => Ehitus | Paring | null;
};

/**
 * Asukoha lahendamine koos konteksti varuvariandiga.
 *
 * Kui küsimuses on asukoht kirjas, kasutame seda. Kui küsimus viitab
 * asesõnaga ("kas see on kaitse all") ja meil on eelmine asukoht, siis
 * kasutame seda ja ÜTLEME SEDA KASUTAJALE - vastasel juhul jääks mulje,
 * et bot teadis midagi, mida kasutaja ei öelnud.
 */
function asukohtVoiKontekst(
  kysimus: string,
  intent: "teatised_asukohas" | "eraldise_info" | "kaitsealad_asukohas",
  k: Kontekst | null,
): Ehitus | null {
  const otsene = eraldaAsukoht(kysimus);
  if (otsene) return { paring: { intent, asukoht: otsene } };

  if (k?.viimaneAsukoht) {
    return {
      paring: { intent, asukoht: k.viimaneAsukoht },
      kontekstiSelgitus: `Kasutan eelmist asukohta: ${k.viimaneAsukohaNimi ?? k.viimaneAsukoht}`,
    };
  }
  return null;
}

const REEGLID: Reegel[] = [
  // --- JÄTKUKÜSIMUS: sama küsimus, uus maakond ("aga Võrumaal?")
  //     Peab olema esimene, sest muidu haaraks mõni sisureegel selle endale.
  {
    nimi: "jatku_maakond",
    kui: [/./u],
    ehita: (kysimus, _t, k) => {
      if (!k?.viimaneIntent) return null;
      const kood = leiaMaakond(kysimus);
      if (!onMaakonnaJatkuk(kysimus, kood) || !kood) return null;

      const nimi = MAAKONNAD[kood] ?? kood;
      const selgitus = `Jätkan eelmist küsimust, nüüd ${maakondInessive(nimi)}`;

      switch (k.viimaneIntent) {
        case "raie_maakonnas":
          return { paring: { intent: "raie_maakonnas", maakond: kood }, kontekstiSelgitus: selgitus };
        case "uuendamine":
          return { paring: { intent: "uuendamine", maakond: kood }, kontekstiSelgitus: selgitus };
        case "kahjustused":
          return { paring: { intent: "kahjustused", maakond: kood }, kontekstiSelgitus: selgitus };
        default:
          // Muude intentide puhul on maakonnavaates mõistlik vaste raiemaht
          return {
            paring: { intent: "raie_maakonnas", maakond: kood },
            kontekstiSelgitus: `Näitan raiemahtu ${maakondInessive(nimi)}`,
          };
      }
    },
  },

  // --- Kaitsealad. Enne teatisi, sest "kas mu mets on kaitse all" on spetsiifilisem.
  {
    nimi: "kaitseala",
    kui: [/\b(kaitse all|kaitseala|kaitsealu|natura|loodusala|linnuala|hoiuala|sihtkaitse|piiranguvöönd|reservaat|rahvuspark|looduskaitse)/u],
    ehita: (kysimus, _t, k) => asukohtVoiKontekst(kysimus, "kaitsealad_asukohas", k),
  },

  // --- Raieload asukohas
  {
    nimi: "teatised_asukohas",
    kui: [/\b(raieluba|raielub|metsateatis|teatis|raiet? (?:plaan|kavanda)|lubatud raiu|raieõigus)/u],
    ehita: (kysimus, t, k) => {
      if (!onAsukohaKysimus(t) && !k?.viimaneAsukoht) return null;
      return asukohtVoiKontekst(kysimus, "teatised_asukohas", k);
    },
  },

  // --- Mis metsa kasvab
  {
    nimi: "eraldise_info",
    kui: [/\b(mis\s+(?:\S+\s+){0,2}kasvab|milline mets|kui vana|vanus|puuliigi?d?|koosseis|tagavara|palju puitu|raieküps|küps)/u],
    ehita: (kysimus, t, k) => {
      if (!onAsukohaKysimus(t) && !k?.viimaneAsukoht) return null;
      return asukohtVoiKontekst(kysimus, "eraldise_info", k);
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
 *
 * `kontekst` on valikuline. Ilma selleta käitub ruuter täpselt nagu varem,
 * seega olemasolevad testid ja CLI töötavad muutmata kujul.
 */
export function marsruudi(
  kysimus: string,
  kontekst: Kontekst | null = null,
): RuuteriTulemus {
  const t = norm(kysimus);
  if (!t) {
    return { paring: { intent: "tundmatu" }, allikas: "puudub", pohjus: "tühi sisend" };
  }

  for (const reegel of REEGLID) {
    if (!reegel.kui.every((r) => r.test(t))) continue;
    if (reegel.valjaArvatud?.some((r) => r.test(t))) continue;
    const tulem = reegel.ehita(kysimus, t, kontekst);
    if (!tulem) continue;

    const on = "paring" in tulem;
    return {
      paring: on ? tulem.paring : (tulem as Paring),
      allikas: "regex",
      pohjus: reegel.nimi,
      ...(on && tulem.kontekstiSelgitus
        ? { kontekstiSelgitus: tulem.kontekstiSelgitus }
        : {}),
    };
  }

  return { paring: { intent: "tundmatu" }, allikas: "puudub", pohjus: "vastet ei leitud" };
}

export type { IntentNimi };
