/**
 * Eestikeelne arvude ja ühikute vormindus.
 *
 * Kriitiline: kõik LLM-ini jõudvad arvud vormindatakse SIIN valmis sõnedeks.
 * Nii ei saa mudel arvu valesti käänata ("10500 tuhendatud kuupmeetrit").
 */

/** 1234.5 -> "1234,5" (koma kümnenderaldaja, tühik tuhandeliste vahel). */
export function num(value: number, decimals = 0): string {
  const rounded = value.toFixed(decimals);
  const [intPart = "0", fracPart] = rounded.split(".");
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = sign ? intPart.slice(1) : intPart;
  // Mitteкatkev tühik, et arv ei murduks reavahetusel
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  return fracPart ? `${sign}${grouped},${fracPart}` : `${sign}${grouped}`;
}

/**
 * Valib automaatselt sobiva suurusjärgu.
 * Sisend on TUHANDETES (nagu Statistikaameti tabelites), väljund inimloetav.
 *   15900 -> "15,9 miljonit"
 *   850   -> "850 tuhat"
 */
export function fromThousands(thousands: number): string {
  const abs = Math.abs(thousands);
  if (abs >= 1000) {
    const millions = thousands / 1000;
    return `${num(millions, millions >= 100 ? 0 : 1)} miljonit`;
  }
  return `${num(thousands, abs >= 100 ? 0 : 1)} tuhat`;
}

/** Tihumeetrid, sisend tuhandetes m³. 15900 -> "15,9 miljonit m³" */
export function m3FromThousands(thousandsM3: number): string {
  return `${fromThousands(thousandsM3)} m³`;
}

/** Hektarid, sisend tuhandetes ha. 2180 -> "2,18 miljonit ha" */
export function haFromThousands(thousandsHa: number): string {
  const abs = Math.abs(thousandsHa);
  if (abs >= 1000) return `${num(thousandsHa / 1000, 2)} miljonit ha`;
  return `${num(thousandsHa, abs >= 100 ? 0 : 1)} tuhat ha`;
}

/** Absoluutsed tihumeetrid (metsaregistri teatised on m³-des). */
export function m3(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${num(value / 1_000_000, 2)} miljonit m³`;
  return `${num(value)} m³`;
}

/** Absoluutsed hektarid. Väikesed pindalad kümnendkohaga, täisarvud ilma. */
export function ha(value: number): string {
  const decimals = Number.isInteger(value) || Math.abs(value) >= 100 ? 0 : 1;
  return `${num(value, decimals)} ha`;
}

export function pct(value: number, decimals = 1): string {
  return `${num(value, decimals)}%`;
}

/** "1,45 korda" tüüpi suhtarv. */
export function ratio(value: number): string {
  return `${num(value, 2)} korda`;
}

/** Eesti kuupäev: 2024-03-15 -> "15.03.2024" */
export function date(iso: string | null | undefined): string {
  if (!iso) return "teadmata";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Maakonnanimed seesütlevas käändes ("Võru maakonnas").
 * Statistikaamet kasutab nimetavat vormi, meil on vaja käänatud vormi.
 */
export function maakondInessive(nimetav: string): string {
  const clean = nimetav.replace(/\s*maakond$/i, "").trim();
  const special: Record<string, string> = {
    "Ida-Viru": "Ida-Virumaal",
    "Lääne-Viru": "Lääne-Virumaal",
    Lääne: "Läänemaal",
    Harju: "Harjumaal",
    Hiiu: "Hiiumaal",
    Järva: "Järvamaal",
    Jõgeva: "Jõgevamaal",
    Pärnu: "Pärnumaal",
    Põlva: "Põlvamaal",
    Rapla: "Raplamaal",
    Saare: "Saaremaal",
    Tartu: "Tartumaal",
    Valga: "Valgamaal",
    Viljandi: "Viljandimaal",
    Võru: "Võrumaal",
  };
  return special[clean] ?? `${clean} maakonnas`;
}

/** Loend eesti keeles: ["a","b","c"] -> "a, b ja c" */
export function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} ja ${items.at(-1)!}`;
}

/** Ainsus/mitmus: plural(1,"teatis","teatist") */
export function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}
