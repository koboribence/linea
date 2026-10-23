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
| [poster/PhotoPlacement.ts](../src/domain/poster/PhotoPlacement.ts) | Háttérkép-beállítások (overlay, nagyítás, helyzet), méretezés és szabad mozgatás. |
| [poster/PosterFont.ts](../src/domain/poster/PosterFont.ts) | A választható betűtípus-készletek (cím, számok, címkék). |
| [ui/editor/FontPicker.tsx](../src/ui/editor/FontPicker.tsx), [styles/fonts.ts](../src/styles/fonts.ts) | Betűtípus-választó kártyák; a betűtípusok regisztrálása. |
| [ui/editor/PhotoLoader.ts](../src/ui/editor/PhotoLoader.ts), [PhotoPicker.tsx](../src/ui/editor/PhotoPicker.tsx) | Fotó betöltése és a „Háttérkép” szakasz vezérlői. |
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
| `fontId` | Betűtípus-készlet: `sport`, `script`, `scifi`, `editorial` vagy `halloween` (lásd lent) | `sport` |
| `customBackground`, `customAccent` | Saját szín, felülírja a témáét | – |
| `transparent` | Átlátszó háttér: matrica a saját fotóra | `false` |
| `title` | A cím; legfeljebb 50 látható karakter (`MAX_TITLE`), emojival is. `undefined` esetén automatikus | a fájlban szereplő név |
| `showDate` | Dátum a cím fölött, pontos idő nélkül (pl. „2013. augusztus 16.”). Ha a fájlban nincs dátum, csak kézi dátummal kapcsolható be | `true` |
| `manualDate` | Kézzel megadott dátum (ÉÉÉÉ-HH-NN), ha a fájlban nincs; nem kötelező, és nem kerül tárolásra | – |
| `showSport` | Sportág a cím fölött, a dátumtól függetlenül kapcsolható | `true` |
| `stats` | A képen szereplő adatok, sorrendben, legfeljebb 6 (`MAX_STATS`) | sportágfüggő (lásd lent) |
| `statsSport` | Melyik sportághoz készült az adatválasztás | a fájl sportága |
| `routeColoring` | `solid`, `speed`, `elevation` vagy `heartRate` | `speed` |
| `routeWidth` | Vonalvastagság px-ben, 1080 px széles képre | `10` |
| `privacyMeters` | Elrejtett táv az útvonal két végén: 0, 200, 500 vagy 1000 m | `200` |
| `showElevation` | Magasságprofil | `true` |
| `background` | `theme` (szín), `map` (3D térkép) vagy `photo` (fotó) | `theme` |
| `mapStyle` | A videó térképe: `neutral` (alap) vagy `tinted` (témaszínnel árnyalt), lásd [map-flyover.md](map-flyover.md). Megszűnt stílus (pl. `satellite`, `night`) mentve az alapértékre áll vissza. | `neutral` |
| `videoSeconds` | A videó hossza: 10, 20 vagy 30 mp | 20 |
| `photo` | Háttérkép beállításai: `overlay` (0–1), `zoom` (0,5–3), `offsetX`/`offsetY` (eltolás a középponttól). Csak betöltött képnél számít | overlay 55%, középen |

**Mi marad meg a következő fájlnál (`RememberedDesign`):** a [DesignStorage](../src/ui/editor/DesignStorage.ts) a `localStorage`-ba menti a teljes kinézetet (`PosterStyle`) és a kiválasztott adatokat. A cím és a háttérkép nem marad meg: a cím az új fájl nevéből jön, a kép pedig egy adott edzéshez tartozik. Az edzés adatai és a fotó soha nem kerülnek tárolásra.

**Adatok átvitele (`carryOverStats`):**
- az előző fájl adatai közül azok maradnak, amelyek az új edzésben is megvannak;
- futás és bringa között a tempó és a sebesség párban cserélődik;
- ami hiányzik, azt az alapértelmezett lista pótolja, ugyanannyi adatig.

Ismeretlen vagy régi azonosítók a tárolóból egyszerűen kimaradnak.

### Cím

- **Alapérték:** a fájlban szereplő név (FIT: `sport.name`, GPX: `trk > name`), 50 karakterre vágva. Ha nincs ilyen, az automatikus cím jelenik meg („Délutáni kerékpározás”), amely nyelvváltáskor követi a nyelvet.
- **Név nélküli fájl:** a legtöbb FIT fájlnak nincs neve; ilyenkor a cím mező az automatikus címmel indul (pl. „Reggeli kerékpározás”), és szerkeszthető.
- **Karakterkorlát:** a [Graphemes](../src/domain/format/Graphemes.ts) a látható karaktereket számolja (`Intl.Segmenter`). Így a 🏃‍♂️ egy karakter, és a vágás sem töri ketté. A beviteli mező mellett számláló látszik (pl. `12/50`).
- **Emojik a képen:** a cím betűtípus-listájában emoji betűtípusok is szerepelnek (Apple, Segoe UI, Noto Color Emoji), ezért a canvas színes emojit rajzol, nem üres négyzetet.

### Alapértelmezett adatok (`PosterDefaults.defaultStats`)

| Eset | Lista (amelyik elérhető, abból az első 4) |
|---|---|
| Futás | táv, átlagsebesség (perc/km), mozgásidő, emelkedés, átlagpulzus |
| Bringa | táv, átlagsebesség, mozgásidő, emelkedés |
| Egyéb | táv, mozgásidő, átlagsebesség, emelkedés |
| GPS nélkül (beltéri) | táv, mozgásidő, teljes idő, átlagwatt, átlagpulzus |

Ha 4-nél kevesebb jön össze, a teljes idő, az átlagwatt, az átlagpulzus és a kalória tölti fel a listát. A felhasználó ezután legfeljebb 6-ra bővítheti.

**Címkék:** a feliratok rövidek, hogy oszlopban is elférjenek: „Min. magasság”, „Max. magasság”, „Max. sebesség” stb.

**Sportváltáskor** az `adaptStats` párban cseréli a tempót és a sebességet (`avgPace` ↔ `avgSpeed`, `bestPace` ↔ `maxSpeed`), így a felhasználó választása megmarad.

**Színezés:** csak az a lehetőség jelenik meg, amelyhez van adat (`coloringOptions`). Ha a megjegyzett színezés nem érhető el, egyszínű lesz.

**Öröklés a következő fájlra:** az adatválasztás csak **azonos sportágú** fájlra öröklődik (`statsSport`). Egy bringás választás (pl. watt) futásnál értelmetlen, ezért más sportágnál az alapértelmezett lista jön. A sportág nélkül tárolt régi választás más sportágnak számít.

**Futás és sebesség:** a futók a tempót is sebességnek hívják, ezért futásnál a magyar felület „Átlagsebesség” és „Max. sebesség” néven mutatja, de perc:mp/km-ben (`avgPace`, `bestPace`). Km/h-s érték futásnál nincs; egy korábban mentett km/h-s választás tempóra cserélődik, és nem duplázódik.

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

## Betűtípusok

Egy készlet ([PosterFont.ts](../src/domain/poster/PosterFont.ts)) három szerepet határoz meg: **cím**, **számok** és **címkék**. A számok mindig egyenletes magasságú, jól olvasható számjegyeket kapnak, akkor is, ha a cím díszes.

| Készlet | Cím | Számok | Címkék | Megjegyzés |
|---|---|---|---|---|
| Sport | Barlow Condensed 800 dőlt | Barlow Condensed 700 | Inter 600 | Alapértelmezett, nagybetűs |
| Kézírás | Pacifico | Quicksand 700 | Quicksand 700 | Kisbetűs cím |
| Sci-fi | Oxanium 800 | Oxanium 700 | Oxanium 600 | Nagybetűs |
| Magazin | Playfair Display 900 dőlt | DM Serif Display | Inter 600 | A Playfair számjegyei „régies” stílusúak (fel-le ugrálnak), ezért a számok DM Serifet kapnak |
| Halloween 🎃 | Butcherman | Metal Mania | Inter 600 | Szezonális (`seasonal: true`). Nagy ékezetei miatt a cím több helyet kap felül |

**Kiválasztási szempontok:**
- **Licenc:** mindegyik OFL, és a [Fontsource](https://fontsource.org) csomagokból a saját oldalunkról töltődik (nem a Google-től).
- **Magyar ékezetek:** mindegyiknek van latin-ext változata, tehát az „ő” és „ű” is benne van. Ez szűrte ki például az Orbitront és a Creepstert: náluk az „ő” és „ű” más betűtípussal jelenne meg.
- **Betöltés:** a [styles/fonts.ts](../src/styles/fonts.ts) csak regisztrálja a betűtípusokat. A fájlok első használatkor töltődnek le (`PosterRenderer.loadFonts(font)`), így a nem használt készletek nem lassítanak.

**Cím-metrikák:** a betűtípusok eltérő arányúak, ezért készletenként külön beállítás tartozik hozzájuk:
- `uppercase`: nagybetűs-e a cím;
- `titleScale`: a széles betűk kisebb mérettől indulnak;
- `titleAscent`, `titleLineHeight`, `titleDescent`: az első sor alapvonala, a sortávolság és az alsó hely, a kézírás és a csöpögős betű lelógó részei miatt.


**Szezonális hely:** a `seasonal` jelölésű készlet cserélhető; most Halloween, később például karácsonyi lehet. A felületen 🎃 jelvényt kap.

## Témák és színek

Minden téma `ThemeColors` értékeket ad:

| Mező | Szerep |
|---|---|
| `background` | Kétszínű, átlós színátmenetes háttér. |
| `text` | Cím és értékek. |
| `muted` | Címkék, mértékegységek, elválasztó vonal. |
| `accent` | Útvonal, a színátmenet „gyors/magas” vége. |
| `accentText` | A dátumsor: a kiemelő szín, ha olvasható (4,5:1), különben a szövegszín felé tolva. |
| `accentSoft` | A színátmenet „lassú/alacsony” vége. |
| `glow` | Fényudvar az útvonal körül; csak sötét háttéren szép. |

**Saját színek:**
- **Saját háttér:** a szöveg a jobban kontrasztoló világos vagy sötét szín (középszürkén tiszta fehér vagy fekete), a `muted` ebből keverődik. A szövegszínek minden esetben megfelelnek a WCAG 2.2 AA-nak (lásd [map-flyover.md](map-flyover.md#olvashatóság-és-kontraszt-wcag-22-aa)).
- **Saját kiemelő szín:** az `accentSoft` a kiemelő szín és a háttér keveréke.

## Háttér és mód

A felület tetején „Kép | Videó” váltó van; videó csak GPS-útvonallal érhető el. Kép módban a „Háttér” szakaszban három lehetőség közül lehet választani:
- **Szín:** a téma színátmenete.
- **3D térkép:** vonalas utcás térkép domborzattal, rajta az útvonal; sötét háttérszínhez sötét, világoshoz világos. A részleteket lásd: [map-flyover.md](map-flyover.md).
- **Fotó:** a felhasználó saját képe, lásd lent.

## Kézi dátum

Ha a fájlban nincs időbélyeg (pl. egy tervezett útvonal GPX-ben), a dátum-kapcsoló alatt egy dátumválasztó jelenik meg. Kitöltése nem kötelező. Ha üres, a dátum-kapcsoló letiltott, és egy rövid magyarázat jelzi, miért. A megadott dátum dél 12 órával kerül a képre, hogy semmilyen időzóna ne tolja át a szomszédos napra.

## Háttérkép

1. **Betöltés:** a „Háttérkép” szakaszban választható fotó. A [PhotoLoader](../src/ui/editor/PhotoLoader.ts) `createImageBitmap`-pel dekódolja; a telefonos fotók EXIF-elforgatását is alkalmazza (`imageOrientation: 'from-image'`). A 2400 px-nél nagyobb oldalú képet lekicsinyíti, hogy az újrarajzolás gyors maradjon. Ha a böngésző nem tudja megnyitni (pl. HEIC egyes rendszereken), hibaüzenet jelenik meg.
2. **Méret:** a [PhotoPlacement.rect](../src/domain/poster/PhotoPlacement.ts) a képet először a teljes posztert kitöltő méretre számolja (mint a CSS `object-fit: cover`), majd a `zoom`-mal (0,5–3) méretezi. 1 alatt a kép kisebb a poszternél, így többet mutat a fotóból.
3. **Helyzet:** az `offsetX`/`offsetY` a kép középpontjának eltolása a poszter közepétől, poszterszélességben/-magasságban mérve (0 = középen). A kép **mindkét irányban szabadon** mozog. Egy irányban addig, amíg a túllógó része el nem fogy, de legalább a poszter felének megfelelő távolságig. Teljesen kihúzni a képből nem lehet.
4. **Rajzolás:** a téma háttere → a fotó → a téma háttere újra, `overlay` átlátszósággal (0 = csak a fotó, 1 = csak a téma színe). Ahová a fotó nem ér el (szélre húzásnál vagy kicsinyítésnél), ott a téma háttere látszik. A szövegek fotón finom árnyékot kapnak.
5. **Mozgatás a felületen:**
   - az előnézetet egérrel vagy ujjal húzva (`PhotoPlacement.pan`, a mozgás képernyőpixelből poszterpixelbe váltva);
   - fókuszált előnézeten a nyilakkal, 24 px-es lépésben.
   A „Középre” gomb visszaállítja a nagyítást és a helyzetet.
6. **Átlátszó mód:** képpel nem kombinálható; ilyenkor a kapcsolója eltűnik.

**A kép és az adatvédelem:** a dekódolt kép csak a memóriában van (`usePosterEditor`). Nem kerül a `localStorage`-ba, és a megosztólinkba sem. Cserekor vagy a szerkesztő bezárásakor a memória azonnal felszabadul (`ImageBitmap.close()`).

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

**Biztonsági margók:** az oldalsó margó 80u. Felül és alul formátumonként eltér:
- **Story:** 200u felül és 230u alul, mert az Instagram oda rajzolja a felhasználónevet és a folyamatjelzőt, illetve az üzenetmezőt;
- **Feed és Négyzet:** 100u felül és 72u alul.

Az adatok az alsó margó fölött érnek véget, vízszintesen középen. (A márka logója korábban a kép alján volt, kapcsolhatóan; kikerült, mert helyet vett el a magasságprofiltól, ami miatt az bekapcsolt logónál gyakran elmaradt.)

| Elem | Elrendezés |
|---|---|
| **Felső sor** | Dátum · sportág, külön-külön kapcsolhatóan, a készlet címkebetűjével, kiemelő színnel. Ha mindkettő ki van kapcsolva, a sor elmarad. |
| **Cím** | Barlow Condensed 800 dőlt, nagybetűs. Story-ban 136u-ról, máshol 112u-ról indul, és addig kicsinyedik (legfeljebb 60u-ig), amíg 2 sorba nem fér. Ha így sem fér, vagy egyetlen szó hosszabb a sornál, „…”-tal rövidül. |
| **Adatok** | Alul, elválasztó vonal fölött. Oszlopszám: legfeljebb 3 adatnál annyi, ahány adat; 4 adatnál Story-ban 2×2, máshol 4 egy sorban; 5–6 adatnál 3 oszlop, 2 sor. A címkék és az értékek zsugorodnak, amíg a legszélesebb is elfér az oszlopában, így vízszintesen soha nem lógnak egymásba. **Középre igazítás:** ha az utolsó sor nem teljes (pl. 5 adatnál 3 + 2), vagy csak 1 adat van, a hiányos sor középre kerül, és a cellákon belül is középre igazodik a szöveg. Teljes soroknál a cellákban balra igazít, de a blokk egésze középen van: minden oszlop olyan széles, mint a legszélesebb címkéje vagy száma (videón a végső értékekre mérve, hogy a pörgés ne mozdítsa), a maradék hely pedig egyenlően oszlik el bal oldalt, az oszlopok között és jobb oldalt. |
| **Hely az útvonalnak** | Ha az adatok miatt a középső rész a képmagasság 24%-a alá szorulna, az adatok 10%-os lépésekben kisebbek lesznek (legfeljebb a felükre), amíg az útvonalnak elég hely marad. |
| **Magasságprofil** | Az adatok fölött. Csak akkor kerül a képre, ha utána is marad legalább a képmagasság 22%-a az útvonalnak. Ezért négyzetes formátumban jellemzően elmarad. |
| **Útvonal** | A maradék középső dobozban, a vonalvastagság kétszeresével beljebb húzva. |
| **„Hős” elrendezés** | Ha nincs útvonal (GPS nélkül, vagy ha a privacy zone mindent elrejtett), az első kiválasztott adat kerül nagyban középre, kiemelő színnel; a többi alul marad. A nagy szám a középső rész szélességéhez és magasságához is igazodik, így nem ér bele a címbe. |

**Rajzolási részletek:**
- **Háttér:** átlós színátmenet. Sötét témánál halvány, kiemelő színű fény az útvonal mögött.
- **Útvonal, két menetben:** először a teljes vonal kiemelő színnel, fényudvarral; aztán szakaszonként a színátmenet `accentSoft` és `accent` között. A rajtot nyitott karika, a célt teli pont jelöli.
- **Átlátszó mód:**
  - nincs háttér;
  - a rajtkarika belseje valóban átlátszó (`destination-out`), így a fotó átlátszik rajta;
  - a szövegek finom árnyékot kapnak, hogy bármilyen fotón olvashatók maradjanak.
- **Betűtípusok:** a `PosterRenderer.loadFonts(font)` minden rajzolás előtt biztosítja, hogy a kiválasztott készlet be legyen töltve, az ékezetes karakterekkel együtt (`ÁÉŐŰ…`). Ha már betöltődött, azonnal visszatér. Enélkül a canvas helyettesítő betűtípussal rajzolna.

## Felület

- **Navigáció:**
  - **A két képernyő:** a feltöltőoldal és a szerkesztő. A szerkesztő tetején egy kicsi feltöltőmező marad, amellyel másik fájl húzható be vagy választható ki. Telefonon ebből csak a „Másik fájl” gomb látszik. Ha az új fájl hibás, a hibaüzenet ott jelenik meg, és a szerkesztő a helyén marad.
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
- **Új fájl:** az `EditorScreen` új `key`-t kap. A cím az új fájlból jön, a kinézet és a kiválasztott adatok pedig a megjegyzett tervből (lásd fent).
- **Beállítások szakaszai:** Formátum · Színek · Szöveg · Adatok a képen · Útvonal · Egyéb (sportág). Csak az a beállítás jelenik meg, amelyhez van adat (pl. magasságprofil, privacy zone GPS nélkül nincs).
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
| [themes.test.ts](../tests/themes.test.ts) | Színkód oda-vissza alakítása és hibás kódok elutasítása, emojis karakterszámolás, cím a fájlnévből, megszűnt betűtípus-készlet kezelése. |
| [photo.test.ts](../tests/photo.test.ts) | Háttérkép kitöltése, mozgatás mindkét irányban, a kép nem húzható ki teljesen, kicsinyítés; adatok átvitele a következő fájlra. |

**Ellenőrzés:** a rajzolást (canvas) a jsdom nem tudja futtatni, ezért valódi böngészőben ellenőriztük, mind a három formátummal, beltéri és átlátszó esetekkel.

## Ismert korlátok

- **Kötött elrendezés:** az elemek egyelőre nem húzhatók szabadon; az elrendezést a rajzoló számolja (ez a 4. szakasz része lehet).
- **Nincs térkép:** az útvonal térképalap nélkül jelenik meg (6. szakasz).
- **Háttérkép és új fájl:** a háttérkép nem marad meg új fájl betöltésekor; minden edzéshez újra kell választani.
- **Mértékegység:** csak metrikus.
- **Link fejlesztés közben:** a megosztólink az oldal saját címére mutat. Fejlesztés közben ez `localhost`, ami telefonról nem érhető el. Ilyenkor az `npm run dev:lan` paranccsal indítsd a szervert: a gép helyi hálózati címén, HTTPS-sel (saját aláírású tanúsítvánnyal, `@vitejs/plugin-basic-ssl`) érhető el. HTTPS nélkül a telefon nem engedné a videókódolást, a megosztást és a service workert; a tanúsítvány-figyelmeztetést egyszer el kell fogadni.
- **Mentett színek:** csak a szín-pár menthető; a teljes sablon (formátum, adatok, elrendezés) megosztása még nincs kész.
