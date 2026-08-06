import { postJson, getJson } from "../lib/http.js";
import { cached, TTL } from "../lib/cache.js";
import { Dataset, type JsonStat2 } from "../lib/jsonstat.js";

const BASE = "https://andmed.stat.ee/api/v1/et/stat";

/** Kasutatavad tabelid. */
export const TABLES = {
  /** Metsavaru riikliku metsainventeerimise (SMI) hinnangul. */
  KK51: "Keskkond/loodusvarad-ja-nende-kasutamine/metsavaru/KK51.PX",
  /** Biomass ja seotud süsinik metsamaal puuliigi järgi. */
  KK509: "Keskkond/loodusvarad-ja-nende-kasutamine/metsavaru/KK509.PX",
  /** Hukkunud puistud maakonna järgi. */
  KK513: "Keskkond/loodusvarad-ja-nende-kasutamine/metsavaru/KK513.PX",
  /** Kahjustatud puistud maakonna järgi. */
  KK514: "Keskkond/loodusvarad-ja-nende-kasutamine/metsavaru/KK514.PX",
  /** Metsaraie SMI hinnangul (raieliigiti). */
  MM03: "Majandus/metsamajandus/MM03.PX",
  /** Metsaraie raiedokumentide alusel maakonna ja metsamaa liigi järgi. */
  MM04: "Majandus/metsamajandus/MM04.PX",
  /** Metsakultuuride rajamine maakonna järgi. */
  MM05: "Majandus/metsamajandus/MM05.PX",
  /** Metsa uuendamine maakonna järgi. */
  MM10: "Majandus/metsamajandus/MM10.PX",
} as const;

export type TableMeta = {
  title: string;
  variables: {
    code: string;
    text: string;
    values: string[];
    valueTexts: string[];
    elimination?: boolean;
  }[];
};

export async function tableMeta(table: string): Promise<TableMeta> {
  return cached(`pxmeta:${table}`, TTL.STAT, () =>
    getJson<TableMeta>(`${BASE}/${table}`, { timeoutMs: 30_000 }),
  );
}

/** Dimensiooni koodide loend metaandmetest. */
export async function dimValues(
  table: string,
  code: string,
): Promise<{ values: string[]; valueTexts: string[] }> {
  const meta = await tableMeta(table);
  const v = meta.variables.find((x) => x.code === code);
  if (!v) {
    throw new Error(
      `Tabelis ${table} puudub muutuja "${code}". Olemas: ${meta.variables.map((x) => x.code).join(", ")}`,
    );
  }
  return { values: v.values, valueTexts: v.valueTexts };
}

/** Viimane aasta, mille kohta tabelis andmed on. */
export async function latestYear(table: string): Promise<string> {
  const { values } = await dimValues(table, "Aasta");
  const last = values.at(-1);
  if (!last) throw new Error(`Tabelil ${table} puuduvad aastad`);
  return last;
}

export type Selection = Record<string, string[]>;

/**
 * PxWeb päring. `selection` on dimensiooni kood -> soovitud koodid.
 * Dimensioone, mida ei nimetata, PxWeb kas summeerib (elimination) või nõuab.
 */
export async function pxQuery(
  table: string,
  selection: Selection,
): Promise<Dataset> {
  const body = {
    query: Object.entries(selection).map(([code, values]) => ({
      code,
      selection: { filter: "item", values },
    })),
    response: { format: "json-stat2" },
  };

  const key = `pxquery:${table}:${JSON.stringify(body)}`;
  const raw = await cached(key, TTL.STAT, () =>
    postJson<JsonStat2>(`${BASE}/${table}`, body, { timeoutMs: 45_000 }),
  );
  return new Dataset(raw);
}
