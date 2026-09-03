/**
 * Intentide definitsioonid.
 *
 * Sama loetelu teenindab kahte tarbijat:
 *  1. regex-ruuter (src/router/regex.ts) - kiire ja deterministlik
 *  2. LLM-ruuteri prompt (src/llm/prompts.ts) - genereeritakse SIIT, et
 *     kirjeldused ei läheks lahku
 */

export const INTENDID = [
  "raie_vs_juurdekasv",
  "metsavaru_trend",
  "metsasus",
  "raie_liigiti",
  "raie_kogus",
  "raie_maakonnas",
  "uuendamine",
  "kahjustused",
  "teatised_asukohas",
  "eraldise_info",
  "kaitsealad_asukohas",
  "ilm",
  "reeglid",
  "tundmatu",
] as const;

export type IntentNimi = (typeof INTENDID)[number];

export type Paring =
  | { intent: "raie_vs_juurdekasv" }
  | { intent: "metsavaru_trend" }
  | { intent: "metsasus" }
  | { intent: "raie_liigiti" }
  | { intent: "raie_kogus"; aasta?: string }
  | { intent: "raie_maakonnas"; maakond: string; aasta?: string }
  | { intent: "uuendamine"; maakond?: string }
  | { intent: "kahjustused"; maakond?: string }
  | { intent: "teatised_asukohas"; asukoht: string }
  | { intent: "eraldise_info"; asukoht: string }
  | { intent: "kaitsealad_asukohas"; asukoht: string }
  | { intent: "ilm"; asukoht?: string; homne?: boolean; ainultSademed?: boolean }
  | { intent: "reeglid"; kysimus: string }
  | { intent: "tundmatu" };

export type IntentKirjeldus = {
  nimi: IntentNimi;
  kirjeldus: string;
  parameetrid: { nimi: string; kirjeldus: string; kohustuslik: boolean }[];
  naited: string[];
};

/** LLM-ruuteri promptis ja /api/intents endpointis kasutatav loetelu. */
export const KIRJELDUSED: IntentKirjeldus[] = [
  {
    nimi: "raie_vs_juurdekasv",
    kirjeldus:
      "Võrdleb Eesti aastast raiemahtu metsa juurdekasvuga ja metsavaru muutusega.",
    parameetrid: [],
    naited: [
      "Kas metsa raiutakse rohkem kui juurde kasvab?",
      "Kas raiemaht ületab juurdekasvu?",
      "Kas Eesti mets saab otsa?",
    ],
  },
  {
    nimi: "metsavaru_trend",
    kirjeldus:
      "Metsavaru (puistute üldvaru, pindala, hektarivaru) muutumine ajas.",
    parameetrid: [],
    naited: [
      "Kas Eesti metsavaru kahaneb?",
      "Kuidas on metsatagavara muutunud?",
      "Kas metsa jääb vähemaks?",
    ],
  },
  {
    nimi: "metsasus",
    kirjeldus: "Kui suur osa Eesti pindalast on metsaga kaetud.",
    parameetrid: [],
    naited: [
      "Kui suur osa Eestist on metsa all?",
      "Mis on Eesti metsasus?",
      "Kui palju Eestis metsa on?",
    ],
  },
  {
    nimi: "raie_liigiti",
    kirjeldus:
      "Raiemahu jaotus raieliikide vahel: lageraie, harvendusraie, turberaie jne.",
    parameetrid: [],
    naited: [
      "Kui palju on lageraiet võrreldes harvendusraiega?",
      "Mis osa raiest on lageraie?",
    ],
  },
  {
    nimi: "raie_kogus",
    kirjeldus: "Kogu Eesti raiemaht ja -pindala, riigi- ja erametsa kaupa.",
    parameetrid: [],
    naited: [
      "Kui palju raiuti Eestis kokku metsa 2025. aastal?",
      "Kui palju puitu raiuti Eestis kokku?",
      "Palju on Eesti aastane raiemaht?",
    ],
  },
  {
    nimi: "raie_maakonnas",
    kirjeldus: "Raiemaht ja -pindala ühes maakonnas, riigi- ja erametsa kaupa.",
    parameetrid: [
      { nimi: "maakond", kirjeldus: "Maakonna nimi eesti keeles", kohustuslik: true },
    ],
    naited: [
      "Kui palju raiuti Võrumaal?",
      "Kui palju metsa raiutakse Ida-Virumaal?",
    ],
  },
  {
    nimi: "uuendamine",
    kirjeldus:
      "Metsa uuendamise mahud: istutamine, külv, loodusliku uuenemise kaasaaitamine.",
    parameetrid: [
      { nimi: "maakond", kirjeldus: "Maakonna nimi, kui küsitakse maakonna kohta", kohustuslik: false },
    ],
    naited: [
      "Kas raiesmikud uuendatakse?",
      "Kui palju metsa istutatakse?",
    ],
  },
  {
    nimi: "kahjustused",
    kirjeldus:
      "Metsakahjustused ja hukkunud puistud põhjuste kaupa: üraskid, tormimurd, haigused, ulukid.",
    parameetrid: [
      { nimi: "maakond", kirjeldus: "Maakonna nimi, kui küsitakse maakonna kohta", kohustuslik: false },
    ],
    naited: [
      "Kui hull on kooreüraskiolukord?",
      "Kui palju metsa hukkub tormide tõttu?",
    ],
  },
  {
    nimi: "teatised_asukohas",
    kirjeldus:
      "Registreeritud raieload (metsateatised) konkreetsel kinnistul või asukoha ümbruses.",
    parameetrid: [
      {
        nimi: "asukoht",
        kirjeldus: "Katastritunnus, aadress või kohanimi",
        kohustuslik: true,
      },
    ],
    naited: [
      "Kas kinnistul 46801:003:0053 on raieluba?",
      "Kas mu naabri metsas Pupli külas on raiet plaanitud?",
    ],
  },
  {
    nimi: "eraldise_info",
    kirjeldus:
      "Mis metsa konkreetsel kinnistul kasvab: puuliigid, vanus, tagavara, raieküpsus.",
    parameetrid: [
      {
        nimi: "asukoht",
        kirjeldus: "Katastritunnus, aadress või kohanimi",
        kohustuslik: true,
      },
    ],
    naited: [
      "Mis kasvab katastriüksusel 46801:003:0053?",
      "Kui vana on mets sellel kinnistul?",
    ],
  },
  {
    nimi: "kaitsealad_asukohas",
    kirjeldus:
      "Kas asukoht jääb kaitsealale, Natura 2000 alale või muule kaitstavale objektile.",
    parameetrid: [
      {
        nimi: "asukoht",
        kirjeldus: "Katastritunnus, aadress või kohanimi",
        kohustuslik: true,
      },
    ],
    naited: [
      "Kas see mets on kaitse all?",
      "Kas kinnistu 46801:003:0053 jääb Natura alale?",
    ],
  },
  {
    nimi: "reeglid",
    kirjeldus:
      "Seadusest tulenevad reeglid ja mõisted: raievanused, langi suurus, uuendamiskohustus, pesitsusrahu, metsateatise kord, raieliikide vahe.",
    parameetrid: [
      { nimi: "kysimus", kirjeldus: "Kasutaja algne küsimus", kohustuslik: true },
    ],
    naited: [
      "Mis vanuses tohib männikut lageraiuda?",
      "Kas kevadel tohib metsa raiuda?",
      "Mis vahe on turberaiel ja lageraiel?",
      "Kui kaua metsateatis kehtib?",
    ],
  },
  {
    nimi: "ilm",
    kirjeldus:
      "Ilma kohta käivad küsimused: praegune ilm, tänane/homne prognoos, sademed, temperatuur, tuleoht. Võib olla linnapõhine.",
    parameetrid: [
      { nimi: "asukoht", kirjeldus: "Linna või jaama nimi, kui küsitakse kindla koha ilma", kohustuslik: false },
    ],
    naited: [
      "Mis ilm praegu on?",
      "Mis ilm on homme?",
      "Kas täna sajab?",
      "Mis temperatuur Tartus praegu on?",
    ],
  },
];
