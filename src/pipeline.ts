import { marsruudi, type RuuteriTulemus } from "./router/regex.js";
import type { Paring } from "./router/intents.js";
import type { Kontekst } from "./router/kontekst.js";
import {
  raieVsJuurdekasv,
  metsavaruTrend,
  metsasus,
  raieLiigiti,
  raieMaakonnas,
  uuendamine,
  kahjustused,
  MAAKONNAD,
} from "./tools/statistika.js";
import {
  teatisedKatastril,
  teatisedAlal,
  eraldisedKatastril,
  eraldisteKokkuvote,
} from "./tools/metsaregister.js";
import { kaitseStaatus } from "./tools/eelis.js";
import { otsiTeadmus } from "./tools/teadmus.js";
import { leiaAsukoht, paringuAla, type Asukoht } from "./tools/geocode.js";
import { onKatastritunnus, KATASTRITUNNUS_RE } from "./tools/wfs.js";
import * as T from "./answer/templates.js";
import type { Vastus } from "./answer/templates.js";

export type Graafik =
  | { tyyp: "rida"; sildid: string[]; vaartused: number[]; uhik: string }
  | { tyyp: "tulp"; sildid: string[]; vaartused: number[]; uhik: string };

export type VastusePakett = Vastus & {
  intent: string;
  ruuter: RuuteriTulemus["allikas"];
  ruuteriPohjus: string;
  /** Selgitus, kui vastus tugines varasemale vestlusele. */
  kontekstiSelgitus?: string;
  /** Töötlemise kestus millisekundites. */
  kestusMs: number;
  /** Väike diagramm vastuse juurde (lihtne SVG, klient joonistab). */
  graafik?: Graafik;
};

export type VastaValikud = {
  /** LLM-varuvariant, kutsutakse ainult kui regex vastet ei leidnud. */
  llmRuuter?: (k: string) => Promise<Paring | null>;
  /** Vestluse mälu. Kui puudub, käitub bot mäluta (iga küsimus iseseisev). */
  kontekst?: Kontekst | null;
};

/**
 * Käivitab küsimuse töötlemise.
 *
 * `llmRuuter` on valikuline varuvariant, mida kutsutakse ainult siis, kui
 * regex-ruuter vastet ei leidnud. Nii ei maksa 90% küsimustest LLM-i
 * ~20-sekundilist latentsust.
 */
export async function vasta(
  kysimus: string,
  valikud: VastaValikud | ((k: string) => Promise<Paring | null>) = {},
): Promise<VastusePakett> {
  // Tagasiühilduvus: varem võttis funktsioon teise argumendina otse llmRuuteri
  const v: VastaValikud =
    typeof valikud === "function" ? { llmRuuter: valikud } : valikud;
  const kontekst = v.kontekst ?? null;

  const algus = Date.now();
  let tulemus = marsruudi(kysimus, kontekst);

  if (tulemus.paring.intent === "tundmatu" && v.llmRuuter) {
    try {
      const llmParing = await v.llmRuuter(kysimus);
      if (llmParing && llmParing.intent !== "tundmatu") {
        tulemus = { paring: llmParing, allikas: "llm", pohjus: "LLM-ruuter" };
      }
    } catch {
      // LLM kättesaamatu - jätkame tundmatuga, see ei ole viga
    }
  }

  const { vastus, lahendatudAsukoht, graafik } = await taidaIntent(
    tulemus.paring,
    kysimus,
  );

  if (kontekst) uuendaKontekst(kontekst, tulemus.paring, lahendatudAsukoht);

  return {
    ...vastus,
    intent: tulemus.paring.intent,
    ruuter: tulemus.allikas,
    ruuteriPohjus: tulemus.pohjus,
    ...(tulemus.kontekstiSelgitus
      ? { kontekstiSelgitus: tulemus.kontekstiSelgitus }
      : {}),
    ...(graafik ? { graafik } : {}),
    kestusMs: Date.now() - algus,
  };
}

/**
 * Uuendab mälu. Konteksti kirjutame ainult ÕNNESTUNUD lahenduse põhjal -
 * kui asukohta ei leitud, ei tohi vigane sisend eelmist head asukohta üle
 * kirjutada, muidu läheb järgmine jätkuküsimus katki.
 */
function uuendaKontekst(
  k: Kontekst,
  paring: Paring,
  lahendatud: { sisend: string; nimi: string } | null,
): void {
  k.kysimusi++;
  k.uuendatud = Date.now();

  if (paring.intent !== "tundmatu") k.viimaneIntent = paring.intent;

  if (lahendatud) {
    k.viimaneAsukoht = lahendatud.sisend;
    k.viimaneAsukohaNimi = lahendatud.nimi;
  }

  if ("maakond" in paring && paring.maakond) {
    k.viimaneMaakond = paring.maakond;
    k.viimaneMaakonnaNimi = MAAKONNAD[paring.maakond] ?? paring.maakond;
  }
}

/** Inimloetav asukohafraas vastuse alguseks. */
function asukohaFraas(a: Asukoht): string {
  const osad = [a.aadress];
  if (a.katastritunnus) osad.push(`(kataster ${a.katastritunnus})`);
  return osad.join(" ");
}

async function lahendaAsukoht(
  sisend: string,
): Promise<{ asukoht: Asukoht; fraas: string } | Vastus> {
  const asukoht = await leiaAsukoht(sisend);
  if (!asukoht) {
    return {
      tekst:
        `Ma ei leidnud asukohta "${sisend}".\n\n` +
        `Proovi täpsemalt — kõige kindlam on katastritunnus kujul ` +
        `12345:001:0001, mille leiad Maa- ja Ruumiameti kaardirakendusest ` +
        `või kinnistusraamatust. Töötab ka täisaadress või küla ja valla nimi, ` +
        `nt "Pupli küla, Rõuge vald".`,
      allikad: [],
      hoiatused: [],
    };
  }
  return { asukoht, fraas: asukohaFraas(asukoht) };
}

function onVastus(x: unknown): x is Vastus {
  return typeof x === "object" && x !== null && "tekst" in x;
}

type Tulem = {
  vastus: Vastus;
  /** Õnnestunult lahendatud asukoht, mälu uuendamiseks. */
  lahendatudAsukoht: { sisend: string; nimi: string } | null;
  /** Diagrammi andmed, kui vastusel on numbrilist reastikku. */
  graafik?: Graafik;
};

const ilmaAsukohta = (vastus: Vastus, graafik?: Graafik): Tulem => ({
  vastus,
  lahendatudAsukoht: null,
  ...(graafik ? { graafik } : {}),
});

async function taidaIntent(paring: Paring, kysimus: string): Promise<Tulem> {
  switch (paring.intent) {
    case "raie_vs_juurdekasv":
      return ilmaAsukohta(T.raieVsJuurdekasvVastus(await raieVsJuurdekasv()));

    case "metsavaru_trend": {
      const t = await metsavaruTrend(10);
      return ilmaAsukohta(T.metsavaruTrendVastus(t), {
        tyyp: "rida",
        sildid: t.read.map((r) => r.aasta),
        vaartused: t.read.map((r) => r.uldvaru),
        uhik: "mln m³",
      });
    }

    case "metsasus":
      return ilmaAsukohta(T.metsasusVastus(await metsasus()));

    case "raie_liigiti": {
      const r = await raieLiigiti();
      return ilmaAsukohta(T.raieLiigitiVastus(r), {
        tyyp: "tulp",
        sildid: r.liigid.map((l) => l.nimi),
        vaartused: r.liigid.map((l) => l.osakaalPct),
        uhik: "% raiemahust",
      });
    }

    case "raie_maakonnas":
      return ilmaAsukohta(
        T.raieMaakonnasVastus(await raieMaakonnas(paring.maakond)),
      );

    case "uuendamine":
      return ilmaAsukohta(
        T.uuendamineVastus(await uuendamine(paring.maakond ?? "00")),
      );

    case "kahjustused": {
      const k = await kahjustused(paring.maakond ?? "00");
      return ilmaAsukohta(T.kahjustusedVastus(k), {
        tyyp: "tulp",
        sildid: k.hukkunudPohjused.map((p) => p.nimi),
        vaartused: k.hukkunudPohjused.map((p) => p.pindala),
        uhik: "ha",
      });
    }

    case "teatised_asukohas": {
      const r = await lahendaAsukoht(paring.asukoht);
      if (onVastus(r)) return ilmaAsukohta(r);
      const { asukoht, fraas } = r;
      const malu = { sisend: paring.asukoht, nimi: fraas };

      // Katastritunnuse puhul on täpne CQL-päring parem kui ruumiline kast
      if (asukoht.katastritunnus) {
        const k = await teatisedKatastril(asukoht.katastritunnus);
        return {
          vastus: T.teatisedVastus(k, fraas, true),
          lahendatudAsukoht: malu,
        };
      }
      const k = await teatisedAlal(paringuAla(asukoht, 1000));
      return {
        vastus: T.teatisedVastus(k, `${fraas} ümbruses (kuni 1 km)`, false),
        lahendatudAsukoht: malu,
      };
    }

    case "eraldise_info": {
      const r = await lahendaAsukoht(paring.asukoht);
      if (onVastus(r)) return ilmaAsukohta(r);
      const { asukoht, fraas } = r;
      const malu = { sisend: paring.asukoht, nimi: fraas };

      if (!asukoht.katastritunnus) {
        return {
          vastus: {
            tekst:
              `Metsaeraldise andmeid saan pärida ainult katastritunnuse järgi, ` +
              `aga "${paring.asukoht}" andis vasteks ${fraas}, millel ` +
              `katastritunnust ei ole.\n\n` +
              `Lisa palun katastritunnus kujul 12345:001:0001.`,
            allikad: [],
            hoiatused: [],
          },
          // Asukoht ise lahenes, seega jätame selle mällu
          lahendatudAsukoht: malu,
        };
      }
      const eraldised = await eraldisedKatastril(asukoht.katastritunnus);
      return {
        vastus: T.eraldiseInfoVastus(
          eraldisteKokkuvote(asukoht.katastritunnus, eraldised),
          fraas,
        ),
        lahendatudAsukoht: malu,
      };
    }

    case "kaitsealad_asukohas": {
      const r = await lahendaAsukoht(paring.asukoht);
      if (onVastus(r)) return ilmaAsukohta(r);
      const { asukoht, fraas } = r;
      const k = await kaitseStaatus(asukoht.x, asukoht.y, 3000);
      return {
        vastus: T.kaitsealadVastus(k, fraas),
        lahendatudAsukoht: { sisend: paring.asukoht, nimi: fraas },
      };
    }

    case "reeglid":
      return ilmaAsukohta(T.reeglidVastus(otsiTeadmus(paring.kysimus, 2)));

    case "tundmatu":
      return ilmaAsukohta(T.tundmatuVastus(kysimus));
  }
}

export { onKatastritunnus, KATASTRITUNNUS_RE };
