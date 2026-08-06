/**
 * EPSG:3301 (Estonian Coordinate System of 1997, L-EST97) <-> EPSG:4326 (WGS84).
 *
 * L-EST97 on Lambert Conformal Conic 2SP GRS80 ellipsoidil. Rakendame Snyderi
 * valemid otse, et vaeltida proj4 soltuvust.
 *
 * Parameetrid (EPSG registrist):
 *   1. standardparalleel  59 20' N
 *   2. standardparalleel  58 00' N
 *   vale alguspunkti laius 57 31' 03.19415" N
 *   vale alguspunkti pikkus 24 00' E
 *   E0 = 500000, N0 = 6375000
 */

const A = 6378137.0; // GRS80 poolsuurtelg
const F_INV = 298.257222101; // GRS80 lamendus 1/f
const E = Math.sqrt(2 / F_INV - 1 / (F_INV * F_INV)); // ekstsentrilisus

const PHI1 = deg(59 + 20 / 60);
const PHI2 = deg(58);
const PHI0 = deg(57 + 31 / 60 + 3.19415 / 3600);
const LON0 = deg(24);
const E0 = 500_000;
const N0 = 6_375_000;

function deg(d: number): number {
  return (d * Math.PI) / 180;
}

function m(phi: number): number {
  const s = Math.sin(phi);
  return Math.cos(phi) / Math.sqrt(1 - E * E * s * s);
}

function t(phi: number): number {
  const s = Math.sin(phi);
  return (
    Math.tan(Math.PI / 4 - phi / 2) /
    Math.pow((1 - E * s) / (1 + E * s), E / 2)
  );
}

// Konstandid arvutame uks kord mooduli laadimisel.
const M1 = m(PHI1);
const M2 = m(PHI2);
const T1 = t(PHI1);
const T2 = t(PHI2);
const N = Math.log(M1 / M2) / Math.log(T1 / T2);
const BIG_F = M1 / (N * Math.pow(T1, N));
const R0 = A * BIG_F * Math.pow(t(PHI0), N);

export type LatLon = { lat: number; lon: number };
export type Lest = { x: number; y: number };

/** WGS84 -> L-EST97. x = easting, y = northing. */
export function toLest(lat: number, lon: number): Lest {
  const phi = deg(lat);
  const lambda = deg(lon);
  const r = A * BIG_F * Math.pow(t(phi), N);
  const theta = N * (lambda - LON0);
  return {
    x: E0 + r * Math.sin(theta),
    y: N0 + R0 - r * Math.cos(theta),
  };
}

/** L-EST97 -> WGS84. */
export function toLatLon(x: number, y: number): LatLon {
  const dx = x - E0;
  const dy = R0 - (y - N0);
  const sign = N >= 0 ? 1 : -1;
  const r = sign * Math.hypot(dx, dy);
  const tPrime = Math.pow(r / (A * BIG_F), 1 / N);
  const theta = Math.atan2(sign * dx, sign * dy);

  // Iteratiivne phi (Snyder 3-5). Koondub Eesti laiuskraadidel ~4 sammuga.
  let phi = Math.PI / 2 - 2 * Math.atan(tPrime);
  for (let i = 0; i < 12; i++) {
    const s = Math.sin(phi);
    const next =
      Math.PI / 2 -
      2 * Math.atan(tPrime * Math.pow((1 - E * s) / (1 + E * s), E / 2));
    if (Math.abs(next - phi) < 1e-12) {
      phi = next;
      break;
    }
    phi = next;
  }

  return {
    lat: (phi * 180) / Math.PI,
    lon: ((theta / N + LON0) * 180) / Math.PI,
  };
}

export type Bbox = { minX: number; minY: number; maxX: number; maxY: number };

/** Ruutkast punkti umber, radius meetrites (L-EST97 on meetrites). */
export function bboxAround(x: number, y: number, radiusM: number): Bbox {
  return {
    minX: x - radiusM,
    minY: y - radiusM,
    maxX: x + radiusM,
    maxY: y + radiusM,
  };
}

/**
 * WFS 2.0 BBOX parameetri sone: minx,miny,maxx,maxy,srs
 *
 * HOIATUS - teljejarjestus. EPSG:3301 autoriteedi-definitsioonis on teljed
 * jarjekorras (northing, easting). Kui kasutada URN-vormi
 * "urn:ogc:def:crs:EPSG::3301", tolgendab GeoServer BBOX-i kui
 * minY,minX,maxY,maxX ja paring tabab vale koha - tagastades VAIKSELT
 * 0 vastet, mitte viga.
 *
 * Luhivorm "EPSG:3301" sunnib jarjestuse (easting, northing) ehk x,y.
 * Ara seda muuda ilma wfsCount testiga kontrollimata.
 */
export const SRS_LEST = "EPSG:3301";

export function bboxParam(b: Bbox, srs = SRS_LEST): string {
  return `${b.minX},${b.minY},${b.maxX},${b.maxY},${srs}`;
}

/** Eesti L-EST97 levialasse jaamise kontroll - puuduliku sisendi puuk. */
export function isPlausibleLest(x: number, y: number): boolean {
  return x > 300_000 && x < 800_000 && y > 6_300_000 && y < 6_700_000;
}
