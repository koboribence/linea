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
  MapStyles     a térképstílusok (képhez utcás, videóhoz éjszaka / hajnal / neon) + forrásmegjelölés
  SunPosition   a nap iránya és magassága egy időpontban és helyen (a hajnal stílus fényéhez)
  MapFraming    hová kerül az útvonal a képen (sáv a cím és az adatok között)
  FlyoverPath   a kamera mozgása t ∈ [0, 1] szerint; tiszta matematika
  LiveStats     „eddig megtett” táv és idő a videó adott pontján
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

Minden stílus domborzati és vektoros adatból készül, ezért bármilyen közelről éles. (Az ingyenes műholdkép kb. 10 m-es felbontású és közelről elmosódott, ezért kikerült.) A színek a témától függetlenek, így színváltáskor nem kell új térkép.

| Stílus | Hol | Mit mutat |
|---|---|---|
| **Utcás** (`streets`) | Kép háttere (nem választható) | Sötét vektortérkép vonalas utcákkal, vizekkel, lapos épületekkel, halvány domborzati árnyékolással |
| **Éjszaka** (alapértelmezett) | Videó | Hideg, több irányból megvilágított domborzat, kékesszürke utcák, 3D épületek |
| **Hajnal** | Videó | A domborzatot a nap világítja meg onnan és olyan magasról, ahol az edzés kezdetén állt; meleg színek |
| **Neon** | Videó | A magasság szerint színezett terep (sötétkék → lila → rózsaszín → narancs), lila utcák, 3D épületek |

**Az alapstílus átalakítása:**
- kikerülnek az utcanevek, egyirányú-nyilak, vízfeliratok és külvárosi címkék (zsúfoltak, és külön betűtípus-letöltést igényelnek);
- a domborzati rétegek a vonalak és feliratok alá kerülnek;
- **videóban** az utcák középvonala a stílus világos színét kapja, a lapos épületeket pedig 3D-s (`fill-extrusion`) épületek váltják a valódi magasságukkal (`render_height`), 13-as szinttől. A követő kamera elég alacsonyan repül ahhoz, hogy ezek látszódjanak.

**Domborzat kiemelése (`MapStyles.exaggeration`):** az útvonal magasságkülönbségéből jön: síkvidéken erősebb (60 m alatt 3×), hegyekben gyengébb (1000 m fölött 1,3×), hogy a dombok látsszanak, de a hegyek ne legyenek tüskék. A `MapView` ezzel számolja a célpont talajmagasságát.

**Napállás (`SunPosition`):** tömör csillagászati közelítés (kb. 1°-os pontosság). A fény magassága 20° és 55° közé van szorítva (alacsony napnál minden fekete, magasnál minden lapos). Ha a nap a horizont alatt volt, vagy nincs időpont, hűvös „holdfény” jön északnyugatról, 30°-ról.

**Domborzat:** a domborzati adat legfeljebb 13-as szintig töltődik le (512 px-es csempe, ez kb. a 256 px-es 14-es szint részletessége). A 3D formához és az árnyékoláshoz külön forrás tartozik, mert a közös forrás árnyékolása gyengébb; a böngésző gyorsítótára miatt a csempék így is csak egyszer töltődnek le.

**Kipróbált, de elvetett:** szintvonalak (maplibre-contour). Látványosak voltak, de a felhasználó utcákat és épületeket kért helyettük, és lapos terepen lassították a térképet.

## Állókép (`StillMap`)

- **Egy életben tartott térkép:** egy láthatatlan, a képernyőn kívüli térkép marad életben. A letöltött csempék a gyorsítótárában maradnak, így a következő render gyors.
- **Gyorsítótár:** az utolsó 4 eredmény megmarad (kép + kivetített pontok). A formátumok közötti oda-vissza váltás azonnali.
- **Sorba állítás:** a renderek egymás után futnak, mert ugyanazt a térképet használják.
- **Rögzített kamera:** 50°-os dőlés, észak felül. A dőlés és a forgatás szándékosan nem állítható, mert minden változtatás új térképet kérne.
- **Kulcs:** méret, stílus, a térkép „kinézete” (`MapStyles.lookKey`: fény, kiemelés, magasságtartomány) és az útvonal geometriája (`StillMap.key`). Más nem számít.
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

**Követési távolság:** az útvonal hosszának 3%-a, legalább 450 m, legfeljebb 1200 m. Közelebb, mint korábban, hogy az utcák és az épületek látszódjanak.

## Videó: élő adatok és felirat

A videón ugyanaz az elrendezés látszik, mint a képen: cím, adatok, logó, forrásmegjelölés. A [useFlyover](../src/ui/video/useFlyover.ts) képkockánként építi fel:

- **Útvonal:** a `partialRoute(progress)` a már bejárt részt adja, színezési értékekkel. A végén levő pötty a „fej”.
- **Felpörgő számok:** a `LiveStats.snapshot` adja őket.
  - A táv és az idő a valódi pontokból jön.
  - Az emelkedés, a lejtés és a kalória a megtett táv arányában nő.
  - Az átlagok (tempó, pulzus, watt) végig állandók, így az elrendezés nem ugrál.
  - A privacy zone-ban rejtett első szakasz is beleszámít a távba.
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

**Előnézet:** valós időben fut, ezért a csempék még tölthetnek. A videóban minden képkocka teljes.

## Gyorsítások összefoglalva

- **Kevesebb újrarajzolás:** az útvonal saját rajzolóval készül, a térkép csak háttér. Így a stílus változása nem kér új térképet.
- **Kevesebb újraindítás:** egy életben tartott állókép-térkép, csempe-gyorsítótárral és eredmény-gyorsítótárral.
- **Kevesebb újrarenderelés:** rögzített kamera és rögzített keretezés, ezért a szöveg változása sem indít új térképet.
- **Kevesebb letöltés:** a domborzati adat legfeljebb 13-as szintig, 512 px-es csempékben; az alapstílusból kikerültek a felesleges feliratok.
- **Gyorsabb első betöltés:** előre megnyitott kapcsolat (`preconnect`) a térkép-szolgáltatókhoz az `index.html`-ben; előtöltés, amikor az egér a „Kép | Videó” vagy a háttérválasztó fölé ér (`MapView.preload`).
- **Lusta betöltés:** a térkép- és videókódot csak akkor tölti le a böngésző, amikor kell.
- **Olcsó kamera-számítás:** előre kiszámolt irány-sáv; képkockánként csak kiolvasás.

## Forrásmegjelölés

A licencek előírják, ezért minden térképes képen és videón ott van, a logó alatt, kis, de olvasható betűvel:
„© OpenStreetMap contributors · OpenFreeMap · OpenMapTiles · Terrain: © Mapterhorn” (minden stílusnál ugyanez).

## Tesztek

| Tesztfájl | Mit ellenőriz |
|---|---|
| [map.test.ts](../tests/map.test.ts) | Földrajzi segédfüggvények; a kamera szakaszai, simasága (legfeljebb 6°/képkocka) és követési távolsága; a részleges útvonal; az élő adatok növekedése és korlátja; az utcás és a videós stílusok rétegei (3D épületek, világos utcák, neon színezés); a napállás és a fény; a domborzat kiemelése; az útvonal darabolása. |

**Böngészős ellenőrzés:** a térképes rész WebGL-t igényel, ezért valódi böngészőben ellenőriztük. Az utcás állóképet és mindhárom videós stílus több időpontját kipróbáltuk egy kerékpáros (41 km) és egy futós (4,7 km, kertvárosi) fájllal; korábban egy rövid MP4 elkészítését is.

## Ismert korlátok

- **Épületek:** csak ott vannak, ahol az OpenStreetMap-ben fel vannak rajzolva; magasság híján 6 m-esek.
- **Takarás:** a mi rajzunk nem tudja, ha az útvonalat egy hegy eltakarja; a vonal ilyenkor a hegy előtt látszik.
- **Videókészítés ideje:** tovább tart, mint a videó hossza (képkockánként vár a térképre). Valódi videókártyán ez elfogadható, szoftveres rajzolással lassú.
