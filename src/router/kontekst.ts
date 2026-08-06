import type { IntentNimi } from "./intents.js";

/**
 * Vestluse mälu.
 *
 * Hoiame TAHTLIKULT väga vähe: viimast lahendatud asukohta, viimast maakonda
 * ja viimast intenti. Sellest piisab tegelikeks jätkuküsimusteks
 * ("aga Võrumaal?", "kas see on kaitse all?", "mis seal kasvab?") ning see
 * ei too kaasa ohtu, et bot vastaks vanade andmete põhjal uuele küsimusele.
 *
 * Mida me EI hoia: eelnevaid vastuseid ega arve. Iga vastus arvutatakse
 * uuesti värsketest andmetest.
 */
export type Kontekst = {
  viimaneIntent: IntentNimi | null;
  /** Kasutaja sisestatud asukoha tekst, nt "46801:003:0053". */
  viimaneAsukoht: string | null;
  /** Lahendatud inimloetav aadress, ainult kasutajale näitamiseks. */
  viimaneAsukohaNimi: string | null;
  /** Maakonna kood Statistikaameti tabelites, nt "86". */
  viimaneMaakond: string | null;
  viimaneMaakonnaNimi: string | null;
  /** Mitu küsimust selles seansis. */
  kysimusi: number;
  uuendatud: number;
};

export function uusKontekst(): Kontekst {
  return {
    viimaneIntent: null,
    viimaneAsukoht: null,
    viimaneAsukohaNimi: null,
    viimaneMaakond: null,
    viimaneMaakonnaNimi: null,
    kysimusi: 0,
    uuendatud: Date.now(),
  };
}

/**
 * Seansihoidla mälus. Prototüübi jaoks piisav; tootmises käiks see
 * Redisesse või küpsisesse allkirjastatud kujul.
 */
const SEANSI_ELUIGA_MS = 2 * 3600 * 1000;
const MAX_SEANSSE = 500;

const seansid = new Map<string, Kontekst>();

export function leiaSeanss(id: string): Kontekst {
  koristaVanad();
  let k = seansid.get(id);
  if (!k) {
    k = uusKontekst();
    seansid.set(id, k);
  }
  return k;
}

export function kustutaSeanss(id: string): void {
  seansid.delete(id);
}

function koristaVanad(): void {
  const nyyd = Date.now();
  for (const [id, k] of seansid) {
    if (nyyd - k.uuendatud > SEANSI_ELUIGA_MS) seansid.delete(id);
  }
  // Kaitse mälu täitumise vastu: viska vanimad välja
  if (seansid.size > MAX_SEANSSE) {
    const jarjestatud = [...seansid.entries()].sort(
      (a, b) => a[1].uuendatud - b[1].uuendatud,
    );
    for (const [id] of jarjestatud.slice(0, seansid.size - MAX_SEANSSE)) {
      seansid.delete(id);
    }
  }
}

export function seansideArv(): number {
  return seansid.size;
}
