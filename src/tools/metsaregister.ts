import { wfsFeatures, wfsCount, cqlString } from "./wfs.js";
import type { Bbox } from "../lib/geo.js";
import {
  laeKlassifikaatorid,
  raieliik,
  puuliik,
  omandivorm,
  kasvukoht,
  rinne,
  onRiigimets,
  RAIELIIGID,
} from "./klassifikaatorid.js";

const WS = "metsaregister";

export const ALLIKAS_MR =
  "Metsaregister (Kliimaministeeriumi GeoServer, metsaregistri WFS-teenus)";

/**
 * OLULINE PIIRANG, mis tuleb vastustes alati edastada:
 *
 * 1. Kiht `teatis` sisaldab AINULT lubava märke saanud (otsus='JAH')
 *    registreeritud metsateatisi. Keeldumisi seal ei ole - seega ei saa
 *    öelda, kui palju teatisi tagasi lükati.
 * 2. Registreeritud teatis tähendab RAIELUBA, mitte tehtud raiet. Osa lubasid
 *    jääb realiseerimata. Metsaregistris ei ole andmeid tegelike raietööde
 *    kohta.
 * 3. Teatis kehtib 2 aastat (kehtiv_kuni väli).
 */
export const TEATIS_HOIATUS =
  "Metsaregistris on registreeritud raieload, mitte tehtud raied. Osa lubasid " +
  "jääb kasutamata. Avalik kiht sisaldab ainult lubava otsuse saanud teatisi.";

// ---------------------------------------------------------------------------
// Metsateatised
// ---------------------------------------------------------------------------

type TeatisRaw = {
  sys_id: number;
  teatise_nr: string | null;
  kinnistu_nimetus: string | null;
  kinnistu_nr: number | null;
  metskond: string | null;
  katastri_nr: string | null;
  kvartali_nr: string | null;
  eraldise_nr: number | null;
  pindala: number | null;
  too_kood: string | null;
  raiutav_maht: number | null;
  otsus: string | null;
  otsus_kinnitatud_kp: string | null;
  kehtiv_kuni: string | null;
};

/**
 * Väljad, mida küsime. `otsuse_pohjendus` on TEADLIKULT välja jäetud:
 * see on vabatekst, mis sisaldab isikuandmeid ja kaitsealuste liikide
 * elupaikade infot. Seda ei tohi LLM-ini ega kasutajaliidesesse saata.
 */
const TEATIS_VALJAD = [
  "teatise_nr",
  "kinnistu_nimetus",
  "metskond",
  "katastri_nr",
  "kvartali_nr",
  "eraldise_nr",
  "pindala",
  "too_kood",
  "raiutav_maht",
  "otsus",
  "otsus_kinnitatud_kp",
  "kehtiv_kuni",
];

export type Teatis = {
  teatiseNr: string | null;
  katastritunnus: string | null;
  kinnistu: string | null;
  metskond: string | null;
  eraldiseNr: number | null;
  pindala: number | null;
  raieliigiKood: string | null;
  raieliik: string;
  raiutavMaht: number | null;
  otsus: string | null;
  otsuseKuupaev: string | null;
  kehtivKuni: string | null;
  onKehtiv: boolean;
};

function teisendaTeatis(r: TeatisRaw): Teatis {
  const kehtivKuni = r.kehtiv_kuni ?? null;
  return {
    teatiseNr: r.teatise_nr,
    katastritunnus: r.katastri_nr,
    kinnistu: r.kinnistu_nimetus,
    metskond: r.metskond,
    eraldiseNr: r.eraldise_nr,
    pindala: r.pindala,
    raieliigiKood: r.too_kood,
    raieliik: raieliik(r.too_kood),
    raiutavMaht: r.raiutav_maht,
    otsus: r.otsus,
    otsuseKuupaev: r.otsus_kinnitatud_kp,
    kehtivKuni,
    onKehtiv: kehtivKuni ? new Date(kehtivKuni) >= new Date() : false,
  };
}

export type TeatisteKokkuvote = {
  leitud: number;
  /** Kas tulemus on limiidiga kärbitud. */
  karbitud: boolean;
  teatised: Teatis[];
  kokkuPindala: number;
  kokkuMaht: number;
  /** Raieliikide kaupa. */
  liigid: {
    kood: string;
    nimi: string;
    arv: number;
    pindala: number;
    maht: number;
  }[];
  kehtivaidArv: number;
  hoiatus: string;
  allikas: string;
};

function kokkuvote(read: Teatis[], leitud: number, limiit: number): TeatisteKokkuvote {
  const liigid = new Map<
    string,
    { kood: string; nimi: string; arv: number; pindala: number; maht: number }
  >();
  let kokkuPindala = 0;
  let kokkuMaht = 0;
  let kehtivaidArv = 0;

  for (const t of read) {
    kokkuPindala += t.pindala ?? 0;
    kokkuMaht += t.raiutavMaht ?? 0;
    if (t.onKehtiv) kehtivaidArv++;
    const kood = t.raieliigiKood ?? "?";
    const kirje =
      liigid.get(kood) ??
      { kood, nimi: t.raieliik, arv: 0, pindala: 0, maht: 0 };
    kirje.arv++;
    kirje.pindala += t.pindala ?? 0;
    kirje.maht += t.raiutavMaht ?? 0;
    liigid.set(kood, kirje);
  }

  return {
    leitud,
    karbitud: leitud > read.length,
    teatised: read,
    kokkuPindala,
    kokkuMaht,
    liigid: [...liigid.values()].sort((a, b) => b.maht - a.maht),
    kehtivaidArv,
    hoiatus: TEATIS_HOIATUS,
    allikas: ALLIKAS_MR,
  };
}

/**
 * Koguarv on MITTEKRIITILINE - see ütleb ainult, kas tulemus on kärbitud.
 * Riiklik GeoServer vastab hits-päringutele kõikuva kiirusega (mõõdetud
 * kuni 60 s). Kui see ebaõnnestub või venib, kasutame tegelikult saadud
 * ridade arvu, mitte ei lase kogu vastust blokeerida.
 */
async function loeKoguarv(
  opts: { cql?: string; bbox?: Bbox },
  varuvariant: number,
): Promise<number> {
  try {
    return await wfsCount(WS, "teatis", { ...opts, ttlSeconds: TTL_KOGUARV });
  } catch {
    return varuvariant;
  }
}

const TTL_KOGUARV = 3600;

/** Metsateatised katastritunnuse järgi. */
export async function teatisedKatastril(
  katastritunnus: string,
  limiit = 100,
): Promise<TeatisteKokkuvote> {
  const cql = `katastri_nr=${cqlString(katastritunnus)}`;
  // Read kõigepealt - see on vastuse jaoks hädavajalik osa.
  const read = await wfsFeatures<TeatisRaw>(WS, "teatis", {
    cql,
    count: limiit,
    propertyName: TEATIS_VALJAD,
  });
  // Koguarvu küsime ainult siis, kui tulemus VÕIB olla kärbitud.
  const leitud =
    read.length < limiit ? read.length : await loeKoguarv({ cql }, read.length);
  return kokkuvote(read.map(teisendaTeatis), leitud, limiit);
}

/** Metsateatised ruumilise ala sees (nt aadressi ümbrus). */
export async function teatisedAlal(
  bbox: Bbox,
  limiit = 200,
): Promise<TeatisteKokkuvote> {
  const read = await wfsFeatures<TeatisRaw>(WS, "teatis", {
    bbox,
    count: limiit,
    propertyName: TEATIS_VALJAD,
  });
  const leitud =
    read.length < limiit ? read.length : await loeKoguarv({ bbox }, read.length);
  return kokkuvote(read.map(teisendaTeatis), leitud, limiit);
}

// ---------------------------------------------------------------------------
// Metsaeraldised (inventeerimisandmed)
// ---------------------------------------------------------------------------

type EraldisRaw = {
  id: number;
  invent_kp: string | null;
  katastri_nr: string | null;
  kvartali_nr: string | null;
  eraldise_nr: number | null;
  pindala: number | null;
  kuivendatud: boolean | null;
  kasvukoht_kood: string | null;
  peapuuliik_kood: string | null;
  omandivorm_kood: string | null;
  korgus: number | null;
  boniteedi_kood: string | null;
  arengukl_kood: string | null;
  keskm_vanus: number | null;
  keskm_raievanus: number | null;
  juurdekasv: number | null;
  tagavara_1_ha: number | null;
  tuleohu_kood: string | null;
};

type ElementRaw = {
  eraldis_id: number;
  rinne_kood: string | null;
  puuliik_kood: string | null;
  osakaal: number | null;
  vanus: number | null;
  korgus: number | null;
  enamus: boolean | null;
  sunniaasta: number | null;
  diameeter: number | null;
  tagavara: number | null;
};

export type PuuliigiRida = {
  puuliik: string;
  rinne: string;
  rinneKood: string | null;
  /**
   * Osakaal PROTSENTIDES OMA RINDE SEES (mitte kümnendikes ja mitte
   * eraldise kohta tervikuna). Ühe rinde osakaalud liidetakse 100-ni;
   * eri rinnete osakaale ei tohi omavahel võrrelda ega kokku liita.
   */
  osakaal: number | null;
  vanus: number | null;
  korgus: number | null;
  diameeter: number | null;
  tagavara: number | null;
  onEnamuspuuliik: boolean;
};

export type Eraldis = {
  id: number;
  katastritunnus: string | null;
  eraldiseNr: number | null;
  kvartaliNr: string | null;
  pindala: number | null;
  inventeeritud: string | null;
  peapuuliik: string;
  peapuuliigiKood: string | null;
  kasvukoht: string;
  omandivorm: string;
  onRiigimets: boolean;
  keskmineVanus: number | null;
  /**
   * Koosseisuga kaalutud esimese rinde keskmine raievanus, mille metsaregister
   * on eraldise kohta arvutanud (metsa majandamise eeskiri § 3 lg 1 ja 1^1).
   *
   * NB! See EI OLE lame tabeliväärtus puuliigi ja boniteedi järgi, vaid
   * puistu koosseisuga kaalutud arv. Seetõttu esineb registris nt kuusel
   * vahemikku 60-92 ja männil 71-120 aastat, kuigi tabelis on ümmargused
   * arvud. Kasuta ALATI seda välja, mitte käsitsi kirjutatud tabelit.
   */
  keskmineRaievanus: number | null;
  /**
   * Kas puistu vanus on jõudnud raievanuseni. null = ei saa öelda, sest
   * vanus või raievanus on registris määramata.
   *
   * HOIATUS: see on AINULT vanusetingimus (metsaseadus § 29 lg 4 p 1).
   * Lageraie võib olla lubatud ka noorema puistu puhul küpsusdiameetri
   * või väikese täiuse alusel (lg 4 p 2 ja 3), samuti võivad seda keelata
   * looduskaitselised piirangud. Ei ole raieluba ega juriidiline hinnang.
   */
  vanuseTingimusTaidetud: boolean | null;
  korgus: number | null;
  /** Tagavara esimeses rindes, m³/ha. */
  tagavaraHa: number | null;
  /** Kogu eraldise tagavara, m³ (arvutatud: tagavaraHa x pindala). */
  tagavaraKokku: number | null;
  juurdekasv: number | null;
  kuivendatud: boolean | null;
  boniteet: string | null;
  puuliigid: PuuliigiRida[];
};

const ERALDIS_VALJAD = [
  "id",
  "invent_kp",
  "katastri_nr",
  "kvartali_nr",
  "eraldise_nr",
  "pindala",
  "kuivendatud",
  "kasvukoht_kood",
  "peapuuliik_kood",
  "omandivorm_kood",
  "korgus",
  "boniteedi_kood",
  "arengukl_kood",
  "keskm_vanus",
  "keskm_raievanus",
  "juurdekasv",
  "tagavara_1_ha",
  "tuleohu_kood",
];

/**
 * Eraldised katastritunnuse järgi koos puuliikide koosseisuga.
 *
 * PIIRANG: metsaregistris on avalikult nähtavad ainult need eraldised, mille
 * omanik on inventeerimisandmed avalikustanud, või riigimets. Kui vastuseks
 * tuleb tühi loend, ei tähenda see, et metsa ei ole.
 */
export async function eraldisedKatastril(
  katastritunnus: string,
  limiit = 100,
): Promise<Eraldis[]> {
  await laeKlassifikaatorid();

  const read = await wfsFeatures<EraldisRaw>(WS, "eraldis", {
    cql: `katastri_nr=${cqlString(katastritunnus)}`,
    count: limiit,
    propertyName: ERALDIS_VALJAD,
    sortBy: "eraldise_nr",
  });
  if (read.length === 0) return [];

  // Puuliikide koosseis kõigile eraldistele ühe päringuga
  const idd = read.map((r) => r.id).filter((x) => Number.isFinite(x));
  const elemendid = await wfsFeatures<ElementRaw>(WS, "eraldis_element", {
    cql: `eraldis_id IN (${idd.join(",")})`,
    count: 500,
  });

  const grupeeritud = new Map<number, ElementRaw[]>();
  for (const e of elemendid) {
    const arr = grupeeritud.get(e.eraldis_id) ?? [];
    arr.push(e);
    grupeeritud.set(e.eraldis_id, arr);
  }

  // Rinnete jarjestus: esimene rinne, teine rinne, jarelkasv, uksikpuud, poosad.
  // NB! Sorteerimine AINULT osakaalu jargi oleks vale - see tostaks teise rinde
  // 100%-lise puuliigi esimese rinde enamuspuuliigi ette.
  const rinneJarjestus: Record<string, number> = {
    "1": 0, "2": 1, J: 2, Y: 3, A: 4, "-": 5,
  };

  return read.map((r) => {
    const el = (grupeeritud.get(r.id) ?? []).sort((a, b) => {
      const ra = rinneJarjestus[a.rinne_kood ?? "-"] ?? 9;
      const rb = rinneJarjestus[b.rinne_kood ?? "-"] ?? 9;
      if (ra !== rb) return ra - rb;
      // Enamuspuuliik oma rinde sees esimeseks
      if (a.enamus !== b.enamus) return a.enamus ? -1 : 1;
      return (b.osakaal ?? 0) - (a.osakaal ?? 0);
    });
    const tagavaraHa = r.tagavara_1_ha;
    return {
      id: r.id,
      katastritunnus: r.katastri_nr,
      eraldiseNr: r.eraldise_nr,
      kvartaliNr: r.kvartali_nr,
      pindala: r.pindala,
      inventeeritud: r.invent_kp,
      peapuuliik: puuliik(r.peapuuliik_kood),
      peapuuliigiKood: r.peapuuliik_kood,
      kasvukoht: kasvukoht(r.kasvukoht_kood),
      omandivorm: omandivorm(r.omandivorm_kood),
      onRiigimets: onRiigimets(r.omandivorm_kood),
      keskmineVanus: r.keskm_vanus,
      keskmineRaievanus: r.keskm_raievanus,
      vanuseTingimusTaidetud:
        r.keskm_vanus !== null && r.keskm_raievanus !== null
          ? r.keskm_vanus >= r.keskm_raievanus
          : null,
      korgus: r.korgus,
      tagavaraHa,
      tagavaraKokku:
        tagavaraHa !== null && r.pindala !== null
          ? Math.round(tagavaraHa * r.pindala)
          : null,
      juurdekasv: r.juurdekasv,
      kuivendatud: r.kuivendatud,
      boniteet: r.boniteedi_kood,
      puuliigid: el.map((e) => ({
        puuliik: puuliik(e.puuliik_kood),
        rinne: rinne(e.rinne_kood),
        rinneKood: e.rinne_kood,
        osakaal: e.osakaal,
        vanus: e.vanus,
        korgus: e.korgus,
        diameeter: e.diameeter,
        tagavara: e.tagavara,
        onEnamuspuuliik: e.enamus === true,
      })),
    };
  });
}

export type EraldisteKokkuvote = {
  katastritunnus: string;
  eraldisteArv: number;
  kokkuPindala: number;
  kokkuTagavara: number;
  /** Enamuspuuliikide jaotus pindala järgi. */
  puuliigid: { nimi: string; pindala: number; osakaalPct: number }[];
  vanuseVahemik: { min: number; max: number } | null;
  onRiigimets: boolean;
  eraldised: Eraldis[];
  allikas: string;
  hoiatus: string;
};

export function eraldisteKokkuvote(
  katastritunnus: string,
  eraldised: Eraldis[],
): EraldisteKokkuvote {
  let kokkuPindala = 0;
  let kokkuTagavara = 0;
  const liigid = new Map<string, number>();
  const vanused: number[] = [];
  let riigimetsa = 0;

  for (const e of eraldised) {
    kokkuPindala += e.pindala ?? 0;
    kokkuTagavara += e.tagavaraKokku ?? 0;
    if (e.pindala) {
      liigid.set(e.peapuuliik, (liigid.get(e.peapuuliik) ?? 0) + e.pindala);
    }
    if (e.keskmineVanus !== null) vanused.push(e.keskmineVanus);
    if (e.onRiigimets) riigimetsa++;
  }

  const puuliigid = [...liigid.entries()]
    .map(([nimi, pindala]) => ({
      nimi,
      pindala,
      osakaalPct: kokkuPindala > 0 ? (pindala / kokkuPindala) * 100 : 0,
    }))
    .sort((a, b) => b.pindala - a.pindala);

  return {
    katastritunnus,
    eraldisteArv: eraldised.length,
    kokkuPindala,
    kokkuTagavara,
    puuliigid,
    vanuseVahemik:
      vanused.length > 0
        ? { min: Math.min(...vanused), max: Math.max(...vanused) }
        : null,
    onRiigimets: riigimetsa > eraldised.length / 2,
    eraldised,
    allikas: ALLIKAS_MR,
    hoiatus:
      "Metsaregistris on avalikult nähtavad riigimetsa eraldised ja need " +
      "erametsa eraldised, mille omanik on inventeerimisandmed avalikustanud. " +
      "Tühi tulemus ei tähenda, et metsa ei ole.",
  };
}

// ---------------------------------------------------------------------------
// Metsakaitseekspertiisid (erakorralised raied, nt üraskikahjustus)
// ---------------------------------------------------------------------------

type MkeRaw = {
  akti_nr: string | null;
  katastri_nr: string | null;
  metskond: string | null;
  eraldise_nr: number | null;
  soovitatav_raie_pindala: number | null;
  too_kood: string | null;
  maht: number | null;
  kinnitamise_kp: string | null;
  kehtiv_kuni: string | null;
};

export type Mke = {
  aktiNr: string | null;
  katastritunnus: string | null;
  eraldiseNr: number | null;
  pindala: number | null;
  raieliik: string;
  maht: number | null;
  kinnitatud: string | null;
  kehtivKuni: string | null;
};

/**
 * Metsakaitseekspertiisid alal. MKE on raieluba, mis antakse puistu halva
 * tervisliku seisundi tõttu (üraskid, tormimurd, haigused).
 */
export async function mkeAlal(bbox: Bbox, limiit = 200): Promise<Mke[]> {
  const read = await wfsFeatures<MkeRaw>(WS, "mke", {
    bbox,
    count: limiit,
    propertyName: [
      "akti_nr",
      "katastri_nr",
      "metskond",
      "eraldise_nr",
      "soovitatav_raie_pindala",
      "too_kood",
      "maht",
      "kinnitamise_kp",
      "kehtiv_kuni",
    ],
  });
  return read.map((r) => ({
    aktiNr: r.akti_nr,
    katastritunnus: r.katastri_nr,
    eraldiseNr: r.eraldise_nr,
    pindala: r.soovitatav_raie_pindala,
    raieliik: raieliik(r.too_kood),
    maht: r.maht,
    kinnitatud: r.kinnitamise_kp,
    kehtivKuni: r.kehtiv_kuni,
  }));
}

/** Kõik teadaolevad raieliigid koos selgitusega - "reeglid" intenti jaoks. */
export function raieliikideLoetelu() {
  return Object.entries(RAIELIIGID).map(([kood, info]) => ({
    kood,
    ...info,
  }));
}
