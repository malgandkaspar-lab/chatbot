import { wfsFeatures } from "./wfs.js";

/**
 * Metsaregistri klassifikaatorid.
 *
 * PÕHIMÕTE: koode ei arvata. Kaks allikat:
 *  1. Raieliigid on kirjas õigusaktis, seega kirjutatud koodi ja viidatud.
 *  2. Ülejäänud (puuliik, omandivorm, kasvukoht, rinne) päritakse
 *     metsaregistri kl_* WFS-kihtidest, et loetelu oleks alati täielik.
 *
 * Kui klassifikaatorit ei õnnestu pärida või kood puudub, tagastame koodi
 * ENDA, mitte väljamõeldud tähenduse.
 */

// ---------------------------------------------------------------------------
// Raieliigid - ametlik allikas
// ---------------------------------------------------------------------------

/**
 * Keskkonnaministri 11.08.2017 määrus nr 28 lisa "Metsateatise vorm",
 * metsateatise täitmisel kasutatavad koodid.
 * https://www.riigiteataja.ee/aktilisa/1150/8201/7009/KKM_m28_lisa.pdf
 *
 * NB! TR = trassiraie (MITTE turberaie), VR = valikraie (MITTE valgustusraie).
 * Metsaseaduse järgi on uuendusraied lageraie, aegjärkne raie, häilraie ja
 * veerraie; turberaie on aegjärkse, häil- ja veerraie ühisnimetus.
 */
export type RaieliigiInfo = {
  nimi: string;
  ryhm: "uuendusraie" | "hooldusraie" | "muu";
  /** Kas metsaseadus kohustab pärast raiet metsa uuendama. */
  uuendamiskohustus: boolean;
  /** Kas metsateatise eest tuleb tasuda riigilõivu (seis 01.07.2024). */
  riigiloiv: boolean;
};

export const RAIELIIGID: Record<string, RaieliigiInfo> = {
  LR: { nimi: "lageraie", ryhm: "uuendusraie", uuendamiskohustus: true, riigiloiv: true },
  AR: { nimi: "aegjärkne raie", ryhm: "uuendusraie", uuendamiskohustus: true, riigiloiv: true },
  HL: { nimi: "häilraie", ryhm: "uuendusraie", uuendamiskohustus: true, riigiloiv: true },
  VE: { nimi: "veerraie", ryhm: "uuendusraie", uuendamiskohustus: true, riigiloiv: true },
  HR: { nimi: "harvendusraie", ryhm: "hooldusraie", uuendamiskohustus: false, riigiloiv: false },
  SR: { nimi: "sanitaarraie", ryhm: "hooldusraie", uuendamiskohustus: false, riigiloiv: false },
  VR: { nimi: "valikraie", ryhm: "hooldusraie", uuendamiskohustus: false, riigiloiv: false },
  TR: { nimi: "trassiraie", ryhm: "muu", uuendamiskohustus: false, riigiloiv: false },
  RD: { nimi: "raadamine", ryhm: "muu", uuendamiskohustus: true, riigiloiv: true },
  KR: { nimi: "kujundusraie", ryhm: "muu", uuendamiskohustus: false, riigiloiv: false },
};

/** Turberaie = aegjärkne + häilraie + veerraie. */
export const TURBERAIE_KOODID = ["AR", "HL", "VE"] as const;

export function raieliik(kood: string | null | undefined): string {
  if (!kood) return "teadmata raieliik";
  return RAIELIIGID[kood]?.nimi ?? `raieliik ${kood}`;
}

export function onUuendusraie(kood: string | null | undefined): boolean {
  return !!kood && RAIELIIGID[kood]?.ryhm === "uuendusraie";
}

// ---------------------------------------------------------------------------
// WFS-ist päritavad klassifikaatorid
// ---------------------------------------------------------------------------

type KlRida = { kood: string; kirjeldus: string };

/** Klassifikaatorikihid on väga stabiilsed - hoiame 30 päeva. */
const KL_TTL = 30 * 24 * 3600;

async function laeKl(layer: string): Promise<Record<string, string>> {
  const features = await wfsFeatures<KlRida>("metsaregister", layer, {
    count: 500,
    ttlSeconds: KL_TTL,
  });
  const map: Record<string, string> = {};
  for (const f of features) {
    if (f.kood) map[f.kood] = f.kirjeldus;
  }
  return map;
}

let cachePuuliik: Record<string, string> | null = null;
let cacheOmandivorm: Record<string, string> | null = null;
let cacheKasvukoht: Record<string, string> | null = null;
let cacheRinne: Record<string, string> | null = null;

/**
 * Laeb kõik klassifikaatorid mällu. Kutsu enne eraldise andmete vormindamist.
 * Vea korral jäävad kaardid tühjaks ja kuvame toorkoodid - see on ohutum kui
 * väljamõeldud tähendus.
 */
export async function laeKlassifikaatorid(): Promise<void> {
  const [pl, ov, kk, ri] = await Promise.allSettled([
    laeKl("kl_puuliik"),
    laeKl("kl_omandivorm"),
    laeKl("kl_kasvukoht"),
    laeKl("kl_rinne"),
  ]);
  if (pl.status === "fulfilled") cachePuuliik = pl.value;
  if (ov.status === "fulfilled") cacheOmandivorm = ov.value;
  if (kk.status === "fulfilled") cacheKasvukoht = kk.value;
  if (ri.status === "fulfilled") cacheRinne = ri.value;
}

function otsi(
  map: Record<string, string> | null,
  kood: string | null | undefined,
  fallback: string,
): string {
  if (!kood) return fallback;
  return map?.[kood] ?? kood;
}

export function puuliik(kood: string | null | undefined): string {
  return otsi(cachePuuliik, kood, "teadmata puuliik");
}

/**
 * Omandivorm vaikese algustahega, et see sobiks lause sisse.
 * kl_omandivorm annab "Eraomand, fuusiline isik" - suur algustaht lause
 * keskel oleks vale.
 */
export function omandivorm(kood: string | null | undefined): string {
  const v = otsi(cacheOmandivorm, kood, "teadmata omandivorm");
  return v.charAt(0).toLocaleLowerCase("et") + v.slice(1);
}

export function kasvukoht(kood: string | null | undefined): string {
  const v = otsi(cacheKasvukoht, kood, "teadmata");
  return v === kood ? `kasvukohatüüp ${kood}` : `${v} kasvukohatüüp`;
}

export function rinne(kood: string | null | undefined): string {
  return otsi(cacheRinne, kood, "määramata");
}

/**
 * Kas omandivorm tähistab riigimetsa (majandab RMK).
 * kl_omandivorm: R = riigiomand, T = riigimets ajutiselt.
 */
export function onRiigimets(kood: string | null | undefined): boolean {
  return kood === "R" || kood === "T";
}

/**
 * Kas omandivorm tähistab erametsa.
 * F = füüsiline isik, J = juriidiline isik, Y = sega, X = ühisomand.
 */
export function onEramets(kood: string | null | undefined): boolean {
  return kood === "F" || kood === "J" || kood === "Y" || kood === "X";
}
