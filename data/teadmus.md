# Metsanduse taustateadmised

Käsitsi kirjutatud faktibaas küsimustele, millele API-d otse ei vasta
(seadusest tulenevad reeglid, mõisted, menetluskord).

**Reeglid selle faili hooldamiseks**

1. Iga väide vajab allikaviidet. Ilma viiteta väidet siia ei kirjutata.
2. Kui väärtust ei õnnestunud kehtiva redaktsiooni vastu kontrollida, seda
   EI kirjutata siia. Selle asemel suunatakse kasutaja allikani või
   kasutatakse registrist päritud väärtust.
3. Arvulised näitajad, mis on olemas API-s, tulevad API-st. Siia lähevad
   ainult õigusnormid, mõisted ja menetlusinfo.

Viimati kontrollitud: 2026-08-06

---

## MÕISTE eraldis
<!-- märksõnad: eraldis, metsaeraldis, kvartal, inventeerimine, katastriüksus, üksus -->

Metsaeraldis on metsa inventeerimise väikseim üksus — ühetaoline metsaosa,
mida majandatakse ühtmoodi. Ühel katastriüksusel võib olla kümneid eraldisi.
Metsaregistris on igal eraldisel oma number, pindala, kasvukohatüüp,
puuliikide koosseis, vanus ja tagavara.

## MÕISTE tagavara ja juurdekasv
<!-- märksõnad: tagavara, varu, juurdekasv, tihumeeter, kuupmeeter, maht, netojuurdekasv, brutojuurdekasv -->

Tagavara (ka puistu varu) on puude tüvepuidu maht tihumeetrites, tavaliselt
esitatud m³/ha kohta. Juurdekasv on aastas juurde kasvav maht m³/ha kohta.
Brutojuurdekasv ei arvesta looduslikku suremust; netojuurdekasv arvestab.

## MÕISTE boniteet
<!-- märksõnad: boniteet, boniteediklass, viljakus, kasvukoht, kasvukohatüüp -->

Boniteediklass näitab kasvukoha viljakust, mõõdetuna puistu kõrgusest
teatud vanuses. Klassid on 1A (kõige viljakam), 1, 2, 3, 4, 5 ja 5A
(kõige viletsam). Viljakamal kasvukohal jõuab mets raieküpsuseks kiiremini.

## MÕISTE rinne
<!-- märksõnad: rinne, rinded, järelkasv, osakaal, koosseis, puuliigid, peapuuliik -->

Puistu jaguneb rinneteks: esimene rinne (peapuurinne), teine rinne,
järelkasv, üksikpuud, põõsarinne. Metsaregistris on iga puuliigi osakaal
antud PROTSENDINA OMA RINDE SEES — ühe rinde osakaalud liidetakse 100-ni.
Eri rinnete osakaale ei tohi omavahel võrrelda ega kokku liita.

---

## RAIELIIGID
<!-- märksõnad: raieliik, raieliigid, turberaie, lageraie, harvendusraie, sanitaarraie, valikraie, valgustusraie, trassiraie, raadamine, kujundusraie, aegjärkne, häilraie, veerraie, uuendusraie, hooldusraie, vahe, erinevus, mis on -->

Metsateatisel kasutatavad koodid.
Allikas: keskkonnaministri 11.08.2017 määrus nr 28 lisa "Metsateatise vorm";
KKM määrus nr 63 lisa 17 "Metsa majandamise võtete klassifikaatorid".

| Kood | Raieliik | Rühm |
|---|---|---|
| LR | lageraie | uuendusraie |
| AR | aegjärkne raie | uuendusraie (turberaie) |
| HL | häilraie | uuendusraie (turberaie) |
| VE | veerraie | uuendusraie (turberaie) |
| HR | harvendusraie | hooldusraie |
| SR | sanitaarraie | hooldusraie |
| VR | valikraie | hooldusraie |
| TR | trassiraie | muu |
| RD | raadamine | muu |
| KR | kujundusraie | muu |

Turberaie on aegjärkse raie, häilraie ja veerraie ühisnimetus. Turberaie
korral uuendatakse metsa järkude kaupa, mitte korraga.

Tähelepanu koodidega: **TR on trassiraie, mitte turberaie. VR on valikraie,
mitte valgustusraie.**

## RAIEVANUS — millal tohib lageraiet teha
<!-- märksõnad: raievanus, küpsusvanus, vanus, millal, tohib, lubatud, raieküps, küps, küpsusdiameeter, täius, rinnaspindala, mänd, kuusk, kask, haab, männik, kuusik, kaasik -->

Lageraie on lubatud, kui puistu vastab vähemalt ühele tingimusele
(metsaseadus § 29 lg 4):

1. koosseisuga kaalutud esimese rinde keskmine vanus on jõudnud
   koosseisuga kaalutud keskmise raievanuseni;
2. puistu on saavutanud kehtestatud keskmise rinnasdiameetri
   (küpsusdiameetri);
3. puistu rinnaspindala või täius on kehtestatust väiksem.

Seadusega piiritletud raievanuste vahemikud (metsaseadus § 29 lg 5):

| Puuliik | Raievanus |
|---|---|
| mänd ja kõvad lehtpuud (tamm, saar, jalakas, künnapuu, vaher) | 90–160 a |
| kuusk | 80–120 a |
| kask ja sanglepp | 60–80 a |
| haab | 30–50 a |

Täpsed raievanused puuliikide ja boniteediklasside kaupa kehtestab
minister metsa majandamise eeskirjaga.

**TÄHTIS — miks siin ei ole täpset tabelit.** Konkreetse eraldise raievanus
ei ole tabeli lame väärtus, vaid puistu koosseisuga KAALUTUD arv
(metsa majandamise eeskiri § 3 lg 1 ja 1¹). Seetõttu esineb metsaregistris
näiteks kuusel raievanuseid 60–92 ja männil 71–120 aastat, mitte ümmargusi
tabeliarve. Metsaregister arvutab selle igale eraldisele ise ja bot loeb
selle välja `keskm_raievanus`. Ära asenda seda käsitsi kirjutatud tabeliga.

Vanusetingimuse täitmine ei ole raieluba. Raie võib olla keelatud
looduskaitseliste piirangute tõttu ja igal juhul on vaja registreeritud
metsateatist.

## LAGERAIELANGI SUURUS
<!-- märksõnad: lank, raielank, langi suurus, pindala, hektar, kui suur, maksimaalne, lagerailank, lageraielank -->

Metsaseadus § 29 lg 11 piirab lageraielangi pindala:

- luitel, uuristus- või tuulekandeohtlikul alal ning infiltratsiooni ja
  survelise põhjaveega alal: kuni 2 ha;
- loo ja sambliku kasvukohatüüpides: lank kuni 30 m lai ja kuni 2 ha;
- muudes kasvukohatüüpides: kuni 3 ha; kuni 100 m laiuse langi korral
  okaspuu- ja kõvalehtpuupuistutes kuni 5 ha ning pehmelehtpuupuistutes
  kuni 7 ha.

Turberaielank ei tohi olla suurem kui 10 ha (metsaseadus § 30).

Keskkonnaamet võib metsakaitseekspertiisi alusel lubada suuremaid lanke,
kui mets on hukkunud või halvas tervislikus seisundis (§ 29 lg 12).

## SÄILIKPUUD JA SEEMNEPUUD
<!-- märksõnad: säilikpuu, säilikpuud, seemnepuu, seemnepuud, elustik, mitmekesisus, alles jätma -->

Lageraiel jäetakse alles (metsaseadus § 29 lg 1):

- seemnepuudeks 20–70 mändi, arukaske, saart, tamme, sangleppa, künnapuud
  või jalakat hektari kohta ning elujõuline järelkasv;
- säilikpuud elustiku mitmekesisuse tagamiseks tüvepuidu kogumahuga
  vähemalt 5 m³/ha, üle 5 ha suurusel raielangil vähemalt 10 m³/ha.

## METSA UUENDAMISE KOHUSTUS
<!-- märksõnad: uuendamine, uuendus, uuenemine, istutamine, istutus, külv, raiesmik, kohustus, tähtaeg, taimed, metsakultuur, uuenenud -->

Allikas: metsaseadus § 24–25; Keskkonnaameti metsauuenduse juhis.

- Uuendamise võtteid tuleb rakendada vähemalt 0,5 ha suurustel raiesmikel
  või hukkunud metsaosadel **kahe aasta jooksul** raiest või hukkumisest
  (§ 25 lg 1).
- Mets peab olema **uuenenud hiljemalt viie aasta** jooksul pärast raiet.
  Loo, siirdesoo, madalsoo, raba, osja, tarna ja lodu kasvukohatüüpides on
  tähtaeg **kümme aastat** (§ 24 lg 3).
- Uuendamise võtted on maapinna ettevalmistamine, puuseemnete külv,
  puude istutamine, metsakultuuri hooldamine ja loodusliku uuenduse
  tekke soodustamine muul viisil (§ 24 lg 2).

Mets loetakse uuenenuks, kui hektaril kasvab ühtlaselt vähemalt:

- 1500 harilikku mändi kõrgusega ≥ 0,5 m, või
- 1000 harilikku kuuske kõrgusega ≥ 0,5 m, või
- 1500 harilikku tamme kõrgusega ≥ 0,5 m, või
- 1500 muud arvessevõetavat puuliiki kõrgusega ≥ 1,0 m.

Mitme puuliigi korral liidetakse iga liigi suhe nõutavasse arvu; kui summa
on ≥ 1, loetakse ala uuenenuks.

**Oluline tõlgendushoiatus.** Statistikaameti tabel MM10 loendab ainult
AKTIIVSET uuendamist (istutus, külv, loodusliku uuenemise kaasaaitamine).
Suur osa raiesmikke uueneb looduslikult ja neid MM10 ei loenda. Seetõttu ei
tohi MM10 arvu jagada lageraie pindalaga ega järeldada, et ülejäänud
raiesmikud jäävad uuenemata.

## PESITSUSRAHU
<!-- märksõnad: pesitsusrahu, pesitsemine, linnud, linnupesa, kevad, kevadel, suvi, aprill, mai, juuni, juuli, raierahu, häirimine, keeld, hooaeg, aastaaeg, millal ei tohi -->

Allikas: Keskkonnaameti pesitsusrahu leht; looduskaitseseadus § 55 lg 6¹
p 1–2; Keskkonnaameti juhend "Pesitsusrahust kinnipidamise kontrollimine"
(13.05.2025); Riigikohtu otsus 19.01.2026 asjas nr 3-21-1266.

- Looduskaitseseadus keelab lindude pesade ja munade tahtliku hävitamise
  ning lindude tahtliku häirimise, eriti pesitsemise ja poegade
  üleskasvatamise ajal.
- Keskkonnaamet loeb pesitsuse **kõrgperioodiks 15. aprill – 15. juuli**.
  Selles vahemikus pesitseb ligi 90% metsalindudest.
- Riigikohus kinnitas, et raiet pesitsuse kõrgperioodil linnurohkes metsas
  loetakse tahtlikuks pesade hävitamiseks ka ilma pesi kohapeal tuvastamata.
  Keskkonnaametil on õigus sellised raied peatada.
- Kavandatud järelevalve toimub 15. aprillist 30. juunini.
- Puistute linnurikkust hindab Keskkonnaameti ja Keskkonnaagentuuri
  koostöös valminud maatriks puistu vanuse ja kasvukohatüübi järgi.
  Metsaregistris on see kiht `pesitsusrahu_maatriks`.
- Kõrgperioodil on siiski lubatud muu hulgas: metsakaitseekspertiisi alusel
  aktiivse üraskikolde likvideerimine, valgustusraie, väikesemahuline raie
  (kuni 20 tm aastas kinnistul), olemasoleva trassi või sihi puhastamine.

**Sõnastushoiatus:** Eestis EI OLE üldist kalendripõhist raiekeeldu.
Pesitsusrahu tuleneb häirimise keelust, mitte tähtajalisest raiekeelust.
Ära ütle "raie on 15. aprillist 15. juulini keelatud" — õige on, et sel ajal
loetakse raiet linnurohkes metsas seaduserikkumiseks ja see võidakse peatada.

## METSATEATIS
<!-- märksõnad: metsateatis, teatis, luba, raieluba, kehtivus, riigilõiv, menetlus, keskkonnaamet, esitamine, otsus, tööpäeva, register -->

Allikas: metsaseadus § 41; keskkonnaministri määrus nr 28;
Keskkonnaameti metsateatise leht ja riigilõivu leht.

- Metsateatis on dokument, mille metsaomanik esitab Keskkonnaametile
  kavandatavate raietööde või oluliste metsakahjustuste kohta.
- Keskkonnaamet kontrollib teatist **15 tööpäeva** jooksul. Kui otsus nõuab
  kooskõlastamist või metsakaitseekspertiisi, kuni **30 tööpäeva**.
- Registreeritud teatis kehtib **2 aastat** (24 kuud).
- Raietöödega võib alustada **10 päeva möödumisel** raiet lubava otsuse
  registreerimisest; registreerimise päeva ei arvestata.
- Riigilõiv **30 eurot** uuendusraie (lageraie, aegjärkne, häilraie,
  veerraie) ja raadamise teatiselt, alates 01.07.2024. Harvendusraie,
  sanitaarraie, valikraie, trassiraie ja kujundusraie teatiselt lõivu ei ole.
- Iga kavandatud raie saab eraldi teatise numbri ja eraldi otsuse.
- Samale alale esitatud uus teatis muudab varasema kehtetuks.
- Teatist saab esitada metsaportaalis register.metsad.ee, digiallkirjastatud
  e-kirjaga aadressil info@keskkonnaamet.ee, paberil või postiga.

**Andmehoiatus:** metsaregistri avalik `teatis` kiht sisaldab ainult lubava
otsuse saanud teatisi (otsus = JAH). Keeldumisi seal ei ole, seega nende
andmete põhjal ei saa öelda, kui palju teatisi tagasi lükati. Registreeritud
teatis on RAIELUBA, mitte tehtud raie — osa lubasid jääb kasutamata ja
tegelike raietööde kohta metsaregistris andmeid ei ole.

## METSAKAITSEEKSPERTIIS (MKE)
<!-- märksõnad: metsakaitseekspertiis, mke, ekspertiis, üraskikahjustus, tormimurd, haigus, loodusõnnetus, halb seisund, erakorraline -->

MKE on Keskkonnaameti dokument, mis võimaldab raiet puistu halva tervisliku
seisundi tõttu — üraskikahjustus, tormimurd, haigused, loodusõnnetus
(metsaseadus § 29 lg 12). MKE alusel võib raiuda raievanusest nooremat
puistut ja teha tavapärasest suuremaid lanke. Raiet võib teha 12 kuu jooksul
akti registreerimisest; metsaregistris on väli `kehtiv_kuni`.

## KAITSEALAD JA PIIRANGUD
<!-- märksõnad: kaitseala, kaitsealad, kaitse all, natura, loodusala, linnuala, hoiuala, sihtkaitsevöönd, piiranguvöönd, reservaat, rahvuspark, looduskaitse, piirang, eelis -->

Kaitstavad loodusobjektid on EELISes (Eesti Looduse Infosüsteem):
kaitsealad (looduskaitsealad, maastikukaitsealad, rahvuspargid),
hoiualad, Natura 2000 loodusalad ja linnualad, kaitsevööndid,
kohaliku omavalitsuse kaitstavad objektid, reservaadid.

Kaitseala jaguneb tavaliselt vöönditeks: loodusreservaat (majandustegevus
keelatud), sihtkaitsevöönd (rangelt piiratud), piiranguvöönd (leebem).
Vööndi tüüp määrab, mida tohib teha — kaitsealal olemine üksi ei tähenda,
et raie on keelatud.

**Täpsushoiatus:** bot kontrollib kaitsestaatust punktipäringuga kinnistu
viitepunkti järgi. Kinnistu võib osaliselt kaitsealale ulatuda ka siis, kui
viitepunkt jääb välja. Kaitsealuste liikide elupaikade täpsed piirid ei ole
avalikud — neid näeb metsaportaalis oma kinnistu omanikuna sisse logides.

## KUUSE-KOOREÜRASK
<!-- märksõnad: ürask, kooreürask, kuuse-kooreürask, ips typographus, putukakahjustus, kahjur, kuusik, kahjustus, tõrje -->

Kuuse-kooreürask (Ips typographus) on kuusikute peamine putukakahjustaja.
Kahjustuskolded tekivad eelkõige tormimurru ja põua järel nõrgenenud
kuusikutes. Tõrjeks on vaja asustatud puud metsast kiiresti välja vedada.
Metsaregistris on eraldi kiht `kuusekooreyrask_mke` ja Statistikaameti
tabelis KK513 on hukkunud puistud põhjuse kaupa, sh putukakahjustused.
Pesitsusrahu perioodil on aktiivse üraskikolde likvideerimine
metsakaitseekspertiisi alusel lubatud.

---

## KUS BOT PEAB KASUTAJA EDASI SUUNAMA

- **register.metsad.ee** (metsaportaal) — oma kinnistu andmed, piirangud
  kaardil, metsateatise esitamine. Nõuab ID-kaardi, Mobiil-ID või Smart-ID
  sisselogimist.
- **keskkonnaportaal.ee** — avaandmed, metsainfo hetkeseis, andmekataloog.
- **keskkonnaamet.ee** — metsateatis, metsauuendus, pesitsusrahu, MKE.
- **info@keskkonnaamet.ee** — konkreetsed küsimused menetluse kohta.

Bot ei anna juriidilist ega majanduslikku nõu. Raieõiguse, piirangute ja
menetluse kohta käivad vastused tuleb alati Keskkonnaametist kinnitada.
