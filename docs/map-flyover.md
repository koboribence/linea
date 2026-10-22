# 3D térkép és átrepülés-videó

A szerkesztőben két mód van:
- **Kép:** a háttér lehet szín, fotó, vagy **3D térkép**.
- **Videó:** „drónos” átrepülés az útvonal fölött, MP4-be exportálva.

Mindkettő a böngészőben fut, szerver nélkül. A térképhez a böngésző letölti a környék térképcsempéit; erről a felület egy rövid megjegyzésben tájékoztat.

## Eszközök

| Feladat | Eszköz | Licenc |
|---|---|---|
| 3D térkép | [MapLibre GL JS](https://maplibre.org) 6 | BSD-3 |
| Utcák, épületek | [OpenFreeMap](https://openfreemap.org) „dark” stílus (OpenStreetMap-adatokkal) | ODbL adat, kulcs nélkül |
| Domborzat | [Mapterhorn](https://mapterhorn.com) (terrarium kódolás, 512 px-es csempék) | nyílt adat, kulcs nélkül |
| Videókódolás | [Mediabunny](https://mediabunny.dev) + böngészős WebCodecs | MPL-2.0 |

Minden térképes kódrész csak akkor töltődik le, amikor szükség van rá. A térképkönyvtár kb. 250 KB, a videókódoló csak a „Videó készítése” gombra.

## Felépítés

```
domain/map/
  MapStyles     a térképstílusok (sötét / világos; képhez utcás, videóhoz alap / témaszín) + forrásmegjelölés
  MapFraming    hová kerül az útvonal a képen (sáv a cím és az adatok között)
  FlyoverPath   a kamera mozgása t ∈ [0, 1] szerint; tiszta matematika
  LiveStats     a videó felpörgő számlálói (0-tól a végső értékig)
ui/map/
  MapView       MapLibre-burkoló: kamera, vetítés, betöltésre várás
  StillMap      állókép a képhez; egy életben tartott, láthatatlan térkép + gyorsítótár
  FlyoverExporter  képkockánkénti renderelés és videókódolás
  toScreenRoute    kivetített pontok → rajzolható útvonal (darabokra bontva)
ui/video/
  useFlyover, VideoStudio   videós előnézet, lejátszás, idővonal, készítés
```

## Fő elv: a térkép csak háttér, az útvonalat mi rajzoljuk

A térkép **csak** a talajt adja: domborzat, ég, utcák, épületek. Az útvonal **nem** része a térképnek. Helyette:

1. A `MapView.project()` megmondja, hol vannak az útvonal pontjai a képen. A domborzat magasságát is figyelembe veszi.
2. A meglévő poszter-rajzoló (`PosterRenderer.drawRoutePoints`) ugyanazzal a fénylő, színátmenetes vonallal, rajtkarikával és célponttal rajzolja meg, mint a 2D képen.

**Miért így:**
- **Sebesség:** a szín, a vonalvastagság, a színezés, a betűtípus és a szöveg változása **nem** igényel új térképet. Az állóképnél csak a formátum, a térképstílus vagy az útvonal geometriája (privacy zone) indít újrarenderelést.
- **Élesség:** az útvonal mindig teljes felbontású vektoros rajz, bármilyen a térkép.
- **Egységesség:** a 2D és a 3D kép útvonala ugyanúgy néz ki.

A kamera mögötti pontokat a `MapView` egy olcsó síkbeli számítással szűri ki (`inFront`). Így nem kerülnek értelmetlen helyre, és nem is kell őket kivetíteni. Követő nézetben a kamera-távolság 1,6-szorosánál távolabbi pontok is kimaradnak: ott a térképet úgyis elnyeli a pára. A kiesett pontoknál a vonal darabokra bomlik (`newSegment`), az egyetlen pontból álló darabok pedig elmaradnak.

## Térképstílusok (`MapStyles`)

Minden stílus domborzati és vektoros adatból készül, ezért bármilyen közelről éles. (Az ingyenes műholdkép kb. 10 m-es felbontású és közelről elmosódott, ezért kikerült.)

**Sötét vagy világos (`MapStyles.tone`):** a térkép a poszter háttérszínét követi. Sötét háttérhez az OpenFreeMap „dark”, világoshoz a „positron” alapstílus tartozik. A határ ugyanaz, mint a témáknál (`Color.isDark`, relatív fénysűrűség < 0,4). Sötétről világosra váltáskor új térkép kell (más az alapstílus); minden más színváltás csak átfest.

| Stílus | Hol | Mit mutat |
|---|---|---|
| **Utcás** (`streets`) | Kép háttere (nem választható) | Az alapstílus vonalas utcái, vizek, lapos épületek, halvány domborzati árnyékolás |
| **Alap** (`neutral`, alapértelmezett) | Videó | Több irányból megvilágított domborzat, a tónushoz illő utcák (sötétben kékesszürke, világosban szürke), 3D épületek |
| **Témaszín** (`tinted`) | Videó | Ugyanez, de a kiemelő színből enyhén belekeverve (utak 50%, domborzati fény 30%, épületek 20%, ég 8–35%) |

**Az alapstílus átalakítása:**
- kikerülnek az utcanevek, egyirányú-nyilak, útszám-pajzsok, vízfeliratok, külvárosi, megyei és országcímkék (zsúfoltak, és külön betűtípus-letöltést igényelnek);
- a település- és városnevek 1,4-szer nagyobbak (zoomfüggő méretgörbénél minden pont mérete szorzódik), a színük a palettából jön;
- a domborzati árnyékolás a vonalak és feliratok alá kerül;
- **videóban** az utcák középvonala a paletta színét kapja, a lapos épületeket 3D-s (`fill-extrusion`) épületek váltják a valódi magasságukkal (`render_height`), 13-as szinttől.

**Színváltás újratöltés nélkül (`MapView.recolor`):** a paletta minden színe egy `[réteg, tulajdonság, szín]` listában van (`MapStyles.paints`); a futó térképen ezeket a `setPaintProperty` állítja át. Két buktató volt:
- a MapLibre alapból 300 ms alatt úsztatja a színeket. A 3D terepre feszített rétegek viszont csempénként gyorsítótárazódnak, és a tárba az átúsztatás első képkockája került, így a térkép egy színváltással „le volt maradva”. Ezért a stílusban nincs átmenet (`transition: 0`);
- ez a tár csak akkor frissül, ha a csempék vagy a rétegek listája változik, a színtől nem. Ezért minden átfestéskor egy üres, átlátszó jelzőréteg új nevet kap (`palette-N`), ez kényszeríti az újrarajzolást.

**Domborzat kiemelése (`MapStyles.exaggeration`):** az útvonal magasságkülönbségéből jön: síkvidéken erősebb (60 m alatt 3×), hegyekben gyengébb (1000 m fölött 1,3×), hogy a dombok látsszanak, de a hegyek ne legyenek tüskék. A `MapView` ezzel számolja a célpont talajmagasságát.

**Domborzat:** a domborzati adat legfeljebb 13-as szintig töltődik le (512 px-es csempe, ez kb. a 256 px-es 14-es szint részletessége). A 3D formához és az árnyékoláshoz külön forrás tartozik, mert a közös forrás árnyékolása gyengébb; a böngésző gyorsítótára miatt a csempék így is csak egyszer töltődnek le.

**Kipróbált, de elvetett:**
- szintvonalak (maplibre-contour): látványosak voltak, de utcák és épületek kellettek helyettük, és lapos terepen lassítottak;
- „hajnal” (a valódi napállással megvilágított terep) és „neon” (magasság szerint színezett terep): helyettük egy, a témaszínt enyhén átvevő változat készült.

## Olvashatóság és kontraszt (WCAG 2.2 AA)

A szabvány: kis szöveg legalább **4,5:1**, nagy szöveg (cím, nagy számok) és grafika (útvonal, magasságprofil) legalább **3:1** kontraszt a mögötte lévő színnel. A számítás a WCAG relatív fénysűrűségével történik (`Color.contrast`, [Readability.ts](../src/domain/poster/Readability.ts)).

1. **Téma színei** (`PosterTheme.resolve`): a szöveg, a `muted` (címkék, mértékegységek, forrásmegjelölés) és az `accentText` (a dátumsor) a háttér színátmenetének mindkét végén eléri a 4,5:1-et. Ha egy saját szín nem éri el, a szövegszín felé tolódik, éppen annyira, amennyi kell. Saját háttérnél a szöveg a jobban kontrasztoló világos vagy sötét szín; középszürkén csak a tiszta fehér vagy fekete éri el a 4,5:1-et, ilyenkor az lesz.
2. **Szöveg a térkép fölött** (`PosterRenderer.coverOpacity`): a fejléc és a lábléc mögötti, háttérszínű takarás legalább annyira átlátszatlan, hogy a térkép „legrosszabb” színe fölött is teljesüljenek az arányok. A legrosszabb szín (`MapStyles.contrast`) sötét térképen a paletta legvilágosabb, világoson a legsötétebb eleme (az ég és a településnevek is beleszámítanak). A takarás a szövegblokkokig tart: fent a cím aljáig, lent a magasságprofil vagy az elválasztó vonal tetejétől.
3. **Útvonal a térképen** (`PosterRenderer.routeCasing`): ha a vonal színe (színátmenetnél mindkét vége) a térkép alapszínével vagy legrosszabb színével 3:1 alatt marad, a vonal alá fekete vagy fehér kontúr kerül, amelyik jobban elüt tőle.

A tesztek minden témát és 300 véletlenszerű saját színpárt ellenőriznek.

## Állókép (`StillMap`)

- **Egy életben tartott térkép:** egy láthatatlan, a képernyőn kívüli térkép marad életben. A letöltött csempék a gyorsítótárában maradnak, így a következő render gyors.
- **Gyorsítótár:** az utolsó 4 eredmény megmarad (kép + kivetített pontok). A formátumok közötti oda-vissza váltás azonnali.
- **Sorba állítás:** a renderek egymás után futnak, mert ugyanazt a térképet használják.
- **Rögzített kamera:** 50°-os dőlés, észak felül. A dőlés és a forgatás szándékosan nem állítható, mert minden változtatás új térképet kérne.
- **Kulcs:** méret, sötét/világos tónus, a domborzat kiemelése (`MapStyles.lookKey`) és az útvonal geometriája (`StillMap.key`). Más nem számít.
- **Átmenet:** amíg az új térkép készül, a régi csak akkor marad látható, ha ugyanakkora, és az útvonal pontjai is egyeznek. Különben az útvonal elcsúszna rajta.

**Mért idők** (szoftveres 3D-rajzolóval, tehát a legrosszabb esetben):

| Művelet | Idő |
|---|---|
| Első térkép, Story (valódi videókártyán, hálózattal) | kb. 1,3–1,9 mp |
| Első sötét térkép, Story (szoftveres rajzolás, korábbi mérés) | kb. 3,7 mp |
| Formátumváltás | kb. 1,1 mp |
| Visszaváltás egy már látott formátumra | 2 ms |
| Színváltás | nincs újrarenderelés |

Valódi videókártyán ezek töredékei.

## Keretezés (`MapFraming`)

Az útvonal formátumonként rögzített sávba kerül, a cím és az adatok közé, a magasságprofil fölé:

| Formátum | Sáv (a képmagasság arányában) |
|---|---|
| Story | 27–52% |
| Feed | 25–56% |
| Négyzet | 25–58% |

**Hogyan:** a térkép fókuszpontját a `setPadding` teszi a sáv közepére. A kamera-távolságot a `FlyoverPath.fitDistance` számolja úgy, hogy:
- az útvonal szélessége kiférjen a teljes képszélességben;
- a mélysége (a dőlés miatt rövidülve) kiférjen a sáv magasságában.

Ez a szám a forgatást is figyelembe veszi. A perspektíva miatt a közeli rész nagyobbnak látszik, ezért van 20% ráhagyás.

## Átrepülés (`FlyoverPath`)

A kamera helye bármely `t ∈ [0, 1]` időpontra **állapot nélkül** kiszámolható. Így a képkockák tetszőleges sorrendben renderelhetők, és az előnézet ugyanazt mutatja, mint a videó.

| Szakasz | `t` | Kamera |
|---|---|---|
| Nyitás | 0–0,12 | A teljes útvonal felülről (38° dőlés), majd ereszkedés a rajthoz |
| Követés | 0,12–0,82 | Az útvonal mögött és fölött (62° dőlés), a kirajzolt nyomvonal „fejét” követve |
| Zárás | 0,82–1 | Kihátrálás, és közben 70°-os körbefordulás, a teljes útvonallal a sávban |

**A szakaszok összefűzése:**
- a távolság logaritmikus térben változik (természetes zoom);
- az irány a rövidebb úton fordul;
- követés közben az előrehaladás szinuszos görbét követ (lágy indulás és megállás).

**Kamera-irány:** egy előre kiszámolt, 800 pontos irány-sávból jön (`computeHeadings`):
1. **Helyi haladási irány** minden pontban (az útvonal ±1%-án).
2. **Simítás előre és hátra**, majd a két menet átlaga, így a kamera nem késik a kanyarok után.
3. **Fordulási sebesség korlátja:** egy hajtűkanyar vagy egy oda-vissza útvonal fordulója kb. 3 mp alatt zajlik le.

Mérve: legfeljebb 4,8° fordulás képkockánként (30 fps, 10 mp). A sáv kiszámolása 3 ms, 600 kamerapozíció 1,4 ms.

Egy korábbi próbálkozás az irányokat egy ablakban átlagolta. Ez oda-vissza útvonalnál hibás volt: az ellentétes irányok kioltották egymást, és a kamera összevissza ugrált.

**Kamera elhelyezése (`MapView.setCamera`):**
- a célpont mögött, a dőlésnek megfelelő magasságban áll, és `calculateCameraOptionsFromTo`-val néz a célpontra;
- ha a kamera alatti terep magasabb lenne, a kamera legalább 80 m-rel fölé emelkedik.

**Követési távolság:** a képen látható teljes nézet távolságának 1/1,18-a, azaz kb. 15–20%-kal közelebb, mint az állókép (legalább 450 m). Így a videó a környéket is mutatja, és a nyomvonal nagy része végig látszik. A nyitó és a záró kép legalább 1,25-ször ilyen messziről indul, így a kamera mindig „beereszkedik”.

## Videó: élő adatok és felirat

A videón ugyanaz az elrendezés látszik, mint a képen: cím, adatok, logó, forrásmegjelölés. A [useFlyover](../src/ui/video/useFlyover.ts) képkockánként építi fel:

- **Útvonal:** a `partialRoute(progress)` a már bejárt részt adja, színezési értékekkel. A végén levő pötty a „fej”.
- **Felpörgő számok:** a `LiveStats.snapshot` adja őket. **Mindig 0-ról indulnak**, és a végső értéken állnak meg.
  - A táv a látható útvonal megtett hányada szerint nő; az eltelt idő, a mozgásidő és a kalória az időbélyegek szerinti hányadban (időbélyeg nélkül a táv szerint).
  - Az emelkedés és a lejtés a megtett táv arányában nő.
  - Az átlagok (tempó, pulzus, watt) végig állandók, így az elrendezés nem ugrál.
  - Korábbi hiba: a számlálók a privacy zone-ban rejtett szakasz hosszáról (pl. 0,21 km), illetve az óra indulása és az első pont közti időről indultak. Most a látható útvonal elejéhez és végéhez igazodnak.
- **Megjelenés:** az adatblokk a nyitás alatt jelenik meg (`statsOpacity`).
- **Magasságprofil:** egy pont halad rajta (`elevationMarker`).

## Videókészítés (`FlyoverExporter`)

Képkockánként, nem valós időben:

1. `moveTo(t)`: kamera beállítása;
2. `settle()`: várakozás, amíg minden csempe betölt (`idle`, legfeljebb 5 mp);
3. `overlayAt(t)`: az útvonal kivetítése a már betöltött domborzatra, majd a felirat-réteg;
4. a térkép és a felirat összeolvasztása egy vásznon;
5. a kép átadása a kódolónak.

**Formátum:**
- **Kodek:** H.264 / MP4, ha a böngésző tudja (ez kell az Instagramnak); különben VP9 / WebM.
- **Felbontás:** 30 fps, a választott formátum mérete (pl. 1080×1920).
- **Hossz:** 10, 20 vagy 30 mp (alapból 20). Egy régebbi, már nem létező hossz (pl. 15) mentve az alapértékre áll vissza.

**Ellenőrizve:** egy 1 mp-es próbavideó szabályos MP4 (`ftyp isom`) lett.

**Telefon:** lassabb lehet. Mivel minden képkocka megvárja a térképet, az eredmény akkor is sima.

**Előtöltés (`MapView.warmUp`):** lejátszás előtt a kamera rejtve végigrepüli a pályát 96 ponton, és mindegyiknél megvárja, amíg minden csempe betöltődik („Térkép előkészítése… N%”). Csak ezután engedi a lejátszást és a videókészítést, így lejátszás közben nem tölt a térkép. Hogy a csempék meg is maradjanak, a videós térkép gyorsítótára nagyobb: a MapLibre a tárat „egy nézet csempéi × `maxTileCacheZoomLevels`” értékre korlátozza (alapból kb. 100 csempe), ezért ez 40, a felső határ (`maxTileCacheSize`) pedig 1200 csempe forrásonként.

Mérve (valódi videókártya, 20 mp-es videó, futás 4,7 km / kerékpár 41 km):

| | Előtöltés | Csempekérés lejátszás közben |
|---|---|---|
| Előtöltés nélkül | – | 139 / 205 |
| 48 pont, alap gyorsítótár | ~10 mp | 138 / 205 (a tár kiürült) |
| 48 pont, nagy gyorsítótár | ~10 mp | 21 / 30 |
| 96 pont, nagy gyorsítótár | ~16 mp | 14 / 10 (többnyire a böngésző saját tárából) |

**Előnézet:** valós időben, 60 fps-sel fut az előtöltött csempéken. A videókészítés emellett minden képkockánál meg is várja a térképet.

## Gyorsítások összefoglalva

- **Kevesebb újrarajzolás:** az útvonal saját rajzolóval készül, a térkép csak háttér. Így a stílus változása nem kér új térképet.
- **Kevesebb újraindítás:** egy életben tartott állókép-térkép, csempe-gyorsítótárral és eredmény-gyorsítótárral.
- **Kevesebb újrarenderelés:** rögzített kamera és rögzített keretezés, ezért a szöveg változása sem indít új térképet.
- **Kevesebb letöltés:** a domborzati adat legfeljebb 13-as szintig, 512 px-es csempékben; az alapstílusból kikerültek a felesleges feliratok.
- **Gyorsabb első betöltés:** előre megnyitott kapcsolat (`preconnect`) a térkép-szolgáltatókhoz az `index.html`-ben; mindkét alapstílus előtöltése, amikor az egér a „Kép | Videó” vagy a háttérválasztó fölé ér (`MapView.preload`).
- **Nincs töltés lejátszás közben:** előtöltött repülés és nagy csempe-gyorsítótár (lásd fent).
- **Színváltás újratöltés nélkül:** a stílus (alap / témaszín) és a kiemelő szín csak átfesti a futó térképet.
- **Lusta betöltés:** a térkép- és videókódot csak akkor tölti le a böngésző, amikor kell.
- **Olcsó kamera-számítás:** előre kiszámolt irány-sáv; képkockánként csak kiolvasás.

## Forrásmegjelölés

A licencek előírják, ezért minden térképes képen és videón ott van, a logó alatt, kis, de olvasható betűvel:
„© OpenStreetMap contributors · OpenFreeMap · OpenMapTiles · Terrain: © Mapterhorn” (minden stílusnál ugyanez).

## Tesztek

| Tesztfájl | Mit ellenőriz |
|---|---|
| [map.test.ts](../tests/map.test.ts) | Földrajzi segédfüggvények; a kamera szakaszai, simasága (legfeljebb 6°/képkocka) és követési távolsága; a részleges útvonal; az élő adatok növekedése és korlátja; az utcás és a videós stílusok rétegei (3D épületek, utcaszínek, nagyobb településnevek); a sötét/világos tónus; a témaszínes árnyalás; a „legrosszabb” térképszín; a domborzat kiemelése; a számlálók 0-ról indulása; az útvonal darabolása. |
| [poster.test.ts](../tests/poster.test.ts) | WCAG-kontraszt: a mérés, minden téma, 300 véletlen saját szín, a takarás szükséges átlátszatlansága. |

**Böngészős ellenőrzés:** a térképes rész WebGL-t igényel, ezért valódi böngészőben ellenőriztük. Sötét (Volt, Alkony) és világos (Kréta) témával kipróbáltuk az állóképet és a videót, mindkét videós stílussal, egy kerékpáros (41 km) és egy futós (4,7 km, kertvárosi) fájllal. Mértük az előtöltést és a lejátszás közbeni csempekéréseket, és ellenőriztük, hogy színváltáskor a térkép azonnal, újratöltés nélkül átszíneződik. Korábban egy rövid MP4 elkészítését is.

## Ismert korlátok

- **Épületek:** csak ott vannak, ahol az OpenStreetMap-ben fel vannak rajzolva; magasság híján 6 m-esek.
- **Takarás:** a mi rajzunk nem tudja, ha az útvonalat egy hegy eltakarja; a vonal ilyenkor a hegy előtt látszik.
- **Előtöltés ideje:** a videó előnézete kb. 10–16 mp után indul (hálózattól függ). Telefonon a nagyobb csempe-gyorsítótár több memóriát is igényel.
- **Távoli követés:** a kamera messziről követ, ezért a nyomvonal egy része a magasságprofil vagy a cím közelébe is kerülhet (a szöveg alatti takarás ilyenkor is biztosítja az olvashatóságot).
- **Videókészítés ideje:** tovább tart, mint a videó hossza (képkockánként vár a térképre). Valódi videókártyán ez elfogadható, szoftveres rajzolással lassú.
