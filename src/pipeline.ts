import { marsruudi, type RuuteriTulemus } from "./router/regex.js";
import type { Paring } from "./router/intents.js";
import {
  raieVsJuurdekasv,
  metsavaruTrend,
  metsasus,
  raieLiigiti,
  raieMaakonnas,
  uuendamine,
  kahjustused,
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

export type VastusePakett = Vastus & {
  intent: string;
  ruuter: RuuteriTulemus["allikas"];
  ruuteriPohjus: string;
  /** Töötlemise kestus millisekundites. */
  kestusMs: number;
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
  llmRuuter?: (k: string) => Promise<Paring | null>,
): Promise<VastusePakett> {
  const algus = Date.now();
  let tulemus = marsruudi(kysimus);

  if (tulemus.paring.intent === "tundmatu" && llmRuuter) {
    try {
      const llmParing = await llmRuuter(kysimus);
      if (llmParing && llmParing.intent !== "tundmatu") {
        tulemus = { paring: llmParing, allikas: "llm", pohjus: "LLM-ruuter" };
      }
    } catch {
      // LLM kättesaamatu - jätkame tundmatuga, see ei ole viga
    }
  }

  const vastus = await taidaIntent(tulemus.paring, kysimus);

  return {
    ...vastus,
    intent: tulemus.paring.intent,
    ruuter: tulemus.allikas,
    ruuteriPohjus: tulemus.pohjus,
    kestusMs: Date.now() - algus,
  };
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

async function taidaIntent(paring: Paring, kysimus: string): Promise<Vastus> {
  switch (paring.intent) {
    case "raie_vs_juurdekasv":
      return T.raieVsJuurdekasvVastus(await raieVsJuurdekasv());

    case "metsavaru_trend":
      return T.metsavaruTrendVastus(await metsavaruTrend(10));

    case "metsasus":
      return T.metsasusVastus(await metsasus());

    case "raie_liigiti":
      return T.raieLiigitiVastus(await raieLiigiti());

    case "raie_maakonnas":
      return T.raieMaakonnasVastus(await raieMaakonnas(paring.maakond));

    case "uuendamine":
      return T.uuendamineVastus(await uuendamine(paring.maakond ?? "00"));

    case "kahjustused":
      return T.kahjustusedVastus(await kahjustused(paring.maakond ?? "00"));

    case "teatised_asukohas": {
      const r = await lahendaAsukoht(paring.asukoht);
      if (onVastus(r)) return r;
      const { asukoht, fraas } = r;

      // Katastritunnuse puhul on täpne CQL-päring parem kui ruumiline kast
      if (asukoht.katastritunnus) {
        const k = await teatisedKatastril(asukoht.katastritunnus);
        return T.teatisedVastus(k, fraas, true);
      }
      const k = await teatisedAlal(paringuAla(asukoht, 1000));
      return T.teatisedVastus(
        k,
        `${fraas} ümbruses (kuni 1 km)`,
        false,
      );
    }

    case "eraldise_info": {
      const r = await lahendaAsukoht(paring.asukoht);
      if (onVastus(r)) return r;
      const { asukoht, fraas } = r;

      if (!asukoht.katastritunnus) {
        return {
          tekst:
            `Metsaeraldise andmeid saan pärida ainult katastritunnuse järgi, ` +
            `aga "${paring.asukoht}" andis vasteks ${fraas}, millel ` +
            `katastritunnust ei ole.\n\n` +
            `Lisa palun katastritunnus kujul 12345:001:0001.`,
          allikad: [],
          hoiatused: [],
        };
      }
      const eraldised = await eraldisedKatastril(asukoht.katastritunnus);
      return T.eraldiseInfoVastus(
        eraldisteKokkuvote(asukoht.katastritunnus, eraldised),
        fraas,
      );
    }

    case "kaitsealad_asukohas": {
      const r = await lahendaAsukoht(paring.asukoht);
      if (onVastus(r)) return r;
      const { asukoht, fraas } = r;
      const k = await kaitseStaatus(asukoht.x, asukoht.y, 3000);
      return T.kaitsealadVastus(k, fraas);
    }

    case "reeglid":
      return T.reeglidVastus(otsiTeadmus(paring.kysimus, 2));

    case "tundmatu":
      return T.tundmatuVastus(kysimus);
  }
}

export { onKatastritunnus, KATASTRITUNNUS_RE };
