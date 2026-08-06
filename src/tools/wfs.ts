import { getJson, request, qs } from "../lib/http.js";
import { cached, TTL } from "../lib/cache.js";
import { geoserverLimiter } from "../lib/limiter.js";
import type { Bbox } from "../lib/geo.js";
import { bboxParam, SRS_LEST } from "../lib/geo.js";

/**
 * Kliimaministeeriumi haldusala GeoServer.
 * Dokumentatsioon: https://keskkonnaportaal.ee/et/avaandmed/geoserver
 */
const GEOSERVER = "https://gsavalik.envir.ee/geoserver";

/** Kaitseabinõu: ilma limiidita päring võib serverit koormata. */
const MAX_COUNT = 500;

export type GeoJsonFeature<P> = {
  type: "Feature";
  id?: string;
  geometry: unknown;
  properties: P;
};

export type FeatureCollection<P> = {
  type: "FeatureCollection";
  features: GeoJsonFeature<P>[];
  totalFeatures?: number | string;
  numberReturned?: number;
};

export type WfsOpts = {
  /** CQL_FILTER avaldis, nt "katastri_nr='12345:001:0001'". */
  cql?: string;
  /** Ruumiline piirang. Kasuta kui cql puudub. */
  bbox?: Bbox;
  /** Mitu objekti maksimaalselt. Piiratud MAX_COUNT-iga. */
  count?: number;
  startIndex?: number;
  /** Millised atribuudid tagastada. Väldi suurte tekstiväljade toomist. */
  propertyName?: string[];
  /** Kas geomeetria on vaja. Vaikimisi ei ole - säästab palju andmemahtu. */
  withGeometry?: boolean;
  ttlSeconds?: number;
  sortBy?: string;
};

/**
 * WFS 2.0 GetFeature JSON-ina.
 *
 * NB! Kohustuslik on kas `cql` või `bbox` - vastasel juhul viskame vea.
 * Kogu kihi pärimine (nt kõik ~2 miljonit metsaeraldist) koormaks riiklikku
 * teenust lubamatult.
 */
export async function wfsCollection<P>(
  workspace: string,
  layer: string,
  opts: WfsOpts = {},
): Promise<FeatureCollection<P>> {
  const {
    cql,
    bbox,
    count = 100,
    startIndex,
    propertyName,
    withGeometry = false,
    ttlSeconds = TTL.WFS,
    sortBy,
  } = opts;

  const onKlassifikaator = layer.startsWith("kl_");
  if (!cql && !bbox && !onKlassifikaator) {
    throw new Error(
      `WFS päring kihile "${layer}" ilma cql/bbox piiranguta on keelatud`,
    );
  }
  if (cql && bbox) {
    throw new Error("Kasuta kas cql VÕI bbox, mitte mõlemat korraga");
  }

  const props = propertyName ? [...propertyName] : undefined;
  // GeoServer nõuab geomeetriaveeru nimetamist, kui propertyName on antud
  if (props && withGeometry) props.push("shape");

  const url = `${GEOSERVER}/${workspace}/ows?${qs({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typenames: `${workspace}:${layer}`,
    outputFormat: "application/json",
    srsName: SRS_LEST,
    count: Math.min(count, MAX_COUNT),
    startIndex,
    CQL_FILTER: cql,
    BBOX: bbox ? bboxParam(bbox) : undefined,
    propertyName: props?.join(","),
    sortBy,
  })}`;

  // NB! Piiraja on kohustuslik - vaata src/lib/limiter.ts kommentaari.
  return cached(`wfs:${url}`, ttlSeconds, () =>
    geoserverLimiter.run(() =>
      getJson<FeatureCollection<P>>(url, { timeoutMs: 60_000 }),
    ),
  );
}

/** Mugavusfunktsioon: tagastab ainult atribuudid. */
export async function wfsFeatures<P>(
  workspace: string,
  layer: string,
  opts: WfsOpts = {},
): Promise<P[]> {
  const fc = await wfsCollection<P>(workspace, layer, opts);
  return fc.features.map((f) => f.properties);
}

/**
 * Loeb kokku, mitu objekti filtrile vastab, ilma andmeid alla laadimata.
 *
 * NB! resulttype=hits tagastab GeoServeris ALATI XML-i, ka siis kui
 * outputFormat=application/json on antud. Seetõttu loeme numberMatched
 * atribuudi otse XML-ist, mitte JSON-parseriga.
 */
export async function wfsCount(
  workspace: string,
  layer: string,
  opts: Pick<WfsOpts, "cql" | "bbox" | "ttlSeconds"> = {},
): Promise<number> {
  const { cql, bbox, ttlSeconds = TTL.WFS } = opts;
  if (!cql && !bbox) {
    throw new Error("wfsCount nõuab cql või bbox piirangut");
  }

  const url = `${GEOSERVER}/${workspace}/ows?${qs({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typenames: `${workspace}:${layer}`,
    resulttype: "hits",
    CQL_FILTER: cql,
    BBOX: bbox ? bboxParam(bbox) : undefined,
  })}`;

  const xml = await cached(`wfshits:${url}`, ttlSeconds, () =>
    geoserverLimiter.run(() => request(url, { timeoutMs: 45_000 })),
  );

  const m =
    /numberMatched="(\d+)"/.exec(xml) ?? /numberOfFeatures="(\d+)"/.exec(xml);
  if (!m) {
    // Kui serveri vastus muutub, ei taha me vale arvu näidata.
    throw new Error(
      `Ei leidnud numberMatched atribuuti WFS hits vastusest: ${xml.slice(0, 200)}`,
    );
  }
  return Number.parseInt(m[1]!, 10);
}

/** Escape'ib ülakomad CQL string-literaalis. */
export function cqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Ruumilised CQL predikaadid
// ---------------------------------------------------------------------------

/**
 * HOIATUS - TELJEJÄRJESTUS ON SIIN VASTUPIDINE kui BBOX parameetris.
 *
 *   BBOX parameeter + "EPSG:3301"  ->  minX,minY,maxX,maxY   (ida, põhi)
 *   CQL geomeetria-literaal        ->  POINT(y x)            (põhi, ida)
 *
 * GeoServer tõlgendab CQL-i geomeetriaid andmeallika CRS-i autoriteedi
 * teljejärjestuses, mis EPSG:3301 puhul on (northing, easting).
 *
 * Kontrollitud Haanja loodupargi vastu:
 *   INTERSECTS(shape, POINT(682843 6402860))  -> tühi     (vale)
 *   INTERSECTS(shape, POINT(6402860 682843))  -> Haanja   (õige)
 *
 * Vale järjestus ei anna viga, vaid VAIKSELT tühja tulemuse. Seetõttu on
 * see kapseldatud siia ja kaetud smoke-testiga (`cql_teljejarjestus`).
 * Ära kirjuta CQL-i geomeetriaid mujal käsitsi.
 */
export function cqlPoint(x: number, y: number): string {
  return `POINT(${y} ${x})`;
}

/** Kas objekt katab antud punkti (L-EST97). */
export function cqlIntersectsPoint(x: number, y: number): string {
  return `INTERSECTS(shape, ${cqlPoint(x, y)})`;
}

/** Kas objekt on punktist kuni `meetrit` kaugusel (L-EST97). */
export function cqlWithinDistance(
  x: number,
  y: number,
  meetrit: number,
): string {
  return `DWITHIN(shape, ${cqlPoint(x, y)}, ${meetrit}, meters)`;
}

/** Geomeetriaveeru nimi Kliimaministeeriumi GeoServeri kihtidel. */
export const GEOM_VEERG = "shape";

/** Kontrollib katastritunnuse kuju 12345:001:0001. */
export const KATASTRITUNNUS_RE = /\b\d{5}:\d{3}:\d{4}\b/;

export function onKatastritunnus(s: string): boolean {
  return KATASTRITUNNUS_RE.test(s);
}
