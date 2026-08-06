import { getJson, qs } from "../lib/http.js";
import { cached, TTL } from "../lib/cache.js";
import { isPlausibleLest, toLatLon, bboxAround, type Bbox } from "../lib/geo.js";
import { KATASTRITUNNUS_RE } from "./wfs.js";

/**
 * Maa- ja Ruumiameti in-aadressi teenus (aadressiotsing / geokodeerimine).
 * https://inaadress.maaamet.ee/
 *
 * Koordinaadid tulevad L-EST97-s väljadel viitepunkt_x (easting) ja
 * viitepunkt_y (northing). NB! Väljad viitepunkt_l / viitepunkt_b on
 * eksitavalt nimetatud - viitepunkt_l on PIKKUSKRAAD, viitepunkt_b on
 * LAIUSKRAAD. Seetõttu kasutame x/y ja oma teisendust.
 */
const GAZETTEER = "https://inaadress.maaamet.ee/inaadress/gazetteer";

type GazAddress = {
  taisaadress?: string;
  pikkaadress?: string;
  aadresstekst?: string;
  liik?: string;
  liikVal?: string;
  tunnus?: string;
  maakond?: string;
  omavalitsus?: string;
  asustusyksus?: string;
  viitepunkt_x?: string;
  viitepunkt_y?: string;
  boundingbox?: string;
};

export type Asukoht = {
  /** Inimloetav täisaadress. */
  aadress: string;
  maakond: string | null;
  omavalitsus: string | null;
  asustusyksus: string | null;
  /** Objekti liik in-aadressis, nt KATASTRIYKSUS, EHITISHOONE. */
  liik: string | null;
  /** Katastritunnus, kui objekt on katastriüksus või tunnus vastab mustrile. */
  katastritunnus: string | null;
  /** L-EST97 viitepunkt. */
  x: number;
  y: number;
  lat: number;
  lon: number;
  /** Objekti ümbritsev kast L-EST97-s, kui teenus selle andis. */
  bbox: Bbox | null;
};

/** Parsib "x,y x,y x,y ..." kuju L-EST97 bboxiks. */
function parseBoundingbox(s: string | undefined): Bbox | null {
  if (!s) return null;
  const nums: number[] = [];
  for (const pair of s.trim().split(/\s+/)) {
    const [a, b] = pair.split(",");
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) nums.push(x, y);
  }
  if (nums.length < 4) return null;
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function teisenda(a: GazAddress): Asukoht | null {
  const x = Number(a.viitepunkt_x);
  const y = Number(a.viitepunkt_y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !isPlausibleLest(x, y)) {
    return null;
  }
  const { lat, lon } = toLatLon(x, y);
  const tunnus = a.tunnus ?? "";
  return {
    aadress: a.taisaadress ?? a.pikkaadress ?? a.aadresstekst ?? "teadmata",
    maakond: a.maakond ?? null,
    omavalitsus: a.omavalitsus ?? null,
    asustusyksus: a.asustusyksus ?? null,
    liik: a.liikVal ?? null,
    katastritunnus: KATASTRITUNNUS_RE.test(tunnus) ? tunnus : null,
    x,
    y,
    lat,
    lon,
    bbox: parseBoundingbox(a.boundingbox),
  };
}

/**
 * Otsib aadressi või katastritunnust. Tagastab kuni `results` vastet
 * asjakohasuse järjekorras.
 */
export async function otsiAsukoht(
  paring: string,
  results = 5,
): Promise<Asukoht[]> {
  const tekst = paring.trim();
  if (!tekst) return [];

  // Katastritunnuse puhul piirame otsingu katastriüksustele - täpsem tulemus.
  const katastri = KATASTRITUNNUS_RE.exec(tekst)?.[0];
  const params: Record<string, string | number> = {
    address: katastri ?? tekst,
    results,
    ihist: 0,
  };
  if (katastri) params.features = "KATASTRIYKSUS";

  const url = `${GAZETTEER}?${qs(params)}`;
  const data = await cached(`gaz:${url}`, TTL.GEOCODE, () =>
    getJson<{ addresses?: GazAddress[] }>(url, { timeoutMs: 20_000 }),
  );

  const out: Asukoht[] = [];
  for (const a of data.addresses ?? []) {
    const k = teisenda(a);
    if (k) out.push(k);
  }
  return out;
}

/** Esimene vaste või null. */
export async function leiaAsukoht(paring: string): Promise<Asukoht | null> {
  const vasted = await otsiAsukoht(paring, 5);
  return vasted[0] ?? null;
}

/**
 * Asukoha päringu ala L-EST97-s.
 *
 * `radiusM` antud   -> ala on VÄHEMALT selle raadiusega kast viitepunkti ümber,
 *                      ühendatud objekti enda piiridega (nii ei jää suur
 *                      kinnistu väiksema raadiuse sisse ära lõigatud).
 * `radiusM` puudub  -> objekti enda piirid väikese puhvriga; kui piire ei ole,
 *                      siis 500 m kast viitepunkti ümber.
 *
 * NB! Varem ignoreeris see funktsioon raadiust, kui objektil oli oma bbox.
 * See andis vaikselt vale (liiga väikese) ala - nt "MKE 10 km raadiuses"
 * päris tegelikult ainult kinnistu piiridest ja tagastas 0 vastet.
 */
export function paringuAla(asukoht: Asukoht, radiusM?: number): Bbox {
  const puhver = 50;
  const oma: Bbox | null = asukoht.bbox
    ? {
        minX: asukoht.bbox.minX - puhver,
        minY: asukoht.bbox.minY - puhver,
        maxX: asukoht.bbox.maxX + puhver,
        maxY: asukoht.bbox.maxY + puhver,
      }
    : null;

  if (radiusM === undefined) {
    return oma ?? bboxAround(asukoht.x, asukoht.y, 500);
  }

  const ring = bboxAround(asukoht.x, asukoht.y, radiusM);
  if (!oma) return ring;
  return {
    minX: Math.min(ring.minX, oma.minX),
    minY: Math.min(ring.minY, oma.minY),
    maxX: Math.max(ring.maxX, oma.maxX),
    maxY: Math.max(ring.maxY, oma.maxY),
  };
}
