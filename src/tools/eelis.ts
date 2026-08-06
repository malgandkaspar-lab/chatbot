import {
  wfsFeatures,
  cqlIntersectsPoint,
  cqlWithinDistance,
} from "./wfs.js";

/**
 * EELIS - Eesti Looduse Infosüsteem (Kliimaministeeriumi GeoServer).
 * https://gsavalik.envir.ee/geoserver/eelis/ows
 */
const WS = "eelis";

export const ALLIKAS_EELIS =
  "EELIS (Eesti Looduse Infosüsteem), Kliimaministeeriumi WFS-teenus";

type AlaRaw = {
  id: number;
  nimi: string | null;
  tyyp: string | null;
  kr_kood: string | null;
  valitseja?: string | null;
  rah_kood?: string | null;
  ala_id?: number | null;
};

/**
 * Päritavad kihid. `silt` on inimloetav kategooria nimi.
 *
 * NB! Objekti `tyyp` väli sisaldab lühendkoode (KMKA, KLKA, H, "7", "6"),
 * millele ei ole avalikku klassifikaatorikihti. Neid EI dekodeeri - `nimi`
 * väli sisaldab niikuinii tüüpi eesti keeles ("Haanja looduspark",
 * "Kisejärve maastikukaitseala"), seega kasutame nime.
 */
const KIHID = [
  { kiht: "kr_kaitseala", silt: "kaitseala" },
  { kiht: "kr_hoiuala", silt: "hoiuala" },
  { kiht: "kr_loodusala", silt: "Natura 2000 loodusala" },
  { kiht: "kr_linnuala", silt: "Natura 2000 linnuala" },
  { kiht: "kr_piirang", silt: "kaitsevöönd" },
  { kiht: "kr_kohalik_objekt", silt: "kohaliku omavalitsuse kaitstav objekt" },
  { kiht: "kr_reservaat", silt: "reservaat" },
] as const;

export type Kaitseobjekt = {
  nimi: string;
  kategooria: string;
  /** EELISe koodiregistri kood, nt KLO1000313 või RAH0000205. */
  krKood: string | null;
  /** Natura 2000 ala kood, nt EE0080603. */
  naturaKood: string | null;
  valitseja: string | null;
  /** Kas punkt on objekti SEES (true) või ainult lähedal (false). */
  katabPunkti: boolean;
  /** Kaugus meetrites, kui objekt ei kata punkti. */
  kaugusM: number | null;
};

export type KaitseStaatus = {
  /** Kas asukoht on vähemalt ühe kaitstava objekti sees. */
  onKaitseAll: boolean;
  /** Objektid, mis asukohta katavad. */
  katavad: Kaitseobjekt[];
  /** Objektid lähikonnas, mis asukohta ei kata. */
  lahedal: Kaitseobjekt[];
  otsinguRadiusM: number;
  allikas: string;
  hoiatus: string;
};

const HOIATUS =
  "Kaitsealade piirid on siin määratud punktipäringuga EELISe andmete vastu. " +
  "Kinnistu võib osaliselt kaitsealale jääda ka siis, kui viitepunkt jääb " +
  "sellest välja. Täpsed piirid ja konkreetsed piirangud kinnita " +
  "Keskkonnaametist või metsaportaalist (register.metsad.ee), kuhu sisse " +
  "logides näed oma kinnistu piiranguid kaardil.";

function teisenda(
  r: AlaRaw,
  kategooria: string,
  katabPunkti: boolean,
): Kaitseobjekt {
  return {
    nimi: r.nimi ?? `nimetu ${kategooria}`,
    kategooria,
    krKood: r.kr_kood ?? null,
    naturaKood: r.rah_kood ?? null,
    valitseja: r.valitseja ?? null,
    katabPunkti,
    kaugusM: null,
  };
}

/**
 * Kontrollib, kas antud punkt (L-EST97) jääb kaitstavale loodusobjektile,
 * ja mis on lähikonnas.
 *
 * Kasutab tõelist geomeetria lõikumist (INTERSECTS), MITTE bbox-kattuvust.
 * Bbox annaks valepositiivseid: nt Kädso kinnistu bbox lõikub 3 km raadiuses
 * kolme kaitsealaga, kuid punkt ise ei jää ühelegi neist.
 */
export async function kaitseStaatus(
  x: number,
  y: number,
  radiusM = 2000,
): Promise<KaitseStaatus> {
  const katavadCql = cqlIntersectsPoint(x, y);
  const lahedalCql = cqlWithinDistance(x, y, radiusM);

  const tulemused = await Promise.all(
    KIHID.map(async ({ kiht, silt }) => {
      const [katavad, lahedal] = await Promise.all([
        wfsFeatures<AlaRaw>(WS, kiht, { cql: katavadCql, count: 20 }).catch(
          () => [] as AlaRaw[],
        ),
        wfsFeatures<AlaRaw>(WS, kiht, { cql: lahedalCql, count: 20 }).catch(
          () => [] as AlaRaw[],
        ),
      ]);
      return { silt, katavad, lahedal };
    }),
  );

  const katavad: Kaitseobjekt[] = [];
  const lahedal: Kaitseobjekt[] = [];

  for (const t of tulemused) {
    const katavadKoodid = new Set(t.katavad.map((r) => r.kr_kood ?? r.nimi));
    for (const r of t.katavad) katavad.push(teisenda(r, t.silt, true));
    for (const r of t.lahedal) {
      // Ära korda neid, mis punkti juba katavad
      if (katavadKoodid.has(r.kr_kood ?? r.nimi)) continue;
      lahedal.push(teisenda(r, t.silt, false));
    }
  }

  return {
    onKaitseAll: katavad.length > 0,
    katavad,
    lahedal,
    otsinguRadiusM: radiusM,
    allikas: ALLIKAS_EELIS,
    hoiatus: HOIATUS,
  };
}
