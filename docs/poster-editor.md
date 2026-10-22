# Képszerkesztő

Egy betöltött `Activity`-ből (lásd [file-loading.md](file-loading.md)) megosztható kép (poszter) lesz. A felhasználó egy képernyőn látja az élő előnézetet és a beállításokat. Minden a böngészőben, sima Canvas 2D-vel rajzolódik; külső rajzolókönyvtár nincs.

## Folyamat

```
Activity ──► usePosterEditor ──► PosterDesign (amit a felhasználó állít)
                │                       │
                ├─ StatsCalculator      │
                ├─ RouteShape ◄─────────┤ privacy zone, színezés
                ├─ ElevationProfile     │
                ▼                       ▼
           PosterSceneBuilder.build() ──► PosterScene ──► PosterRenderer.render(canvas)
                                                                   │
                                                     PosterExporter (PNG / megosztás)
```

Három réteg, mindegyik egy dologért felel:

1. **`PosterDesign`:** egyszerű adat arról, mit választott a felhasználó. Tárolható és megosztható.
2. **`PosterScene`:** minden, ami a képre kerül, már lefordítva és formázva: szövegek, színek, útvonal.
3. **`PosterRenderer`:** csak rajzol. Nem tud nyelvről, mértékegységről vagy az edzés adatairól.

## Fájlok

| Fájl | Felelősség |
|---|---|
| [poster/PosterDesign.ts](../src/domain/poster/PosterDesign.ts) | A terv adatszerkezete, plusz `PosterDefaults`: alapértékek, sportágfüggő adatválasztás. |
| [poster/PosterFormat.ts](../src/domain/poster/PosterFormat.ts) | Kimeneti méretek: Story 1080×1920, Feed 1080×1350, Négyzet 1080×1080. |
| [poster/PosterTheme.ts](../src/domain/poster/PosterTheme.ts) | 6 színtéma, és a saját háttér/kiemelő szín alkalmazása. |
| [poster/Color.ts](../src/domain/poster/Color.ts) | Színkezelés: keverés, fényerő, `rgba`. |
| [poster/PosterScene.ts](../src/domain/poster/PosterScene.ts) | `PosterSceneBuilder`: terv + edzés → jelenet; automatikus cím. |
| [poster/PosterRenderer.ts](../src/domain/poster/PosterRenderer.ts) | Elrendezés és rajzolás a canvasra. |
| [route/RouteShape.ts](../src/domain/route/RouteShape.ts) | Az útvonal rajzolható formában: levágva, vetítve, egyszerűsítve, színezési értékekkel. |
| [route/PrivacyZone.ts](../src/domain/route/PrivacyZone.ts) | Az útvonal elejének és végének elrejtése. |
| [route/RouteSimplifier.ts](../src/domain/route/RouteSimplifier.ts) | Douglas–Peucker egyszerűsítés. |
| [route/ElevationProfile.ts](../src/domain/route/ElevationProfile.ts) | Egyenletes távolságonként mintavételezett magasság a profilhoz. |
| [ui/editor/usePosterEditor.ts](../src/ui/editor/usePosterEditor.ts) | A szerkesztő állapota, és mit kell mikor újraszámolni. |
| [ui/editor/EditorScreen.tsx](../src/ui/editor/EditorScreen.tsx), [EditorPanel.tsx](../src/ui/editor/EditorPanel.tsx), [ThemePicker.tsx](../src/ui/editor/ThemePicker.tsx), [StatPicker.tsx](../src/ui/editor/StatPicker.tsx) | A felület. |
| [ui/editor/PosterCanvas.tsx](../src/ui/editor/PosterCanvas.tsx) | Élő előnézet. |
| [ui/editor/PosterExporter.ts](../src/ui/editor/PosterExporter.ts) | Letöltés PNG-ként, megosztás a rendszer megosztás-menüjével. |
| [ui/editor/DesignStorage.ts](../src/ui/editor/DesignStorage.ts) | A stílus megjegyzése a következő fájlhoz. |
| [poster/ThemeCode.ts](../src/domain/poster/ThemeCode.ts) | Saját színpár ↔ rövid kód (`v1-0e0f12-d4ff3a`) linkhez és QR-kódhoz. |
| [format/Graphemes.ts](../src/domain/format/Graphemes.ts) | Szöveghossz látható karakterekben: egy emoji egy karakter, és soha nem vágódik ketté. |
| [ui/themes/](../src/ui/themes/) | Mentett színek (`ThemeLibrary`), megosztólink (`ThemeLink`), QR-kód (`QrCode`), küldés-ablak (`ShareThemeDialog`). |
| [ui/useBackNavigation.ts](../src/ui/useBackNavigation.ts) | A szerkesztő saját böngészőelőzmény-bejegyzést kap, így a vissza gomb működik. |
| [ui/controls/](../src/ui/controls/) | Általános vezérlők: `Segmented`, `Toggle`, `Section`. |

## PosterDesign

| Mező | Jelentés | Alapérték |
|---|---|---|
| `format` | `story`, `feed` vagy `square` | `story` |
| `themeId` | `volt`, `chalk`, `ocean`, `dusk`, `forest` vagy `graphite` | `volt` |
| `customBackground`, `customAccent` | Saját szín, felülírja a témáét | – |
| `transparent` | Átlátszó háttér: matrica a saját fotóra | `false` |
| `title` | A cím; legfeljebb 50 látható karakter (`MAX_TITLE`), emojival is. `undefined` esetén automatikus | a fájlban szereplő név |
| `showDate` | Dátum és sportág a cím fölött | `true` |
| `stats` | A képen szereplő adatok, sorrendben, legfeljebb 6 (`MAX_STATS`) | 4 db, sportágfüggő |
| `routeColoring` | `solid`, `speed`, `elevation` vagy `heartRate` | `speed` |
| `routeWidth` | Vonalvastagság px-ben, 1080 px széles képre | `10` |
| `privacyMeters` | Elrejtett táv az útvonal két végén: 0, 200, 500 vagy 1000 m | `200` |
| `showElevation` | Magasságprofil | `true` |
| `showLogo` | Logó a kép alján | `true` |

**`PosterStyle`:** a terv a `title` és a `stats` nélkül. A [DesignStorage](../src/ui/editor/DesignStorage.ts) ezt menti a `localStorage`-ba, így a következő fájl ugyanazzal a kinézettel nyílik meg. Az edzés adata soha nem kerül tárolásra.

### Cím

- **Alapérték:** a fájlban szereplő név (FIT: `sport.name`, GPX: `trk > name`), 50 karakterre vágva. Ha nincs ilyen, az automatikus cím jelenik meg („Délutáni kerékpározás”), amely nyelvváltáskor követi a nyelvet.
- **Karakterkorlát:** a [Graphemes](../src/domain/format/Graphemes.ts) a látható karaktereket számolja (`Intl.Segmenter`). Így a 🏃‍♂️ egy karakter, és a vágás sem töri ketté. A beviteli mező mellett számláló látszik (pl. `12/50`).
- **Emojik a képen:** a cím betűtípus-listájában emoji betűtípusok is szerepelnek (Apple, Segoe UI, Noto Color Emoji), ezért a canvas színes emojit rajzol, nem üres négyzetet.

### Alapértelmezett adatok (`PosterDefaults.defaultStats`)

| Eset | Lista (amelyik elérhető, abból az első 4) |
|---|---|
| Futás | táv, átlagtempó, mozgásidő, emelkedés |
| Bringa | táv, átlagsebesség, mozgásidő, emelkedés |
| Egyéb | táv, mozgásidő, átlagsebesség, emelkedés |
| GPS nélkül (beltéri) | táv, mozgásidő, teljes idő, átlagwatt, átlagpulzus |

Ha 4-nél kevesebb jön össze, a teljes idő, az átlagwatt, az átlagpulzus és a kalória tölti fel a listát. A felhasználó ezután legfeljebb 6-ra bővítheti.

**Címkék:** a feliratok rövidek, hogy oszlopban is elférjenek: „Min. magasság”, „Max. magasság”, „Max. sebesség” stb.

**Sportváltáskor** az `adaptStats` párban cseréli a tempót és a sebességet (`avgPace` ↔ `avgSpeed`, `bestPace` ↔ `maxSpeed`), így a felhasználó választása megmarad.

**Színezés:** csak az a lehetőség jelenik meg, amelyhez van adat (`coloringOptions`). Ha a megjegyzett színezés nem érhető el, egyszínű lesz.

## Sportág a szerkesztőben

A felismert sportág ([file-loading.md](file-loading.md#activityloader)) a szerkesztőben átállítható. Ilyenkor:

- az `activity.withMeta({ sport })` új példányt ad, és a statisztika újraszámolódik (a mozgásküszöb sportágfüggő);
- futásnál tempó és `spm` kadencia, egyébként sebesség és `rpm` jelenik meg;
- az útvonal sebesség-színezésének neve is vált: futásnál „Tempó”, egyébként „Sebesség”.

## Útvonal (RouteShape)

`RouteShape.fromActivity(activity, privacy, coloring)` lépései:

1. **GPS-pontok** kiválogatása, és kumulatív távolság haversine-nal.
2. **Privacy zone:** a `PrivacyZone.keepRange` az első és az utolsó *N* métert levágja. Ha semmi nem marad, az eredmény `undefined`, és a kép „hős” elrendezésre vált (lásd lent). A felület ilyenkor külön üzenetet mutat.
3. **Színezési érték pontonként:**
   - sebesség: ±5 pontos ablakon simítva;
   - magasság;
   - pulzus.
   A hiányzó értéket az előző tölti ki.
4. **Web Mercator vetítés**, észak felül. Ugyanez a vetítés kell majd a térképes nézethez (6. szakasz).
5. **Douglas–Peucker egyszerűsítés:** a tűrés az útvonal méretének 0,1%-a. Egy 4700 pontos bringázásból néhány száz pont marad, ugyanazzal a formával.
6. **Normalizálás:** a színezési értékek 0–1 közé kerülnek az 5. és 95. percentilis között, hogy egy-egy kiugró érték ne nyomja el a színeket.

**`fitTo(box)`:** arányosan és középre igazítva méretezi az útvonalat a megadott dobozba.

A számok kiterjedését (`bounds`) ciklussal számoljuk, nem `Math.min(...tömb)`-bel. Utóbbi nagyon hosszú tömböknél túllépi a böngésző argumentumlimitjét.

## Magasságprofil

Az `ElevationProfile.fromActivity` alapból 160 mintát vesz egyenletes távolságonként. Ha nincs magasságadat, vagy a pálya 10 m-nél laposabb, `undefined`, és a profil kapcsolója el sem jelenik.

## Témák és színek

Minden téma `ThemeColors` értékeket ad:

| Mező | Szerep |
|---|---|
| `background` | Kétszínű, átlós színátmenetes háttér. |
| `text` | Cím és értékek. |
| `muted` | Címkék, mértékegységek, elválasztó vonal. |
| `accent` | Útvonal, dátumsor, a színátmenet „gyors/magas” vége. |
| `accentSoft` | A színátmenet „lassú/alacsony” vége. |
| `glow` | Fényudvar az útvonal körül; csak sötét háttéren szép. |

**Saját színek:**
- **Saját háttér:** a szöveg színe a háttér fényerejétől függően automatikusan sötét vagy világos lesz, a `muted` pedig ebből keverődik.
- **Saját kiemelő szín:** az `accentSoft` a kiemelő szín és a háttér keveréke.

## Saját színek mentése és küldése telefonra

1. **Mentés:** ha a felhasználó saját háttér- vagy kiemelő színt állít be, megjelenik a „Színek mentése” gomb. A [ThemeLibrary](../src/ui/themes/ThemeLibrary.ts) a `localStorage`-ban tárolja a párt (legfeljebb 6 db, a legújabb elöl), és „Saját” mintaként a témák mellé kerül.
2. **Küldés:** ha a jelenlegi színek egy mentett párral egyeznek, megjelenik a „Küldés telefonra” gomb és a „Törlés” link. Az ablakban:
   - QR-kód;
   - a link, kijelölhetően;
   - „Link másolása” gomb.
3. **Fogadás:** a link formája `https://…/#theme=v1-<háttér>-<kiemelés>`. Megnyitáskor az `App` a [ThemeLink.consume](../src/ui/themes/ThemeLink.ts) segítségével:
   - kiolvassa a kódot, és eltávolítja a címsorból (így frissítéskor nem ismétlődik);
   - elmenti a színeket a könyvtárba;
   - beállítja őket a következő fájl alapszíneinek;
   - értesítést mutat a feltöltőoldalon.

**Miért így?**
- **Adatvédelem:** a `#` utáni rész soha nem jut el a szerverhez, így a megosztás is szerver nélküli.
- **Biztonság:** a kódot a [ThemeCode](../src/domain/poster/ThemeCode.ts) szigorúan ellenőrzi (`v1` + két hatjegyű hex szín). Bármi más figyelmen kívül marad, így link útján nem lehet tetszőleges adatot bejuttatni.
- **Bővíthetőség:** a `v1` verzióelőtag miatt később a teljes sablon megosztása is jöhet, új verzióval, a régi linkek megtörése nélkül.
- **QR-kód:** az [`uqr`](https://github.com/unjs/uqr) könyvtár készíti (MIT licenc). Csak az ablak megnyitásakor töltődik be, és saját SVG-ként rajzoljuk ki, nyers HTML beszúrása nélkül.

## Elrendezés (PosterRenderer)

Minden méret 1080 px szélességre van megtervezve, és az `u = szélesség / 1080` egységgel skálázódik. A margó 80u.

A rajzoló két lépésben dolgozik: a `layout()` kiszámolja a dobozokat, a `draw()` rajzol.

| Elem | Elrendezés |
|---|---|
| **Felső sor** | Dátum · sportág, Inter 26u, kiemelő színnel. |
| **Cím** | Barlow Condensed 800 dőlt, nagybetűs. Story-ban 136u-ról, máshol 112u-ról indul, és addig kicsinyedik (legfeljebb 60u-ig), amíg 2 sorba nem fér. Ha így sem fér, vagy egyetlen szó hosszabb a sornál, „…”-tal rövidül. |
| **Adatok** | Alul, elválasztó vonal fölött. Oszlopszám: legfeljebb 3 adatnál annyi, ahány adat; 4 adatnál Story-ban 2×2, máshol 4 egy sorban; 5–6 adatnál 3 oszlop, 2 sor. A címkék és az értékek zsugorodnak, amíg a legszélesebb is elfér az oszlopában, így vízszintesen soha nem lógnak egymásba. |
| **Hely az útvonalnak** | Ha az adatok miatt a középső rész a képmagasság 24%-a alá szorulna, az adatok 10%-os lépésekben kisebbek lesznek (legfeljebb a felükre), amíg az útvonalnak elég hely marad. |
| **Logó** | Bal alul. A márka neve útvonalszerű aláhúzással, rajtkarikával és célponttal. |
| **Magasságprofil** | Az adatok fölött. Csak akkor kerül a képre, ha utána is marad legalább a képmagasság 26%-a az útvonalnak. Ezért négyzetes formátumban jellemzően elmarad. |
| **Útvonal** | A maradék középső dobozban, a vonalvastagság kétszeresével beljebb húzva. |
| **„Hős” elrendezés** | Ha nincs útvonal (GPS nélkül, vagy ha a privacy zone mindent elrejtett), az első kiválasztott adat kerül nagyban középre, kiemelő színnel; a többi alul marad. A nagy szám a középső rész szélességéhez és magasságához is igazodik, így nem ér bele a címbe. |

**Rajzolási részletek:**
- **Háttér:** átlós színátmenet. Sötét témánál halvány, kiemelő színű fény az útvonal mögött.
- **Útvonal, két menetben:** először a teljes vonal kiemelő színnel, fényudvarral; aztán szakaszonként a színátmenet `accentSoft` és `accent` között. A rajtot nyitott karika, a célt teli pont jelöli.
- **Átlátszó mód:**
  - nincs háttér;
  - a rajtkarika belseje valóban átlátszó (`destination-out`), így a fotó átlátszik rajta;
  - a szövegek finom árnyékot kapnak, hogy bármilyen fotón olvashatók maradjanak.
- **Betűtípusok:** a `PosterRenderer.loadFonts()` az első rajzolás előtt betölti őket, az ékezetes karakterekkel együtt (`ÁÉŐŰ…`). Enélkül a canvas helyettesítő betűtípussal rajzolna.

## Felület

- **Navigáció:**
  - **A két képernyő:** a feltöltőoldal és a szerkesztő; betöltés után a feltöltőmező eltűnik.
  - **Visszalépés:** a fejlécben „← Vissza” gomb visz vissza.
  - **Böngészőelőzmény:** belépéskor a szerkesztő egy előzmény-bejegyzést kap (`useBackNavigation`, History API, külön router-könyvtár nélkül), így a böngésző és a telefon vissza gombja is a feltöltőoldalra visz.
- **Elrendezés:**
  - **Asztali gépen:** két oszlop. Balra a ragadós (sticky) előnézet a letöltés és megosztás gombokkal, jobbra a beállítások.
  - **900 px alatt:** az előnézet felül marad (a képernyőmagasság 46%-áig), alatta görgethetők a beállítások. Így szerkesztés közben a kép mindig látszik.
- **Előnézet:** a canvas mindig a teljes kimeneti felbontású (pl. 1080×1920), és csak a CSS kicsinyíti le. Amit a felhasználó lát, pontosan az töltődik le.
- **Frissítés:** a gyors egymás utáni változások (gépelés, csúszka) képkockánként egy rajzolásba olvadnak össze (`requestAnimationFrame`). Egy újrarajzolás kb. 40 ms.
- **Újraszámolás (`usePosterEditor`, `useMemo`):**
  - statisztika: csak sportváltáskor;
  - útvonal-geometria: csak a privacy zone vagy a színezés változásakor;
  - minden más csak a jelenetet építi újra.
- **Új fájl:** az `EditorScreen` új `key`-t kap, így minden fájl a saját alapértékeivel nyílik meg, a megjegyzett stílussal.
- **Beállítások szakaszai:** Formátum · Színek · Szöveg · Adatok a képen · Útvonal · Egyéb (sportág, logó). Csak az a beállítás jelenik meg, amelyhez van adat (pl. magasságprofil, privacy zone GPS nélkül nincs).
- **Export:**
  - **Letöltés:** `canvas.toBlob('image/png')`, a fájl neve `linea-ÉÉÉÉ-HH-NN.png`. Kb. 80 ms.
  - **Megosztás:** a rendszer megosztás-menüje (`navigator.share` fájllal). Csak ott jelenik meg, ahol támogatott, főleg telefonon. Ha a felhasználó bezárja a menüt, az nem számít hibának.

## Új téma hozzáadása

1. Vedd fel az azonosítót a `ThemeId` típusba, a színeket pedig a `PosterTheme.PRESETS`-be ([PosterTheme.ts](../src/domain/poster/PosterTheme.ts)).
2. Adj nevet neki mindkét nyelven: `theme.<id>` kulcs a [hu.ts](../src/i18n/messages/hu.ts) és az [en.ts](../src/i18n/messages/en.ts) fájlban.

A felület a `PosterTheme.IDS` alapján magától megjeleníti.

## Új képelem hozzáadása

1. Ha a felhasználó kapcsolhatja, adj hozzá egy mezőt a `PosterDesign`-hoz és egy alapértéket a `PosterDefaults.STYLE`-hoz.
2. A szükséges, már formázott adatot tedd a `PosterScene`-be (a `PosterSceneBuilder.build` tölti ki).
3. A `PosterRenderer.layout()` foglaljon neki helyet, és írj egy `drawXxx()` metódust.
4. Kapcsolót az [EditorPanel.tsx](../src/ui/editor/EditorPanel.tsx)-ben adj hozzá; a szövegek az i18n fájlokba kerülnek.

## Tesztek

| Tesztfájl | Mit ellenőriz |
|---|---|
| [route.test.ts](../tests/route.test.ts) | Privacy zone, egyszerűsítés, vetítés (észak felül), doboz-illesztés, magasságprofil. |
| [poster.test.ts](../tests/poster.test.ts) | Alapértelmezett adatok, tempó ↔ sebesség csere, téma-kontraszt, automatikus cím, jelenetépítés. |
| [themes.test.ts](../tests/themes.test.ts) | Színkód oda-vissza alakítása és hibás kódok elutasítása, emojis karakterszámolás, cím a fájlnévből. |

**Ellenőrzés:** a rajzolást (canvas) a jsdom nem tudja futtatni, ezért valódi böngészőben ellenőriztük, mind a három formátummal, beltéri és átlátszó esetekkel.

## Ismert korlátok

- **Kötött elrendezés:** az elemek egyelőre nem húzhatók szabadon; az elrendezést a rajzoló számolja (ez a 4. szakasz része lehet).
- **Nincs térkép:** az útvonal térképalap nélkül jelenik meg (6. szakasz).
- **Saját fotó** háttérnek még nem tölthető fel; az átlátszó PNG-t lehet egy másik appban a fotóra tenni.
- **Mértékegység:** csak metrikus.
- **Link fejlesztés közben:** a megosztólink az oldal saját címére mutat. Fejlesztés közben ez `localhost`, ami telefonról nem érhető el. Ilyenkor a `npx vite --host` paranccsal a gép helyi hálózati címén indítsd a szervert, és onnan nyisd meg az oldalt.
- **Mentett színek:** csak a szín-pár menthető; a teljes sablon (formátum, adatok, elrendezés) megosztása még nincs kész.
