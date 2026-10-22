# Fájlbeolvasás és statisztika

Az 1. fázis eredménye: egy edzésfájlból (`.fit`, `.gpx`, `.tcx`, vagy ezek `.gz` változata) `Activity` objektum lesz, abból összesítő statisztika, abból pedig formázott, megjeleníthető adat. Minden a böngészőben fut, szerver nincs.

## Folyamat

```
File ─► ActivityLoader ─► (gunzip) ─► XxxParser.parse() ─► Activity
                                                              │
                         StatsCalculator.calculate() ◄────────┘
                                   │
                              ActivityStats ─► StatPresenter + UnitFormatter ─► UI
```

A React-réteg ([useActivityFile.ts](../src/ui/useActivityFile.ts)) csak meghívja a fenti láncot, és állapotot tart (`idle | loading | error | ready`). Ha közben új fájl érkezik, a régi eredményt eldobja.

## Fájlok

| Fájl | Felelősség |
|---|---|
| [activity/TrackPoint.ts](../src/domain/activity/TrackPoint.ts) | Egy mérési pont. Minden mezője opcionális. |
| [activity/Activity.ts](../src/domain/activity/Activity.ts) | Metaadat + pontok + készülék-összesítő. Megváltoztathatatlan. |
| [activity/SportType.ts](../src/domain/activity/SportType.ts) | `run`, `ride` vagy `other`, és a szöveg → sportág leképezés. |
| [parsing/ActivityLoader.ts](../src/domain/parsing/ActivityLoader.ts) | Belépési pont: kiterjesztés alapján parsert választ, kicsomagolja a `.gz`-t. |
| [parsing/ActivityParser.ts](../src/domain/parsing/ActivityParser.ts) | Absztrakt ősosztály, a közös utolsó lépéssel (`createActivity`). |
| [parsing/XmlActivityParser.ts](../src/domain/parsing/XmlActivityParser.ts) | XML-segédek a GPX és a TCX parsernek. |
| [parsing/FitParser.ts](../src/domain/parsing/FitParser.ts), [GpxParser.ts](../src/domain/parsing/GpxParser.ts), [TcxParser.ts](../src/domain/parsing/TcxParser.ts) | Formátumonkénti beolvasás. |
| [parsing/ParseError.ts](../src/domain/parsing/ParseError.ts) | Hiba kóddal: `unsupported`, `corrupt` vagy `empty`. |
| [stats/StatsCalculator.ts](../src/domain/stats/StatsCalculator.ts) | Összesítők számolása és összefésülése a készülék adataival. |
| [format/UnitFormatter.ts](../src/domain/format/UnitFormatter.ts) | SI érték → nyelvfüggő szöveg és mértékegység. |
| [format/StatPresenter.ts](../src/domain/format/StatPresenter.ts) | Eldönti, melyik statisztika jelenjen meg, milyen sorrendben és csoportban. |

## Adatmodell

**Mértékegységek mindenhol SI-ben:** méter, másodperc, m/s, bpm, W, °C, kcal. Az idő epoch milliszekundumban van (`TrackPoint.time`). Formázni csak a `UnitFormatter` formáz.

**`TrackPoint` mezői:** `time`, `lat`, `lon`, `ele`, `distance` (a készülék kumulatív távja), `speed`, `heartRate`, `cadence`, `power`, `temperature`.
- A hiányzó mező nincs jelen (`undefined`), nem `0`. A `createActivity` kitörli az `undefined` kulcsokat.

**`Activity`:**
- `meta`: `sport`, `sourceFormat`, `startTime?`, `name?`, `device?`.
- `points`: a mérési pontok.
- `deviceSummary`: a készülék saját összesítője.
- `has*` flagek, amelyeket a konstruktor egyszer kiszámol:

| Flag | Mikor igaz |
|---|---|
| `hasGps` | Legalább egy pontnak van `lat` és `lon` értéke. |
| `hasHeartRate`, `hasCadence`, `hasPower` | Legalább egy pozitív érték van. |
| `hasElevation` | Legalább egy `ele` érték van. |
| `hasTime` | A pontok **legalább 90%-ának** van ideje. Néhány szórványos időbélyeg nem elég időalapú statisztikához. |

## ActivityLoader

- **Bemenet:** `load(fileName, ArrayBuffer)`, vagy böngészőből `loadFile(File)`.
- **Kicsomagolás:** ha a név `.gz`-re végződik, a natív `DecompressionStream('gzip')` bontja ki, a kiterjesztés `.gz` nélkül számít.
- **Kis- és nagybetű:** a kiterjesztést nem érzékeny rájuk (`RIDE.FIT.GZ` is jó).
- **Lusta betöltés:** a parserek dinamikus `import()`-tal töltődnek be. Ennek a FIT SDK-nál van jelentősége (kb. 64 KB gzip), mert csak az első FIT fájlnál töltődik le. A parser példányt utána gyorsítótárazza.
- **`preload()`:** előre letölti az összes parser kódját. A `DropZone` hívja meg, amikor fájlt húznak fölé, vagy az egér fölé ér.
- **Hibakezelés:** ha a parser nem `ParseError`-t dob, azt `corrupt` kódú `ParseError`-rá alakítja.
- **Elfogadott fájlok:** `ActivityLoader.ACCEPT` = `.fit,.gpx,.tcx,.gz`. Ez a fájlválasztó `accept` attribútuma is.

## Parserek

Minden parser az `ActivityParser`-ből származik: van egy `format` mezője és egy `parse(data): Activity` metódusa. A végén mindegyik a közös `createActivity(meta, points, summary)` metódust hívja, amely:

1. kitörli az `undefined` mezőket, és eldobja az üres pontokat;
2. `ParseError('empty')`-t dob, ha nem maradt pont;
3. **futásnál megduplázza a kadenciát** a pontokon és az összesítőben is. A fájlok lábanként (stride/perc) tárolják, mi lépés/percben (spm) mutatjuk.

### FIT

- **Dekódolás:** a hivatalos `@garmin/fitsdk` alapbeállításokkal (dátumok `Date`-ként, skálázás alkalmazva, pulzus összefésülve).
- **Koordináták:** semicircle-ben vannak, átváltás: `× 180 / 2³¹`.
- **Nyers időbélyeg:** a FIT-epochtól (1989-12-31) számolt másodperc.
- **Magasság és sebesség:** `enhancedAltitude` / `enhancedSpeed`, ha van; különben a sima mező.
- **Kadencia:** `cadence + fractionalCadence`.
- **Megszakadt fájl:** ha a dekóder hibát jelez, de vannak pontok, a beolvasott részt megtartjuk. Ez lefagyott óránál fordul elő.
- **Nem FIT tartalom:** ha nincs FIT fejléc, `corrupt` hibát dob.
- **Összesítő:** a `session` üzenetből jön, de csak ha pontosan egy session van. Multisport fájlnál nincs összesítő, ott számolunk.
- **Nulla érték:** a `totalDistance: 0` és a `totalCalories: 0` „nincs mérve” jelentésű (görgő, futópad), ezért `undefined` lesz belőlük.
- **Sportág:** `session.sport`, ha nincs, `sport.sport`. A név a `sport.name`-ből, a készülék neve a `fileId`-ből (gyártó + termék) jön.

### GPX

- **Pontok:** `trkpt`. Ha nincs egy sem, akkor `rtept`, ami egy tervezett, idő nélküli útvonal.
- **Gyors beolvasás:** pontonként egyetlen bejárás az összes leszármazott elemen, `localName` alapján. Így a névtérelőtag nem számít.
  - Felismert elemek: `ele`, `time`, `hr`, `cad`, `power` (Strava), `atemp`/`temp`, `speed`.
- **Sportág:** a `<trk><type>` elemből: a `running`/`cycling` szöveg, vagy Strava régi számkódja (`9` = futás, `1` = bringa).
- **Név és készülék:** a név a `trk > name`, ennek hiányában a `metadata > name`. A készülék a gyökér `creator` attribútuma.
- **Összesítő:** nincs, minden statisztika számolt.

### TCX

- **Pontok:** `Trackpoint`, egyetlen bejárással. A `<Value>` csak `<HeartRateBpm>` alatt jelent pulzust. A `Cadence` és a `RunCadence` is kadencia, a `Watts` és a `Speed` az ActivityExtensionből jön.
- **Sportág:** az `Activity@Sport` attribútum. A kezdési idő az `Id`, a készülék a `Creator > Name`.
- **Összesítő a körökből (`Lap`):**
  - táv és kalória: összeg;
  - átlagpulzus: a körök idejével súlyozva;
  - max pulzus és max sebesség: maximum.

## StatsCalculator

`calculate(activity)` először mindent kiszámol a pontokból, utána **a készülék összesítője felülírja** az értékeket, de csak azokat a mezőket, amelyeket ténylegesen jelentett (`StatsCalculator.merge`).

| Statisztika | Szabály |
|---|---|
| Táv | Kumulatív. A pont saját `distance` értéke az elsődleges, ha nincs, a GPS-pontok közti haversine-távolság összege. |
| Teljes idő | Utolsó − első időbélyeg. |
| Mozgásidő | Azok a szakaszok, ahol a sebesség eléri a küszöböt. |
| Átlagsebesség / -tempó | Táv / mozgásidő, mint a Stravánál. **Mindig számolt**, a készülék értékét nem használjuk. |
| Max sebesség | Legalább 5 mp-es csúszóablakon mért átlag. Kimarad minden ablak, amelyben irreálisan gyors szakasz (GPS-ugrás) van. |
| Emelkedés / lejtés | Hiszterézis: csak 3 m-nél nagyobb változás számít. A végén az utolsó, küszöb alatti darabot hozzáadja, ha az a meglévő irányt folytatja. |
| Pulzus- és kadenciaátlag | Egyszerű átlag a pontokra, a **0 értékek nélkül**. |
| Wattátlag | A **0 W is számít** (gurulás), mint a Garminnál és a Stravánál. |
| Max értékek | A legnagyobb pozitív érték. |

**Időalapú statisztika** (idő, mozgásidő, sebesség) csak akkor készül, ha `activity.hasTime` igaz.

**Alapértékek** (`DEFAULT_STATS_OPTIONS`, a konstruktorban felülírhatók):

| Beállítás | run | ride | other |
|---|---|---|---|
| `movingThreshold` (m/s) | 0,5 | 1,0 | 0,5 |
| `plausibleSpeed` (m/s) | 12 (≈43 km/h) | 30 (≈108 km/h) | 30 |

Ezek mellett: `elevationHysteresis` = 3 m, `maxSpeedWindow` = 5 mp.

A készülék „timer time” értékét (`totalTimerTime`) nem használjuk mozgásidőnek, mert az a megállásokat is tartalmazza, ha nincs bekapcsolva az autopause.

## Megjelenítés

- **`UnitFormatter(locale)`:** `{ value, unit }` párokat ad vissza, hogy a szám és a mértékegység külön formázható legyen.
  - Táv: 100 km alatt 2 tizedes, fölötte 1.
  - Tempó: `m:ss /km`, 0,3 m/s alatt `–`.
  - Időtartam: `h:mm:ss` vagy `m:ss`.
  - Kadencia egysége: futásnál `spm`, egyébként `rpm`.
  - Egyelőre csak metrikus mértékegységek vannak.
- **`StatPresenter`:** a csoportok `overview`, `elevation` és `sensors`. Futásnál tempót mutat (`avgPace`, `bestPace`), egyébként sebességet. A hiányzó értékek és az üres csoportok kimaradnak.
- **Feliratok:** az i18n kulcsokból jönnek: `stat.<id>`, `group.<id>`, `sport.<sport>`, `error.<code>`. Ezek a [messages/hu.ts](../src/i18n/messages/hu.ts) fájlban vannak; az `en.ts`-nek a típusrendszer miatt ugyanazokat a kulcsokat kell tartalmaznia.

## Hibakódok

| Kód | Mikor |
|---|---|
| `unsupported` | Ismeretlen kiterjesztés. |
| `corrupt` | Hibás XML, hiányzó FIT fejléc, rossz gzip, vagy bármilyen váratlan parserhiba. |
| `empty` | A fájl olvasható, de nincs benne mérési pont. |

## Új formátum hozzáadása

1. Hozz létre egy `XxxParser extends ActivityParser` osztályt (XML formátumnál `XmlActivityParser`-ből), `format` mezővel és `parse()` metódussal. A végén a `createActivity`-t hívd.
2. Vedd fel a `SourceFormat` típusba ([Activity.ts](../src/domain/activity/Activity.ts)).
3. Regisztráld az `ActivityLoader.factories`-ban, és bővítsd az `ACCEPT` listát.
4. Tegyél egy mintafájlt a `tests/fixtures/` mappába (az eredetét és a licencét írd a [README](../tests/fixtures/README.md)-be), és írj tesztet a [parsing.test.ts](../tests/parsing.test.ts) fájlba.

## Tesztek

```
npm test
```

| Tesztfájl | Mit ellenőriz |
|---|---|
| [parsing.test.ts](../tests/parsing.test.ts) | Formátumonkénti beolvasás valódi mintafájlokon, gzip, hibakódok. |
| [stats.test.ts](../tests/stats.test.ts) | Számítási szabályok szintetikus adaton. |
| [format.test.ts](../tests/format.test.ts) | Formázás, megjelenítési logika, i18n. |

- **Futtatási környezet:** Vitest + jsdom, a böngészős `DOMParser` miatt.
- **A `strava-ride-power.gpx` minta:** a [scripts/make-strava-gpx.mjs](../scripts/make-strava-gpx.mjs) állította elő az Edge810 FIT fájlból. Így a GPX- és a FIT-eredmény egymással is összevethető (a táv kevesebb mint 0,5%-kal térhet el).
- **Sebesség:** böngészőben egy 4700 pontos fájl kb. 0,2 mp alatt töltődik be.

## Ismert korlátok

- **Időzóna:** a kezdési idő a böngésző időzónájában jelenik meg, nem az edzés helyén. A FIT `activity.localTimestamp` mezője megoldaná.
- **Fő szál:** a parsolás a fő szálon fut. Ha nagy fájloknál akadozik, Web Workerbe kell tenni; az `ActivityLoader` interfésze ettől nem változik.
- **Multisport FIT:** csak az első session sportágát vesszük figyelembe.
- **Átlagok:** a pulzus és a kadencia átlaga pontonkénti, nem időben súlyozott. Ez az okos rögzítésű (változó mintavételű) fájloknál számít, de FIT/TCX esetén a készülék saját értéke úgyis felülírja.
