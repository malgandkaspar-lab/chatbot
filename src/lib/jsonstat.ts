/**
 * JSON-stat 2.0 lugeja (Statistikaameti PxWeb väljund).
 *
 * Väärtused on lamedas massiivis row-major järjekorras. Käsitsi indeksiarvutus
 * on vigaderohke, seega pakume nimepõhise ligipääsu.
 */

export type JsonStat2 = {
  label: string;
  source: string;
  updated: string;
  id: string[];
  size: number[];
  dimension: Record<
    string,
    {
      label: string;
      category: {
        index: Record<string, number>;
        label: Record<string, string>;
      };
    }
  >;
  value: (number | null)[];
};

export class Dataset {
  private readonly strides: number[];

  constructor(private readonly raw: JsonStat2) {
    // row-major stride'id
    const n = raw.size.length;
    this.strides = new Array<number>(n).fill(1);
    for (let i = n - 2; i >= 0; i--) {
      this.strides[i] = this.strides[i + 1]! * raw.size[i + 1]!;
    }
  }

  get label(): string {
    return this.raw.label;
  }

  get source(): string {
    return this.raw.source;
  }

  /** Dimensiooni koodide loend algses järjekorras. */
  codes(dim: string): string[] {
    const index = this.dim(dim).category.index;
    return Object.keys(index).sort((a, b) => index[a]! - index[b]!);
  }

  /** Koodi inimloetav silt, nt "26" -> "Puistute varu juurdekasv ..." */
  labelOf(dim: string, code: string): string {
    return this.dim(dim).category.label[code] ?? code;
  }

  /**
   * Väärtus dimensioonikoodide järgi.
   * Tagastab null, kui lahter on tühi (Statistikaametil esineb).
   */
  value(codes: Record<string, string>): number | null {
    let offset = 0;
    for (let i = 0; i < this.raw.id.length; i++) {
      const dimName = this.raw.id[i]!;
      const code = codes[dimName];
      if (code === undefined) {
        throw new Error(`Dimensioon "${dimName}" on päringus määramata`);
      }
      const idx = this.dim(dimName).category.index[code];
      if (idx === undefined) {
        throw new Error(`Tundmatu kood "${code}" dimensioonis "${dimName}"`);
      }
      offset += idx * this.strides[i]!;
    }
    return this.raw.value[offset] ?? null;
  }

  /** Nagu value(), aga viskab vea kui puudub. Kasuta kui väärtus on kohustuslik. */
  required(codes: Record<string, string>): number {
    const v = this.value(codes);
    if (v === null) {
      throw new Error(
        `Puuduv väärtus: ${JSON.stringify(codes)} tabelis "${this.raw.label}"`,
      );
    }
    return v;
  }

  private dim(name: string) {
    const d = this.raw.dimension[name];
    if (!d) {
      throw new Error(
        `Dimensioon "${name}" puudub. Olemas: ${Object.keys(this.raw.dimension).join(", ")}`,
      );
    }
    return d;
  }
}
