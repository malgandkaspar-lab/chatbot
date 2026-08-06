/**
 * Konkurentsipiiraja.
 *
 * MIKS SEE ON VAJALIK: gsavalik.envir.ee GeoServer järjekorrastab samast
 * kliendist tulevad samaaegsed ühendused väga agressiivselt. Mõõdetud:
 *
 *   14 paringut jarjestikku          ~850 ms  (60 ms igauks)
 *   14 paringut Promise.all-iga    61 353 ms
 *
 * Erinevus on 70-kordne. Promise.all on siin lõks, mis ei anna viga, vaid
 * muudab vastuse minutipikkuseks. Seetõttu läheb iga GeoServeri päring
 * läbi selle piiraja.
 */

export class Limiter {
  private aktiivsed = 0;
  private jarjekord: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.aktiivsed >= this.max) {
      await new Promise<void>((resolve) => this.jarjekord.push(resolve));
    }
    this.aktiivsed++;
    try {
      return await fn();
    } finally {
      this.aktiivsed--;
      const jargmine = this.jarjekord.shift();
      if (jargmine) jargmine();
    }
  }

  /** Nagu Promise.all, aga piiratud konkurentsiga ja järjekorda hoides. */
  async all<T>(tood: (() => Promise<T>)[]): Promise<T[]> {
    return Promise.all(tood.map((t) => this.run(t)));
  }
}

/**
 * Kliimaministeeriumi GeoServer. Väärtus 2 on mõõdetud kompromiss:
 * 1 = kõige turvalisem aga aeglaseim, 4+ hakkab järjekorrastus uuesti pihta.
 */
export const geoserverLimiter = new Limiter(2);
