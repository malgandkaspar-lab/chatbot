# Metsabot

Eestikeelne chatbot, mis vastab metsandusküsimustele **päris andmetega Eesti
riiklikest registritest**. Prototüüp.

```
npm install
cp .env.example .env
npm start          # http://localhost:3000
```

Töötab ka ilma keelemudelita. Ollama on valikuline lisand.

## Kuidas see töötab

Kolmeastmeline torustik, kus keelemudel ei puutu kunagi arve:

```
küsimus → regex-ruuter (0 ms) ─┬─ tabas → API-päring → ET-šabloon → vastus (~0,4 s)
                               └─ ei tabanud → qwen3:8b JSON-ruuter (~20 s)
                                                └─ tundmatu → LLM vabavastus
```

**Miks šabloonid ja mitte LLM?** Mõõtsin qwen3:8b-d sellel masinal (Ryzen 7
7735HS, Radeon 680M iGPU, mida Ollama ei kasuta):

| | |
|---|---|
| Genereerimise kiirus | 4,6 tok/s (CPU-l, `size_vram: 0`) |
| 100-sõnaline vastus | ~38 s |
| Ruuteri JSON-päring | ~20 s |

Ja eesti keel murdus. Päris testväljund FAKTID-plokiga:

> "Eestis raiutakse aastal 2023 metsa 10500 **tuhendatud** kuupmeetrit... Seega
> juurdekasv ületab **raiutamise**."

Numbrid õiged, sõnad olematud. Seetõttu renderdatakse 11 tuntud intenti
eestikeelsetest šabloonidest koodis — grammatika on korrektne, vastus tuleb
~0,4 sekundiga ja arvud on garanteeritult õiged. LLM on ainult varuvariant.

## Andmeallikad

| Allikas | Endpoint | Kasutus |
|---|---|---|
| Statistikaamet PxWeb | `andmed.stat.ee/api/v1/et/stat` | KK51 metsavaru+juurdekasv, MM03 raie (SMI), MM04 raie maakonniti, MM10 uuendamine, KK513/514 kahjustused |
| Metsaregister WFS | `gsavalik.envir.ee/geoserver/metsaregister/ows` | `teatis`, `eraldis`, `eraldis_element`, `mke`, klassifikaatorid |
| EELIS WFS | `gsavalik.envir.ee/geoserver/eelis/ows` | kaitsealad, hoiualad, Natura 2000, kaitsevööndid |
| Maa- ja Ruumiamet | `inaadress.maaamet.ee/inaadress/gazetteer` | aadress/katastritunnus → L-EST97 koordinaat |
| `data/teadmus.md` | — | käsitsi kirjutatud õigusnormid ja mõisted |

## Intendid

| Intent | Näidisküsimus |
|---|---|
| `raie_vs_juurdekasv` | Kas metsa raiutakse rohkem kui juurde kasvab? |
| `metsavaru_trend` | Kas Eesti metsavaru kahaneb? |
| `metsasus` | Kui suur osa Eestist on metsa all? |
| `raie_liigiti` | Kui palju on lageraiet võrreldes harvendusraiega? |
| `raie_maakonnas` | Kui palju raiuti Võrumaal? |
| `uuendamine` | Kui palju metsa istutatakse? |
| `kahjustused` | Kui hull on kooreüraskiolukord? |
| `teatised_asukohas` | Kas kinnistul 46801:003:0053 on raieluba? |
| `eraldise_info` | Mis metsa kasvab katastriüksusel 46801:003:0053? |
| `kaitsealad_asukohas` | Kas see kinnistu on kaitse all? |
| `reeglid` | Kas kevadel tohib metsa raiuda? |

## Vestluse mälu

Bot mäletab **viimast asukohta, maakonda ja intenti** — sellest piisab
jätkuküsimusteks:

```
> Kas kinnistul 46801:003:0053 on raieluba?     [teatised_asukohas]
> Kas see on kaitse all?                        [kaitsealad_asukohas] mälust
> Mis seal kasvab?                              [eraldise_info] mälust
> Kui palju raiuti Võrumaal?                    [raie_maakonnas]
> Aga Tartumaal?                                [raie_maakonnas] uus maakond
> Kui hull on kooreüraskiolukord?               [kahjustused]
> Aga Ida-Virumaal?                             [kahjustused] uus maakond
```

Kui vastus tugineb mälule, **öeldakse see kasutajale välja** ("Kasutan
eelmist asukohta: …"), et ei jääks muljet nagu bot teaks midagi, mida
kasutaja ei öelnud.

Vanu vastuseid ega arve mälus EI hoita — iga vastus arvutatakse värsketest
andmetest. Mälu kirjutatakse ainult õnnestunud lahenduse põhjal, seega
vigane sisend ei riku eelmist head asukohta.

Seansid on mälus (`src/router/kontekst.ts`), eluiga 15 min, max 500 seanssi.
UI hoiab seansi ID-d `sessionStorage`-is; "Uus vestlus" nullib mälu.

## Käsud

```bash
npm start                    # veebiserver
npm run dev                  # veebiserver, taaskäivitub muudatustel
npm run smoke                # kõik tööriistad otse, ILMA LLM-ita
npm run smoke -- raie        # ainult "raie" nimes sisaldavad testid
npm run typecheck

npx tsx scripts/kysi.ts "kas metsa raiutakse rohkem kui kasvab"
npx tsx scripts/kysi.ts      # interaktiivne terminalivestlus
npx tsx scripts/vestlus.ts   # 34 näidisküsimuse ruuteritest
npx tsx scripts/malu.ts      # jätkuküsimuste voog (mälu test)
npx tsx scripts/vestlus.ts --tais   # ka täisvastused
```

## LLM (valikuline)

```bash
# https://ollama.com/download
ollama pull qwen3:8b
```

Välja lülitamiseks `.env`-is `LLM_ENABLED=false`. Kõik 11 intenti töötavad
edasi; kaduma läheb ainult tundmatute sõnastuste käsitlemine.

## Andmete tõlgendamise lõksud

Need on koodi sisse kirjutatud, sest igaüks neist andis alguses vaikselt
vale vastuse.

**1. Eestis on kaks kokkusobimatut raiestatistikat.**

| 2023 | koguraie | lageraie pindala |
|---|---|---|
| SMI (MM03) | 11,7 mln m³ | 32,0 tuh ha |
| Raiedokumendid (MM04) | 12,5 mln m³ | 45,6 tuh ha |

Mahus 7%, pindalas 43% vahe. Juurdekasvuga tohib võrrelda ainult SMI arve.
Vt `ALLIKAS` konstanti failis `src/tools/statistika.ts`.

**2. Raie vs juurdekasv annab kaks vastassuunalist signaali.** Raie on 76%
brutojuurdekasvust (justkui jätkusuutlik), aga puistute üldvaru on 2015–2024
kahanenud 7,1%. Vahe läheb looduslikule suremusele ja SMI ±10% veapiirile.
Šabloon esitab **mõlemad** ja selgitab vastuolu.

**3. MM10 ei mõõda "kas raiesmikud uuendatakse".** See loendab ainult
aktiivset uuendamist. Naiivne jagamine lageraie pindalaga andis "18%
uuendatud", mis vihjaks et 82% raiesmikke jäetakse maha — enamik uueneb
looduslikult ja neid ei loendata.

**4. Raievanust ei tohi tabelina koodi kirjutada.** Konkreetse eraldise
raievanus on puistu koosseisuga kaalutud arv, mitte tabeli lame väärtus —
registris esineb kuusel 60–92 ja männil 71–120 aastat. Bot loeb
`keskm_raievanus` otse metsaregistrist.

**5. WFS-il on kaks vastupidist teljejärjestust.**

```
BBOX parameeter + "EPSG:3301"  →  minX,minY,maxX,maxY   (ida, põhi)
CQL geomeetria-literaal        →  POINT(y x)            (põhi, ida)
```

Vale järjestus ei anna viga, vaid **tühja tulemuse**. Kapseldatud
`src/lib/geo.ts` ja `src/tools/wfs.ts` sisse, kaetud regressioonitestiga
`npm run smoke -- cql`.

**6. GeoServer järjekorrastab samaaegseid ühendusi agressiivselt.**
14 päringut `Promise.all`-iga võttis **61 s**, järjestikku ~850 ms. Kõik
päringud lähevad läbi `src/lib/limiter.ts` (max 2 korraga) → 432 ms.

**7. Bbox-kattuvus ei ole kaitsealal olemine.** Kädso kinnistu bbox lõikub
3 km raadiuses kolme kaitsealaga, kuid ei jää ühelegi. Kasutame
`INTERSECTS`-i, mitte bboxi.

## Privaatsus

Metsateatise väli `otsuse_pohjendus` on vabatekst, mis sisaldab isikuandmeid
ja kaitsealuste liikide elupaikade kirjeldusi. See on `TEATIS_VALJAD`-ist
teadlikult välja jäetud ja ei jõua kunagi kasutajaliidesesse ega
keelemudelisse.

## Piirangud

- Metsaregistris on avalikud riigimetsa eraldised ja need erametsa
  eraldised, mille omanik on andmed avalikustanud. Tühi tulemus ei tähenda,
  et metsa ei ole.
- Avalik `teatis` kiht sisaldab ainult lubava otsuse saanud teatisi —
  keeldumiste arvu ei saa nende andmete põhjal öelda.
- Registreeritud teatis on raieluba, mitte tehtud raie.
- Bot ei anna juriidilist nõu.

## Struktuur

```
src/
  server.ts              Express + SSE
  pipeline.ts            ruuter → tööriist → šabloon
  router/intents.ts      intentide definitsioonid (ühine LLM-promptiga)
  router/regex.ts        deterministlik ruuter
  router/kontekst.ts     vestluse mälu (seansid)
  answer/templates.ts    eestikeelsed vastusešabloonid
  llm/{ollama,prompts,router}.ts
  tools/{statistika,pxweb,metsaregister,eelis,geocode,wfs,klassifikaatorid,teadmus}.ts
  lib/{http,cache,geo,format,jsonstat,limiter,env}.ts
data/teadmus.md          käsitsi kirjutatud faktibaas (allikaviidetega)
public/                  vanilla JS chat-UI
scripts/{smoke,kysi,vestlus}.ts
```
