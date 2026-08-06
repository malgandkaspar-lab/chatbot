import { TABLES, dimValues, latestYear, pxQuery } from "./pxweb.js";

/** Maakonna koodid Statistikaameti tabelites (MM04, MM05, MM10, KK513, KK514). */
export const MAAKONNAD: Record<string, string> = {
  "00": "Kogu Eesti",
  "37": "Harju maakond",
  "39": "Hiiu maakond",
  "44": "Ida-Viru maakond",
  "49": "Jõgeva maakond",
  "51": "Järva maakond",
  "57": "Lääne maakond",
  "59": "Lääne-Viru maakond",
  "65": "Põlva maakond",
  "67": "Pärnu maakond",
  "70": "Rapla maakond",
  "74": "Saare maakond",
  "78": "Tartu maakond",
  "82": "Valga maakond",
  "84": "Viljandi maakond",
  "86": "Võru maakond",
};

/** KK51 näitajakoodid. */
const KK51_N = {
  METSAMAA_PINDALA: "1",
  PUISTUTE_PINDALA: "2",
  ULDVARU: "10",
  HEKTARIVARU: "18",
  JUURDEKASV_HA: "26",
  METSASUS: "34",
} as const;

/** MM03 näitaja- ja raieliigikoodid. */
const MM03_N = {
  RAIEPINDALA: "1",
  RAIEPINDALA_VIGA: "2",
  RAIEMAHT: "3",
  RAIEMAHT_VIGA: "4",
  VALJARAIE_HA: "5",
} as const;

const MM03_RAIELIIK = {
  KOGURAIE: "1",
  UUENDUSRAIE: "2",
  LAGERAIE: "3",
  HOOLDUSRAIE: "4",
  HARVENDUSRAIE: "5",
  MUU: "6",
} as const;

/**
 * Allikaviited. KRIITILINE: Eestis on kaks eri metsaraie mõõtmisviisi ja
 * nende arvud EI OLE võrreldavad. Neid ei tohi kunagi kokku segada.
 *
 *   SMI (MM03, KK51)  - statistiline valikinventeerimine, ~10% veapiir.
 *                       2023: koguraie 11,7 mln m³, lageraie pindala 32,0 tuh ha
 *   Raiedokumendid (MM04) - metsateatiste/raiedokumentide summa, maakonniti.
 *                       2023: koguraie 12,5 mln m³, lageraie pindala 45,6 tuh ha
 *
 * Vahe mahus ~7%, lageraie pindalas ~43%. Juurdekasvuga tohib võrrelda AINULT
 * SMI arve, sest juurdekasv (KK51) on sama metoodika.
 */
export const ALLIKAS = {
  SMI: "Statistikaamet, tabelid KK51 ja MM03 (statistiline metsainventeerimine, SMI)",
  SMI_VARU: "Statistikaamet, tabel KK51 (statistiline metsainventeerimine, SMI)",
  SMI_RAIE: "Statistikaamet, tabel MM03 (statistiline metsainventeerimine, SMI)",
  DOKUMENDID: "Statistikaamet, tabel MM04 (raiedokumentide alusel)",
  UUENDAMINE: "Statistikaamet, tabel MM10 (metsa uuendamine)",
  KAHJUSTUSED: "Statistikaamet, tabelid KK513 ja KK514",
} as const;

// ---------------------------------------------------------------------------
// 1. Raiemaht vs juurdekasv - chatboti tähtsaim küsimus
// ---------------------------------------------------------------------------

export type RaieBilanss = {
  aasta: string;
  /** Koguraie maht, tuhat m³ (SMI hinnang). */
  raiemaht: number;
  /** SMI valimivea suhteline suurus, %. */
  raiemahuViga: number;
  lageraie: number;
  puistutePindala: number;
  /** Brutojuurdekasv m³/ha aastas. */
  juurdekasvHa: number;
  /** Brutojuurdekasv kokku, tuhat m³ = pindala x juurdekasvHa. */
  juurdekasvKokku: number;
  /** raiemaht / juurdekasvKokku. <1 tähendab, et raiutakse vähem kui juurde kasvab. */
  suhe: number;
  /** Puistute üldvaru sellel aastal, tuhat m³. */
  uldvaru: number;
  /** Varu trend: võrdlusaasta ja selle varu. */
  varuTrend: {
    algusAasta: string;
    algusVaru: number;
    loppAasta: string;
    loppVaru: number;
    muutus: number;
    muutusPct: number;
  };
};

/**
 * Võrdleb aastast raiemahtu brutojuurdekasvuga JA jälgib eraldi tegelikku
 * metsavaru muutust.
 *
 * TÄHTIS metoodiline hoiatus: need kaks signaali võivad osutada eri suunda.
 * Raiemaht võib olla juurdekasvust väiksem, samal ajal kui üldvaru kahaneb -
 * sest bilansist puudub looduslik suremus (tormimurd, üraskid, haigused) ning
 * SMI on valikuuring ~10% veapiiriga. Vastuses tuleb MÕLEMAD välja tuua.
 */
export async function raieVsJuurdekasv(vordlusPeriood = 5): Promise<RaieBilanss> {
  // KK51 ulatub kaugemale kui MM03 - kasuta viimast ÜHIST aastat.
  const [kk51Aastad, mm03Aastad] = await Promise.all([
    dimValues(TABLES.KK51, "Aasta"),
    dimValues(TABLES.MM03, "Aasta"),
  ]);
  const yhised = kk51Aastad.values.filter((a) => mm03Aastad.values.includes(a));
  const aasta = yhised.at(-1);
  if (!aasta) throw new Error("KK51 ja MM03 aastad ei kattu");

  const algusAasta = String(Number(aasta) - vordlusPeriood);
  const varuAastad = kk51Aastad.values.includes(algusAasta)
    ? [algusAasta, aasta]
    : [aasta];

  const [kk, mm] = await Promise.all([
    pxQuery(TABLES.KK51, {
      Näitaja: [
        KK51_N.PUISTUTE_PINDALA,
        KK51_N.ULDVARU,
        KK51_N.JUURDEKASV_HA,
      ],
      Aasta: varuAastad,
    }),
    pxQuery(TABLES.MM03, {
      Aasta: [aasta],
      "Raie liik": [MM03_RAIELIIK.KOGURAIE, MM03_RAIELIIK.LAGERAIE],
      Näitaja: [MM03_N.RAIEMAHT, MM03_N.RAIEMAHT_VIGA],
    }),
  ]);

  const puistutePindala = kk.required({
    Näitaja: KK51_N.PUISTUTE_PINDALA,
    Aasta: aasta,
  });
  const juurdekasvHa = kk.required({ Näitaja: KK51_N.JUURDEKASV_HA, Aasta: aasta });
  const uldvaru = kk.required({ Näitaja: KK51_N.ULDVARU, Aasta: aasta });

  const raiemaht = mm.required({
    Aasta: aasta,
    "Raie liik": MM03_RAIELIIK.KOGURAIE,
    Näitaja: MM03_N.RAIEMAHT,
  });
  const raiemahuViga = mm.required({
    Aasta: aasta,
    "Raie liik": MM03_RAIELIIK.KOGURAIE,
    Näitaja: MM03_N.RAIEMAHT_VIGA,
  });
  const lageraie = mm.required({
    Aasta: aasta,
    "Raie liik": MM03_RAIELIIK.LAGERAIE,
    Näitaja: MM03_N.RAIEMAHT,
  });

  const juurdekasvKokku = puistutePindala * juurdekasvHa;

  const algus = varuAastad[0]!;
  const algusVaru = kk.required({ Näitaja: KK51_N.ULDVARU, Aasta: algus });

  return {
    aasta,
    raiemaht,
    raiemahuViga,
    lageraie,
    puistutePindala,
    juurdekasvHa,
    juurdekasvKokku,
    suhe: raiemaht / juurdekasvKokku,
    uldvaru,
    varuTrend: {
      algusAasta: algus,
      algusVaru,
      loppAasta: aasta,
      loppVaru: uldvaru,
      muutus: uldvaru - algusVaru,
      muutusPct: ((uldvaru - algusVaru) / algusVaru) * 100,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Metsavaru ja metsasuse trend
// ---------------------------------------------------------------------------

export type VaruRida = {
  aasta: string;
  uldvaru: number;
  pindala: number;
  hektarivaru: number;
};

export type VaruTrend = {
  read: VaruRida[];
  esimene: VaruRida;
  viimane: VaruRida;
  muutusPct: number;
};

export async function metsavaruTrend(aastaid = 10): Promise<VaruTrend> {
  const { values } = await dimValues(TABLES.KK51, "Aasta");
  const aastad = values.slice(-aastaid);

  const ds = await pxQuery(TABLES.KK51, {
    Näitaja: [
      KK51_N.ULDVARU,
      KK51_N.PUISTUTE_PINDALA,
      KK51_N.HEKTARIVARU,
    ],
    Aasta: aastad,
  });

  const read: VaruRida[] = aastad.map((aasta) => ({
    aasta,
    uldvaru: ds.required({ Näitaja: KK51_N.ULDVARU, Aasta: aasta }),
    pindala: ds.required({ Näitaja: KK51_N.PUISTUTE_PINDALA, Aasta: aasta }),
    hektarivaru: ds.required({ Näitaja: KK51_N.HEKTARIVARU, Aasta: aasta }),
  }));

  const esimene = read[0]!;
  const viimane = read.at(-1)!;
  return {
    read,
    esimene,
    viimane,
    muutusPct: ((viimane.uldvaru - esimene.uldvaru) / esimene.uldvaru) * 100,
  };
}

export type Metsasus = {
  aasta: string;
  metsasusPct: number;
  metsamaaPindala: number;
  puistutePindala: number;
  vordlusAasta: string;
  vordlusMetsasusPct: number;
};

export async function metsasus(): Promise<Metsasus> {
  const { values } = await dimValues(TABLES.KK51, "Aasta");
  const aasta = values.at(-1)!;
  const vordlus = values[0]!;

  const ds = await pxQuery(TABLES.KK51, {
    Näitaja: [KK51_N.METSASUS, KK51_N.METSAMAA_PINDALA, KK51_N.PUISTUTE_PINDALA],
    Aasta: [vordlus, aasta],
  });

  return {
    aasta,
    metsasusPct: ds.required({ Näitaja: KK51_N.METSASUS, Aasta: aasta }),
    metsamaaPindala: ds.required({
      Näitaja: KK51_N.METSAMAA_PINDALA,
      Aasta: aasta,
    }),
    puistutePindala: ds.required({
      Näitaja: KK51_N.PUISTUTE_PINDALA,
      Aasta: aasta,
    }),
    vordlusAasta: vordlus,
    vordlusMetsasusPct: ds.required({ Näitaja: KK51_N.METSASUS, Aasta: vordlus }),
  };
}

// ---------------------------------------------------------------------------
// 3. Raie liigiti (SMI)
// ---------------------------------------------------------------------------

export type RaieLiik = {
  nimi: string;
  /** Kas tegemist on ülemliigi alaliigiga (MM03-s tähistatud ".." prefiksiga). */
  onAlaliik: boolean;
  raiemaht: number;
  raiepindala: number;
  osakaalPct: number;
};

export type RaieLiigiti = {
  aasta: string;
  koguraie: number;
  liigid: RaieLiik[];
};

export async function raieLiigiti(): Promise<RaieLiigiti> {
  const aasta = await latestYear(TABLES.MM03);
  const { values, valueTexts } = await dimValues(TABLES.MM03, "Raie liik");

  const ds = await pxQuery(TABLES.MM03, {
    Aasta: [aasta],
    "Raie liik": values,
    Näitaja: [MM03_N.RAIEMAHT, MM03_N.RAIEPINDALA],
  });

  const koguraie = ds.required({
    Aasta: aasta,
    "Raie liik": MM03_RAIELIIK.KOGURAIE,
    Näitaja: MM03_N.RAIEMAHT,
  });

  const liigid: RaieLiik[] = [];
  for (const [i, kood] of values.entries()) {
    if (kood === MM03_RAIELIIK.KOGURAIE) continue;
    const maht = ds.value({
      Aasta: aasta,
      "Raie liik": kood,
      Näitaja: MM03_N.RAIEMAHT,
    });
    if (maht === null) continue;
    const silt = valueTexts[i] ?? kood;
    // MM03 tähistab alaliike ".." prefiksiga, nt "..lageraie" uuendusraie all.
    const onAlaliik = silt.startsWith("..");
    const puhas = silt.replace(/^\.\.+/, "");
    liigid.push({
      // Ühtlustame algustähe: MM03-s on ülemliigid suure, alaliigid väikesega
      nimi: puhas.charAt(0).toLocaleLowerCase("et") + puhas.slice(1),
      onAlaliik,
      raiemaht: maht,
      raiepindala:
        ds.value({
          Aasta: aasta,
          "Raie liik": kood,
          Näitaja: MM03_N.RAIEPINDALA,
        }) ?? 0,
      osakaalPct: (maht / koguraie) * 100,
    });
  }

  return { aasta, koguraie, liigid };
}

// ---------------------------------------------------------------------------
// 4. Raie maakonnas (raiedokumentide alusel, MM04)
// ---------------------------------------------------------------------------

export type RaieMaakonnas = {
  aasta: string;
  maakond: string;
  maakonnaKood: string;
  raiemaht: number;
  raiepindala: number | null;
  riigimets: number | null;
  erametsa: number | null;
  eestiKokku: number;
  osakaalEestistPct: number;
};

export function leiaMaakonnaKood(sisend: string): string | null {
  const norm = sisend
    .toLowerCase()
    .replace(/maal$|maa$|\s*maakonnas$|\s*maakond$/u, "")
    .trim();
  if (!norm) return null;
  for (const [kood, nimi] of Object.entries(MAAKONNAD)) {
    if (kood === "00") continue;
    const base = nimi.replace(/\s*maakond$/, "").toLowerCase();
    if (base === norm || base.startsWith(norm) || norm.startsWith(base)) {
      return kood;
    }
  }
  return null;
}

export async function raieMaakonnas(
  maakonnaKood: string,
): Promise<RaieMaakonnas> {
  const aasta = await latestYear(TABLES.MM04);

  const ds = await pxQuery(TABLES.MM04, {
    Aasta: [aasta],
    Maakond: [maakonnaKood, "00"],
    "Raie liik": ["1"], // Koguraie
    "Metsamaa liik": ["1", "2", "3"], // Kokku, Riigimetsamaa, Erametsamaa
    Näitaja: ["1", "2"], // Raiepindala ha, Raiemaht m3
  });

  const val = (mk: string, mml: string, n: string) =>
    ds.value({
      Aasta: aasta,
      Maakond: mk,
      "Raie liik": "1",
      "Metsamaa liik": mml,
      Näitaja: n,
    });

  // Põhinäitajad on kohustuslikud - kui puuduvad, on parem viga kui vale arv.
  const raiemaht = val(maakonnaKood, "1", "2");
  const eestiKokku = val("00", "1", "2");
  if (raiemaht === null || eestiKokku === null) {
    throw new Error(
      `MM04-s puuduvad ${aasta} raiemahu andmed maakonnale ${maakonnaKood}`,
    );
  }

  return {
    aasta,
    maakond: MAAKONNAD[maakonnaKood] ?? maakonnaKood,
    maakonnaKood,
    raiemaht,
    raiepindala: val(maakonnaKood, "1", "1"),
    riigimets: val(maakonnaKood, "2", "2"),
    erametsa: val(maakonnaKood, "3", "2"),
    eestiKokku,
    osakaalEestistPct: (raiemaht / eestiKokku) * 100,
  };
}

// ---------------------------------------------------------------------------
// 5. Metsa uuendamine (MM10) vs lageraie pindala
// ---------------------------------------------------------------------------

export type Uuendamine = {
  aasta: string;
  maakond: string;
  /** Aktiivse metsauuendamise pindala kokku, ha. */
  kokku: number | null;
  metsakulv: number | null;
  metsaistutus: number | null;
  looduslikKaasaaitamine: number | null;
  kuuseistutus: number | null;
  mannistutus: number | null;
  kaseistutus: number | null;
  /**
   * Lageraie pindala samal aastal (MM04, raiedokumendid), ha.
   * HOIATUS: see EI OLE nimetaja "kui suur osa raiesmikest uuendatakse"
   * arvutamiseks - vaata `hoiatus` välja.
   */
  lageraiePindalaDokumendid: number | null;
  /** Metoodiline hoiatus, mis TULEB vastuses edastada. */
  hoiatus: string;
};

/**
 * Aktiivse metsauuendamise mahud.
 *
 * MM10 katab AINULT aktiivset uuendamist (istutus, külv, loodusliku uuenemise
 * kaasaaitamine). Enamik Eesti raiesmikke uueneb looduslikult ilma inimese
 * sekkumiseta ja neid MM10 ei loenda. Seetõttu on MM10/lageraiepindala suhtarv
 * eksitav - see EI näita, et ülejäänud raiesmikud jääksid uuenemata.
 */
export async function uuendamine(maakonnaKood = "00"): Promise<Uuendamine> {
  const aasta = await latestYear(TABLES.MM10);

  const ds = await pxQuery(TABLES.MM10, {
    Maakond: [maakonnaKood],
    Aasta: [aasta],
    Näitaja: ["1", "2", "3", "4", "5", "6", "8"],
  });

  // Null jäetakse nulliks - "andmed puuduvad" ei ole sama mis "0 hektarit".
  const v = (n: string) =>
    ds.value({ Maakond: maakonnaKood, Aasta: aasta, Näitaja: n });

  let lageraiePindalaDokumendid: number | null = null;
  try {
    const mm04Aastad = await dimValues(TABLES.MM04, "Aasta");
    if (mm04Aastad.values.includes(aasta)) {
      const r = await pxQuery(TABLES.MM04, {
        Aasta: [aasta],
        Maakond: [maakonnaKood],
        "Raie liik": ["3"],
        "Metsamaa liik": ["1"],
        Näitaja: ["1"],
      });
      lageraiePindalaDokumendid = r.value({
        Aasta: aasta,
        Maakond: maakonnaKood,
        "Raie liik": "3",
        "Metsamaa liik": "1",
        Näitaja: "1",
      });
    }
  } catch {
    lageraiePindalaDokumendid = null;
  }

  return {
    aasta,
    maakond: MAAKONNAD[maakonnaKood] ?? maakonnaKood,
    kokku: v("1"),
    metsakulv: v("2"),
    metsaistutus: v("3"),
    kuuseistutus: v("4"),
    mannistutus: v("5"),
    kaseistutus: v("6"),
    looduslikKaasaaitamine: v("8"),
    lageraiePindalaDokumendid,
    hoiatus:
      "Need arvud katavad ainult aktiivset uuendamist (istutus, külv, " +
      "loodusliku uuenemise kaasaaitamine). Suur osa raiesmikke uueneb " +
      "looduslikult ja neid siin ei loendata, seega ei tohi neid arve " +
      "lageraie pindalaga jagada.",
  };
}

// ---------------------------------------------------------------------------
// 6. Kahjustused (KK513 hukkunud, KK514 kahjustatud)
// ---------------------------------------------------------------------------

export type Kahjustused = {
  aasta: string;
  maakond: string;
  hukkunudKokku: number;
  hukkunudPohjused: { nimi: string; pindala: number }[];
  kahjustatudKokku: number;
  kahjustatudPohjused: { nimi: string; pindala: number }[];
};

export async function kahjustused(maakonnaKood = "00"): Promise<Kahjustused> {
  const aasta = await latestYear(TABLES.KK513);

  const [p513, p514] = await Promise.all([
    dimValues(TABLES.KK513, "Hukkumise põhjus"),
    dimValues(TABLES.KK514, "Kahjustuse põhjus"),
  ]);

  const [ds513, ds514] = await Promise.all([
    pxQuery(TABLES.KK513, {
      Maakond: [maakonnaKood],
      Aasta: [aasta],
      "Hukkumise põhjus": p513.values,
    }),
    pxQuery(TABLES.KK514, {
      Maakond: [maakonnaKood],
      Aasta: [aasta],
      "Kahjustuse põhjus": p514.values,
    }),
  ]);

  const kogu = (
    ds: typeof ds513,
    dim: string,
    koodid: string[],
    sildid: string[],
  ) => {
    let kokku = 0;
    const read: { nimi: string; pindala: number }[] = [];
    for (const [i, kood] of koodid.entries()) {
      const v = ds.value({ Maakond: maakonnaKood, Aasta: aasta, [dim]: kood });
      if (v === null) continue;
      if (kood === "1") {
        kokku = v;
        continue;
      }
      if (v > 0) read.push({ nimi: sildid[i] ?? kood, pindala: v });
    }
    read.sort((a, b) => b.pindala - a.pindala);
    return { kokku, read };
  };

  const h = kogu(ds513, "Hukkumise põhjus", p513.values, p513.valueTexts);
  const k = kogu(ds514, "Kahjustuse põhjus", p514.values, p514.valueTexts);

  return {
    aasta,
    maakond: MAAKONNAD[maakonnaKood] ?? maakonnaKood,
    hukkunudKokku: h.kokku,
    hukkunudPohjused: h.read.slice(0, 5),
    kahjustatudKokku: k.kokku,
    kahjustatudPohjused: k.read.slice(0, 5),
  };
}
