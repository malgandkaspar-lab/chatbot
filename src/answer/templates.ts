import {
  m3FromThousands,
  haFromThousands,
  num,
  pct,
  ha,
  m3,
  date,
  list,
  plural,
  maakondInessive,
} from "../lib/format.js";
import type {
  RaieBilanss,
  VaruTrend,
  Metsasus,
  RaieLiigiti,
  RaieMaakonnas,
  Uuendamine,
  Kahjustused,
} from "../tools/statistika.js";
import { ALLIKAS } from "../tools/statistika.js";
import type {
  TeatisteKokkuvote,
  EraldisteKokkuvote,
} from "../tools/metsaregister.js";
import type { KaitseStaatus } from "../tools/eelis.js";
import type { Loik } from "../tools/teadmus.js";

/**
 * Eestikeelsed vastusešabloonid.
 *
 * Miks šabloonid ja mitte LLM: qwen3:8b annab CPU-l 4,6 tok/s (vastus ~40 s)
 * ja tema eesti keel murdub ("10500 tuhendatud kuupmeetrit", "raiutamise").
 * Siin renderdatud vastus on grammatiliselt korrektne, tuleb ~0 sekundiga ja
 * numbrid on garanteeritult õiged.
 */

export type Vastus = {
  /** Markdown-vormingus vastus eesti keeles. */
  tekst: string;
  allikad: string[];
  /** Metoodilised hoiatused, mida kasutajale näidatakse. */
  hoiatused: string[];
};

function kokku(
  loigud: (string | null | undefined)[],
  allikad: string[],
  hoiatused: string[] = [],
): Vastus {
  return {
    tekst: loigud.filter(Boolean).join("\n\n"),
    allikad,
    hoiatused,
  };
}

// ---------------------------------------------------------------------------
// 1. Raie vs juurdekasv - kaks signaali, vastuolu selgelt välja
// ---------------------------------------------------------------------------

export function raieVsJuurdekasvVastus(b: RaieBilanss): Vastus {
  const t = b.varuTrend;
  const varuKahaneb = t.muutus < 0;
  const raieAllaJuurdekasvu = b.suhe < 1;

  const esimene =
    `**Lühivastus: sõltub sellest, mida mõõta — kaks ametlikku näitajat ` +
    `osutavad eri suunda.**`;

  const signaal1 =
    `**1. Raiemaht vs juurdekasv.** ${b.aasta}. aastal raiuti Eestis ` +
    `${m3FromThousands(b.raiemaht)} puitu, millest lageraie moodustas ` +
    `${m3FromThousands(b.lageraie)}. Puistute brutojuurdekasv oli samal ajal ` +
    `${m3FromThousands(b.juurdekasvKokku)} aastas ` +
    `(${num(b.juurdekasvHa, 1)} m³ hektari kohta × ` +
    `${haFromThousands(b.puistutePindala)} puistuid). Raiuti seega ` +
    `**${pct(b.suhe * 100, 0)} juurdekasvust** ehk ` +
    `${raieAllaJuurdekasvu ? "vähem kui juurde kasvas" : "rohkem kui juurde kasvas"}.`;

  const signaal2 =
    `**2. Tegelik metsavaru.** Samal ajal on puistute üldvaru ` +
    `${t.algusAasta}. aasta ${m3FromThousands(t.algusVaru)} pealt ` +
    `${varuKahaneb ? "langenud" : "tõusnud"} ${t.loppAasta}. aastaks ` +
    `${m3FromThousands(t.loppVaru)}-ni ehk ` +
    `${varuKahaneb ? "kahanenud" : "kasvanud"} ` +
    `${pct(Math.abs(t.muutusPct))}.`;

  const vastuolu =
    raieAllaJuurdekasvu && varuKahaneb
      ? `**Miks need on vastuolus?** Kui raie jääks juurdekasvust ` +
        `${m3FromThousands(b.juurdekasvKokku - b.raiemaht)} võrra alla, peaks ` +
        `metsavaru igal aastal kasvama. Tegelikult see kahaneb. Vahe tuleb ` +
        `peamiselt sellest, et brutojuurdekasv ei arvesta looduslikku ` +
        `suremust — tormimurdu, üraskikahjustusi ja haigusi. Osa juurdekasvust ` +
        `"kaob" seega raiumata. Lisaks on tegemist valikuuringuga: ` +
        `raiemahu enda veapiir on ±${pct(b.raiemahuViga)}, mis ` +
        `${b.aasta}. aasta puhul tähendab ligikaudu ` +
        `±${m3FromThousands((b.raiemaht * b.raiemahuViga) / 100)}.`
      : null;

  const jareldus = raieAllaJuurdekasvu
    ? `**Kokkuvõte.** Ainult raiemahtu ja juurdekasvu võrreldes on vastus "ei". ` +
      `Metsavaru muutust vaadates on pilt ${varuKahaneb ? "murettekitavam" : "sama"}. ` +
      `Kes väidab kindlalt üht või teist, valib tavaliselt ühe näitaja ja jätab ` +
      `teise mainimata.`
    : `**Kokkuvõte.** Raiemaht ületab juurdekasvu.`;

  return kokku(
    [esimene, signaal1, signaal2, vastuolu, jareldus],
    [ALLIKAS.SMI],
    [
      "Mõlemad arvud pärinevad statistilisest metsainventeerimisest (SMI), " +
        "mis on valikuuring. Raiedokumentide alusel arvutatud raiemaht on " +
        "teistsugune ja neid kahte ei tohi omavahel võrrelda.",
    ],
  );
}

// ---------------------------------------------------------------------------
// 2. Metsavaru trend
// ---------------------------------------------------------------------------

export function metsavaruTrendVastus(t: VaruTrend): Vastus {
  const kahaneb = t.muutusPct < 0;
  const e = t.esimene;
  const v = t.viimane;

  const sisu =
    `Puistute üldvaru oli ${e.aasta}. aastal ${m3FromThousands(e.uldvaru)} ja ` +
    `${v.aasta}. aastal ${m3FromThousands(v.uldvaru)} — ` +
    `${kahaneb ? "kahanemine" : "kasv"} ${pct(Math.abs(t.muutusPct))}.`;

  const hektar =
    `Hektari kohta on varu muutunud ${num(e.hektarivaru)} m³/ha pealt ` +
    `${num(v.hektarivaru)} m³/ha-ni. Puistute pindala on samal ajal olnud ` +
    `${haFromThousands(e.pindala)} → ${haFromThousands(v.pindala)}, ehk ` +
    `${Math.abs(v.pindala - e.pindala) / e.pindala < 0.03 ? "püsinud üsna stabiilne" : "muutunud"}. ` +
    `See tähendab, et ${kahaneb ? "kahanemine ei tule metsamaa vähenemisest, vaid puistute hõrenemisest" : "kasv tuleb puistute tihenemisest"}.`;

  const tabel = [
    "| Aasta | Üldvaru | Puistute pindala | m³/ha |",
    "|---|---|---|---|",
    ...t.read.map(
      (r) =>
        `| ${r.aasta} | ${m3FromThousands(r.uldvaru)} | ${haFromThousands(r.pindala)} | ${num(r.hektarivaru)} |`,
    ),
  ].join("\n");

  return kokku([sisu, hektar, tabel], [ALLIKAS.SMI_VARU]);
}

// ---------------------------------------------------------------------------
// 3. Metsasus
// ---------------------------------------------------------------------------

export function metsasusVastus(m: Metsasus): Vastus {
  const kasv = m.metsasusPct - m.vordlusMetsasusPct;
  const sisu =
    `${m.aasta}. aastal oli Eesti metsasus **${pct(m.metsasusPct)}** ehk ligikaudu ` +
    `pool riigi pindalast on metsamaa. Metsamaa kogupindala on ` +
    `${haFromThousands(m.metsamaaPindala)}, millest puistuid ehk ` +
    `puudega kaetud metsa on ${haFromThousands(m.puistutePindala)}.`;

  const trend =
    `Võrdluseks: ${m.vordlusAasta}. aastal oli metsasus ${pct(m.vordlusMetsasusPct)}, ` +
    `seega on see ${kasv >= 0 ? "kasvanud" : "kahanenud"} ` +
    `${num(Math.abs(kasv), 1)} protsendipunkti võrra.`;

  const selgitus =
    `Metsamaa ja puistute pindala erinevus tuleb sellest, et metsamaa hulka ` +
    `loetakse ka raiesmikud, noorendikud ja ajutiselt puudeta alad.`;

  return kokku([sisu, trend, selgitus], [ALLIKAS.SMI_VARU]);
}

// ---------------------------------------------------------------------------
// 4. Raie liigiti
// ---------------------------------------------------------------------------

export function raieLiigitiVastus(r: RaieLiigiti): Vastus {
  const sisu =
    `${r.aasta}. aastal oli koguraie ${m3FromThousands(r.koguraie)}. ` +
    `Jaotus raieliikide vahel:`;

  const tabel = [
    "| Raieliik | Raiemaht | Osa koguraiest | Raiepindala |",
    "|---|---|---|---|",
    ...r.liigid.map(
      (l) =>
        `| ${l.onAlaliik ? "&nbsp;&nbsp;sh " : ""}${l.nimi} | ${m3FromThousands(l.raiemaht)} | ${pct(l.osakaalPct)} | ${haFromThousands(l.raiepindala)} |`,
    ),
  ].join("\n");

  const lageraie = r.liigid.find((l) => l.nimi === "lageraie");
  const hooldus = r.liigid.find((l) => l.nimi === "hooldusraie");
  const jareldus =
    lageraie && hooldus
      ? `Mahult on lageraie selgelt ülekaalus (${pct(lageraie.osakaalPct)}), ` +
        `kuid pindalalt katab hooldusraie rohkem maad ` +
        `(${haFromThousands(hooldus.raiepindala)} vs ` +
        `${haFromThousands(lageraie.raiepindala)}). Hooldusraiel võetakse ` +
        `hektarilt vähe puitu, lageraiel kogu puistu.`
      : null;

  const nb =
    `Tabelis on "sh" tähistatud alaliigid, mis on juba ülemliigi sees: ` +
    `uuendusraie sisaldab lageraiet, hooldusraie sisaldab harvendusraiet. ` +
    `Ridade kokkuliitmine annaks topeltarvestuse.`;

  return kokku([sisu, tabel, jareldus, nb], [ALLIKAS.SMI_RAIE]);
}

// ---------------------------------------------------------------------------
// 5. Raie maakonnas
// ---------------------------------------------------------------------------

export function raieMaakonnasVastus(r: RaieMaakonnas): Vastus {
  const kohas = maakondInessive(r.maakond);
  const sisu =
    `${kohas} raiuti ${r.aasta}. aastal **${m3(r.raiemaht)}** puitu` +
    (r.raiepindala !== null ? ` pindalalt ${ha(r.raiepindala)}` : "") +
    `. See on ${pct(r.osakaalEestistPct)} kogu Eesti raiemahust ` +
    `(${m3(r.eestiKokku)}).`;

  const omand =
    r.riigimets !== null && r.erametsa !== null
      ? `Omandi järgi: riigimetsast ${m3(r.riigimets)} ` +
        `(${pct((r.riigimets / r.raiemaht) * 100)}) ja erametsast ` +
        `${m3(r.erametsa)} (${pct((r.erametsa / r.raiemaht) * 100)}).`
      : null;

  return kokku([sisu, omand], [ALLIKAS.DOKUMENDID], [
    "Need arvud pärinevad raiedokumentidest (Statistikaamet MM04) ja EI OLE " +
      "võrreldavad statistilise metsainventeerimise (SMI) arvudega, mida " +
      "kasutatakse juurdekasvu võrdlemisel. 2023. aastal andis SMI koguraieks " +
      "11,7 miljonit m³ ja raiedokumendid 12,5 miljonit m³.",
  ]);
}

// ---------------------------------------------------------------------------
// 6. Uuendamine
// ---------------------------------------------------------------------------

const hOrNull = (v: number | null) => (v === null ? "andmed puuduvad" : ha(v));

export function uuendamineVastus(u: Uuendamine): Vastus {
  const kohas = u.maakond === "Kogu Eesti" ? "Eestis" : maakondInessive(u.maakond);

  const sisu =
    `${u.aasta}. aastal rakendati ${kohas} aktiivseid metsauuendamise võtteid ` +
    `**${hOrNull(u.kokku)}** ulatuses:`;

  const read = [
    `- metsaistutus ${hOrNull(u.metsaistutus)}` +
      (u.kuuseistutus !== null || u.mannistutus !== null || u.kaseistutus !== null
        ? ` (kuusk ${hOrNull(u.kuuseistutus)}, mänd ${hOrNull(u.mannistutus)}, kask ${hOrNull(u.kaseistutus)})`
        : ""),
    `- metsakülv ${hOrNull(u.metsakulv)}`,
    `- loodusliku uuenemise kaasaaitamine ${hOrNull(u.looduslikKaasaaitamine)}`,
  ].join("\n");

  const kulv =
    u.metsakulv === 0
      ? `Metsakülv on praktiliselt kadunud — ${u.aasta}. aastal 0 hektarit. ` +
        `Uuendamine käib peaaegu täielikult istutuse teel.`
      : null;

  const kontekst =
    u.lageraiePindalaDokumendid !== null
      ? `Võrdluseks: lageraie pindala oli samal aastal ` +
        `${ha(u.lageraiePindalaDokumendid)} (raiedokumentide alusel).`
      : null;

  return kokku(
    [sisu, read, kulv, kontekst],
    [ALLIKAS.UUENDAMINE, ALLIKAS.DOKUMENDID],
    [u.hoiatus],
  );
}

// ---------------------------------------------------------------------------
// 7. Kahjustused
// ---------------------------------------------------------------------------

export function kahjustusedVastus(k: Kahjustused): Vastus {
  const kohas = k.maakond === "Kogu Eesti" ? "Eestis" : maakondInessive(k.maakond);

  const hukkunud =
    `${k.aasta}. aastal hukkus ${kohas} **${ha(k.hukkunudKokku)}** puistuid. ` +
    `Peamised põhjused:`;
  const hRead = k.hukkunudPohjused
    .map((p) => `- ${p.nimi}: ${ha(p.pindala)} (${pct((p.pindala / k.hukkunudKokku) * 100)})`)
    .join("\n");

  const kahjustatud =
    `Lisaks oli aasta lõpu seisuga kahjustatud (kuid mitte hukkunud) ` +
    `**${ha(k.kahjustatudKokku)}** puistuid:`;
  const kRead = k.kahjustatudPohjused
    .map((p) => `- ${p.nimi}: ${ha(p.pindala)}`)
    .join("\n");

  const putukad = k.hukkunudPohjused.find((p) =>
    p.nimi.toLocaleLowerCase("et").includes("putuka"),
  );
  const kontekst = putukad
    ? `Putukakahjustused (peamiselt kuuse-kooreürask) olid ${k.aasta}. aastal ` +
      `hukkumise suurim üksikpõhjus — ${ha(putukad.pindala)}.`
    : null;

  return kokku(
    [hukkunud, hRead, kahjustatud, kRead, kontekst],
    [ALLIKAS.KAHJUSTUSED],
    [
      "Hukkunud ja kahjustatud puistute pindalad on eri tabelitest ja neid ei " +
        "tohi kokku liita — kahjustatud ala võib hiljem hukkuda.",
    ],
  );
}

// ---------------------------------------------------------------------------
// 8. Metsateatised asukohas
// ---------------------------------------------------------------------------

export function teatisedVastus(
  k: TeatisteKokkuvote,
  asukohaKirjeldus: string,
  onKataster: boolean,
): Vastus {
  if (k.leitud === 0) {
    return kokku(
      [
        `${asukohaKirjeldus} ei leidnud ma metsaregistrist ühtegi registreeritud ` +
          `metsateatist.`,
        `See tähendab, et avalikus metsaregistri kihis ei ole sellel alal ` +
          `kehtivat raieluba. Kindluse mõttes tasub kontrollida metsaportaalist ` +
          `register.metsad.ee.`,
      ],
      [k.allikas],
      [k.hoiatus],
    );
  }

  const ulatus = onKataster ? "sellel katastriüksusel" : "sellel alal";
  const sisu =
    `${asukohaKirjeldus} on metsaregistris **${k.leitud} ${plural(k.leitud, "registreeritud metsateatis", "registreeritud metsateatist")}**` +
    (k.karbitud ? ` (näitan neist ${k.teatised.length})` : "") +
    `. Kokku ${ha(k.kokkuPindala)} ja ${m3(k.kokkuMaht)} kavandatud raiemahtu, ` +
    `neist kehtivaid ${k.kehtivaidArv}.`;

  const liigid = k.liigid.length
    ? `Raieliikide kaupa ${ulatus}:\n` +
      k.liigid
        .map(
          (l) =>
            `- ${l.nimi}: ${l.arv} ${plural(l.arv, "teatis", "teatist")}, ${ha(l.pindala)}, ${m3(l.maht)}`,
        )
        .join("\n")
    : null;

  const naited = k.teatised.slice(0, 5);
  const tabel = naited.length
    ? [
        "| Teatis | Eraldis | Raieliik | Pindala | Maht | Kehtib kuni |",
        "|---|---|---|---|---|---|",
        ...naited.map(
          (t) =>
            `| ${t.teatiseNr ?? "-"} | ${t.eraldiseNr ?? "-"} | ${t.raieliik} | ` +
            `${t.pindala !== null ? ha(t.pindala) : "-"} | ` +
            `${t.raiutavMaht !== null ? m3(t.raiutavMaht) : "-"} | ` +
            `${date(t.kehtivKuni)}${t.onKehtiv ? "" : " (aegunud)"} |`,
        ),
        k.leitud > naited.length
          ? `\nNäitan ${naited.length} teatist ${k.leitud}-st.`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : null;

  return kokku([sisu, liigid, tabel], [k.allikas], [k.hoiatus]);
}

// ---------------------------------------------------------------------------
// 9. Eraldise info
// ---------------------------------------------------------------------------

export function eraldiseInfoVastus(
  k: EraldisteKokkuvote,
  asukohaKirjeldus: string,
): Vastus {
  if (k.eraldisteArv === 0) {
    return kokku(
      [
        `${asukohaKirjeldus} ei leidnud ma metsaregistrist avalikke ` +
          `metsaeraldise andmeid.`,
        `Metsaregistris on avalikult nähtavad riigimetsa eraldised ja need ` +
          `erametsa eraldised, mille omanik on inventeerimisandmed ` +
          `avalikustanud. Tühi tulemus ei tähenda, et metsa ei ole. ` +
          `Oma kinnistu andmeid näed metsaportaalis register.metsad.ee sisse logides.`,
      ],
      [k.allikas],
      [k.hoiatus],
    );
  }

  const sisu =
    `${asukohaKirjeldus} on metsaregistris **${k.eraldisteArv} ${plural(k.eraldisteArv, "metsaeraldis", "metsaeraldist")}** ` +
    `kogupindalaga ${ha(k.kokkuPindala)}. Hinnanguline puidu tagavara on ` +
    `${m3(k.kokkuTagavara)}. Tegemist on ${k.onRiigimets ? "riigimetsaga" : "erametsaga"}.`;

  const liigid = k.puuliigid.length
    ? `Enamuspuuliigid pindala järgi: ` +
      list(
        k.puuliigid
          .slice(0, 5)
          .map((p) => `${p.nimi} ${pct(p.osakaalPct)} (${ha(p.pindala)})`),
      ) +
      "."
    : null;

  const vanus = k.vanuseVahemik
    ? `Puistute vanus jääb vahemikku ${k.vanuseVahemik.min}–${k.vanuseVahemik.max} aastat.`
    : null;

  // Raieküpsus registri arvutatud raievanuse põhjal
  const kypsed = k.eraldised.filter((e) => e.vanuseTingimusTaidetud === true);
  const noored = k.eraldised.filter((e) => e.vanuseTingimusTaidetud === false);
  const teadmata = k.eraldised.filter((e) => e.vanuseTingimusTaidetud === null);

  const kypsus =
    kypsed.length + noored.length > 0
      ? `**Raieküpsus vanuse järgi:** ${kypsed.length} ${plural(kypsed.length, "eraldis", "eraldist")} ` +
        `on jõudnud registri arvutatud raievanuseni, ${noored.length} ${plural(noored.length, "on veel noorem", "on veel nooremad")}` +
        (teadmata.length > 0 ? `, ${teadmata.length} puhul on vanus määramata` : "") +
        `. See on ainult vanusetingimus — lageraie võib olla lubatud ka ` +
        `nooremas puistus küpsusdiameetri või väikese täiuse alusel, ja ` +
        `keelatud looduskaitseliste piirangute tõttu.`
      : null;

  const naited = k.eraldised.slice(0, 6);
  const tabel = [
    "| Eraldis | Pindala | Enamuspuuliik | Vanus | Raievanus | Tagavara | Kasvukoht |",
    "|---|---|---|---|---|---|---|",
    ...naited.map(
      (e) =>
        `| ${e.eraldiseNr ?? "-"} | ${e.pindala !== null ? ha(e.pindala) : "-"} | ` +
        `${e.peapuuliik} | ${e.keskmineVanus ?? "-"} a | ${e.keskmineRaievanus ?? "-"} a | ` +
        `${e.tagavaraHa !== null ? num(e.tagavaraHa) + " m³/ha" : "-"} | ${e.kasvukoht} |`,
    ),
    k.eraldisteArv > naited.length
      ? `\nNäitan ${naited.length} eraldist ${k.eraldisteArv}-st.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return kokku([sisu, liigid, vanus, kypsus, tabel], [k.allikas], [k.hoiatus]);
}

// ---------------------------------------------------------------------------
// 10. Kaitsealad
// ---------------------------------------------------------------------------

export function kaitsealadVastus(
  k: KaitseStaatus,
  asukohaKirjeldus: string,
): Vastus {
  if (k.onKaitseAll) {
    const sisu =
      `Jah — ${asukohaKirjeldus} jääb ${k.katavad.length} kaitstava ` +
      `loodusobjekti alale:`;
    const read = k.katavad
      .map(
        (o) =>
          `- **${o.nimi}** (${o.kategooria})` +
          (o.naturaKood ? `, Natura 2000 kood ${o.naturaKood}` : "") +
          (o.krKood ? `, EELIS ${o.krKood}` : ""),
      )
      .join("\n");
    const selgitus =
      `Kaitsealal olemine ei tähenda automaatselt, et raie on keelatud — ` +
      `see sõltub vööndist. Loodusreservaadis on majandustegevus keelatud, ` +
      `sihtkaitsevööndis rangelt piiratud, piiranguvööndis leebemalt. ` +
      `Täpsed tingimused saad Keskkonnaametist või metsaportaalist.`;
    return kokku([sisu, read, selgitus], [k.allikas], [k.hoiatus]);
  }

  const sisu = `${asukohaKirjeldus} ei jää minu päringu järgi ühelegi kaitstavale loodusobjektile.`;

  const lahedal = k.lahedal.length
    ? `Lähikonnas (kuni ${num(k.otsinguRadiusM / 1000, 1)} km) on siiski:\n` +
      k.lahedal
        .slice(0, 6)
        .map((o) => `- ${o.nimi} (${o.kategooria})`)
        .join("\n")
    : `Ka ${num(k.otsinguRadiusM / 1000, 1)} km raadiuses ei ole kaitstavaid objekte.`;

  const kaviat =
    `Lisaks kaitsealadele võivad metsa majandamist piirata vääriselupaigad, ` +
    `kaitsealuste liikide elupaigad ja püsielupaigad, mille täpsed piirid ` +
    `ei ole avalikud. Neid näed metsaportaalis oma kinnistu omanikuna sisse logides.`;

  return kokku([sisu, lahedal, kaviat], [k.allikas], [k.hoiatus]);
}

// ---------------------------------------------------------------------------
// 11. Reeglid (teadmusbaasist)
// ---------------------------------------------------------------------------

export function reeglidVastus(loigud: Loik[]): Vastus {
  if (loigud.length === 0) {
    return kokku(
      [
        `Ma ei leidnud selle kohta oma teadmusbaasist vastust.`,
        `Metsanduse reeglite kohta leiad usaldusväärse info:\n` +
          `- **keskkonnaamet.ee** — metsateatis, metsauuendus, pesitsusrahu\n` +
          `- **register.metsad.ee** — oma kinnistu andmed ja piirangud\n` +
          `- **riigiteataja.ee** — metsaseadus ja metsa majandamise eeskiri`,
      ],
      [],
    );
  }

  const osad = loigud.map((l) => `### ${l.pealkiri}\n\n${l.sisu}`);
  return kokku(
    osad,
    ["Metsaseadus ja metsa majandamise eeskiri (vt lõikude sisesed viited)"],
    [
      "See on üldine selgitus, mitte juriidiline nõu. Konkreetse kinnistu " +
        "kohta käivad reeglid kinnita Keskkonnaametist.",
    ],
  );
}

// ---------------------------------------------------------------------------
// Tundmatu
// ---------------------------------------------------------------------------

export function tundmatuVastus(kysimus: string): Vastus {
  return kokku(
    [
      `Ma ei saanud aru, mida sa täpsemalt teada tahad.`,
      `Oskan vastata näiteks järgmistele küsimustele:\n` +
        `- Kas metsa raiutakse rohkem kui juurde kasvab?\n` +
        `- Kui suur osa Eestist on metsa all?\n` +
        `- Kui palju raiuti Võrumaal?\n` +
        `- Kas kinnistul 46801:003:0053 on raieluba?\n` +
        `- Mis metsa kasvab katastriüksusel 46801:003:0053?\n` +
        `- Kas see kinnistu jääb kaitsealale?\n` +
        `- Mis vanuses tohib männikut lageraiuda?\n` +
        `- Kas kevadel tohib metsa raiuda?`,
      kysimus.length > 0
        ? `Kui küsisid konkreetse metsa kohta, lisa palun katastritunnus ` +
          `(kujul 12345:001:0001) või aadress.`
        : null,
    ],
    [],
  );
}
