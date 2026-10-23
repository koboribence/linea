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
  PlaceLabels   mely településnevek jelenjenek meg, és hol (a rajzoló írja ki őket)
ui/map/
  MapView       MapLibre-burkoló: kamera, vetítés, betöltésre várás
  StillMap      állókép a képhez; egy életben tartott, láthatatlan térkép + gyorsítótár
  FlyoverExporter  képkockánkénti renderelés és videókódolás
  toScreenRoute    kivetített pontok → rajzolható útvonal (darabokra bontva)
ui/video/
  FlyoverPreview            az előre elkészíthető, előtöltött előnézeti térkép
  useFlyover, VideoStudio   videós előnézet, lejátszás, idővonal, készítés
public/
  sw.js         tartós csempetár (service worker)
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
- **településnevek:** az alapstílus saját településnevei kimaradnak; a neveket a poszter rajzolója írja ki (lásd lent, „Településnevek”);
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

## Településnevek (`PlaceLabels`)

A neveket nem a térkép, hanem a poszter rajzolója írja ki, ugyanúgy, mint az útvonalat. A MapLibre saját feliratai a kép szélén félig kilógtak, a cím vagy az adatok alá kerülhettek, és nem lehetett kikényszeríteni, hogy a kiinduló település látsszon.

**Honnan:** a térkép betöltött csempéinek „place” rétegéből (`MapView.places`, `querySourceFeatures`; a stílusnak nem kell megjelenítenie). Név, típus (nagyváros, város, falu) és a térképadat fontossági rangja. Képnél a kész térképről, videónál az előtöltés végén, egyszer gyűjtjük be; videónál képkockánként vetítjük.

**Mely nevek:**
- **Szint az átfogott terület szerint** (a befoglaló téglalap hosszabbik oldala, `MapStyles.placeLevel`): 5 km-ig falvak, városok és nagyvárosok; 40 km-ig városok és nagyvárosok; afölött csak nagyvárosok.
- **Ritkítás:** legfeljebb 7 / 6 / 5 név (falu- / város- / nagyvárosszint), egymástól legalább 28 egységnyi hellyel; fontossági sorrendben (nagyváros, város, falu, majd rang), így ütközésnél a fontosabb marad.
- **Kiinduló település:** a (privacy zone utáni) kezdőponthoz legközelebbi név 4 km-en belül, bármilyen kicsi. Mindig elsőként kerül ki; ha a pontja a térképsáv szélén vagy kicsit azon kívül van, a név beljebb csúszik.

**Hol:** csak a térképsávban: a cím alatt és a magasságprofil / adatok fölött, a kép szélétől a margónyira, és **soha nem az útvonalon** (a vonal, a fénye és a rajt/cél jelölő körül szabadon hagyott sávval). Minden név néhány helyet próbál sorban: a települése pontján, fölötte, alatta, jobbra, balra; az elsőt veszi, ami a sávon belül van, nem ér az útvonalhoz és más névhez. Ha egyik sem jó, kimarad. A kiinduló település több, távolabbi helyet is kipróbál, és végső esetben az útvonalra is kerülhet, de mindig ki van írva. Videón a teljes (később kirajzolódó) útvonalat is kerülik, így nem ugrálnak, ahogy a vonal halad; a sáv szélén elhalványulnak.

**Kapcsoló:** „Településnevek” a 3D térkép hátterénél és a videó beállításainál (`showPlaces`, alapból be).

**Megjelenés:** a poszter címkebetűjével, nagybetűvel, nagyváros 30, város 25, falu 22 egység, 70%-os erősséggel (a körvonal 60%), ellentétes színű körvonallal (sötét térképen világos, világoson sötét). Visszafogottak: a térkép részei, nem a poszter szövegéé.

## Kiemelt pillanatok (`RouteHighlights`, 30 mp-es videó)

30 mp-es videónál a szerkesztőben megjelenik a „Pillanatok a videón” rész: csúcssebesség (futásnál tempóként), max. pulzus, max. teljesítmény, legmagasabb pont, amelyikhez van adat. A kiválasztottak a videón akkor jelennek meg, amikor a nyomvonal „feje” odaér: egy pont az útvonalon és egy kártya a címkével és az értékkel (a kép adatai között szereplő értékkel). A kártya a pont fölé kerül, ha ott nincs hely, alá, ha ott sem, feljebb vagy lejjebb lép; ha sehol nincs hely, csak a pont látszik.

Adatvédelem: a privacy zone-ba eső csúcsokat nem mutatjuk, mert elárulnák a rejtett kezdő- vagy végpontot. A sebességcsúcs simított GPS-sebességből jön (vagy a készülék saját sebességadatából), hogy egyetlen GPS-ugrás ne legyen csúcs.

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
| Követés | 0,12–0,74 | Messziről, 62°-os dőléssel, a kirajzolt nyomvonal „fejét” követve; a kép lassan úszik észak körül |
| Zárás | 0,74–0,9 | Kihátrálás, és közben 70°-os körbefordulás, a teljes útvonallal a sávban |
| Kész kör | 0,9–1 | A teljes útvonal látszik, a kamera lassan (12°-ot) tovább kering; 20 mp-es videónál 2 mp |

**A szakaszok összefűzése:**
- a távolság logaritmikus térben változik (természetes zoom);
- az irány a rövidebb úton fordul;
- követés közben az előrehaladás szinuszos görbét követ (lágy indulás és megállás).

**Kamera-irány:** követés közben a kamera **nem fordul az útvonallal**, hanem a videó alatt lassan, egyenletesen úszik észak körül (összesen 40°, -20°-tól +20°-ig), és közben görgetve követi a nyomvonal „fejét”. A nyitás innen 25°-kal elforgatva indul, a zárás 70°-ot kering, a kész körnél még 12°-ot.

Miért: a kamera messziről követ, így ha az útvonal irányát követné, az egész kép vele együtt fordulna. Egy körpálya végén ez egy teljes, 360°-os forgást jelentett a videó közepén, nagyjából 40°/mp sebességgel, ami ugrálásnak látszott. Korábban egy előre számolt, simított irány-sáv vezette a kamerát (`computeHeadings`, legfeljebb 4,8°/képkocka); ez közeli kameránál jó volt, távolinál nem.

**Kamera-magasság (`computeGround`):** a rögzített magasság zajos (pontról pontra méterek), és a domborzat-kiemelés ezt megsokszorozza. Közvetlenül követve az egész kép fel-le billegett. Ezért a kamera egy simított magasságot céloz: nagyjából a kamera által látott szakaszra átlagolva (legfeljebb az útvonal ±15%-ára, háromszoros dobozszűrővel, ami közel Gauss-szerű). A nagy dombokat így is követi, a zajt nem.

Mérve: követés közben legfeljebb 0,2° fordulás és 1 m-nél kisebb magasságváltozás képkockánként (20 mp, 30 fps).

**A kamera pontos helye:** a MapLibre alapból a térkép középpontját a domborzathoz „ragasztja” (`centerClampedToGround`). Ha közben megérkezett egy domborzati csempe, a középpont magasságát átírta, a nagyítást viszont nem, így a kamera észrevétlenül elmozdult: a térkép megugrott, a ráírt útvonal elcsúszott rajta. Ezért ez ki van kapcsolva, a kamera magasságát mi adjuk meg. Lejátszáskor a térkép a kamera beállítása után azonnal újrarajzolódik (`MapView.renderNow`), így a térkép és a felirat ugyanazt a pillanatot mutatja (különben a térkép egy képkockával lemaradt).

**Kamera elhelyezése (`MapView.setCamera`):**
- a célpont mögött, a dőlésnek megfelelő magasságban áll, és `calculateCameraOptionsFromTo`-val néz a célpontra;
- ha a kamera alatti terep magasabb lenne, a kamera legalább 80 m-rel fölé emelkedik.

**Követési távolság:** a képen látható teljes nézet távolságának 1/1,18-a, azaz kb. 15–20%-kal közelebb, mint az állókép (legalább 450 m). Így a videó a környéket is mutatja, és a nyomvonal nagy része végig látszik. A nyitó és a záró kép legalább 1,25-ször ilyen messziről indul, így a kamera mindig „beereszkedik”.

## Videó: élő adatok és felirat

A videón ugyanaz az elrendezés látszik, mint a képen: cím, adatok, logó, forrásmegjelölés. A [useFlyover](../src/ui/video/useFlyover.ts) képkockánként építi fel:

- **Útvonal:** a `partialRoute(progress)` a már bejárt részt adja, színezési értékekkel. A végén levő pötty a „fej”.
- **Felpörgő számok:** a `LiveStats.snapshot` adja őket. **Mindig 0-ról indulnak**, és a végső értéken állnak meg.
  - **Nem mozdul az elrendezés:** a betűméretet és az elrendezést a végső értékekre méri a rajzoló (`statsSizing`). Korábban a pörgő szám szélessége képkockánként változtatta a betűméretet, ettől az adatblokk, a magasságprofil és a takarás is mozgott.
  - **Egyforma széles számjegyek:** a legtöbb betűtípusban az „1” keskenyebb, mint a „8” (Barlow-ban 28 kontra 48 egység), így a pörgő szám remegne. A videón minden számjegy egyforma széles cellába kerül, mint egy stopperórán (a vásznon nincs `tabular-nums`, ezért karakterenként rajzoljuk). Így a szám a szokásos módon igazodik a feliratához (balra, illetve középre), és csak akkor mozdul, amikor eggyel több számjegy lesz. Egy korábbi próbálkozás a végső érték szélességéhez jobbra igazított; ettől viszont a videó elején a szám elcsúszott a feliratától. A képeken marad a betűtípus saját betűköze.
  - A táv a látható útvonal megtett hányada szerint nő; az eltelt idő, a mozgásidő és a kalória az időbélyegek szerinti hányadban (időbélyeg nélkül a táv szerint).
  - Az emelkedés és a lejtés a megtett táv arányában nő.
  - Az átlagok (tempó, pulzus, watt) végig állandók, így az elrendezés nem ugrál.
  - Korábbi hiba: a számlálók a privacy zone-ban rejtett szakasz hosszáról (pl. 0,21 km), illetve az óra indulása és az első pont közti időről indultak. Most a látható útvonal elejéhez és végéhez igazodnak.
- **Megjelenés:** az adatblokk a nyitás alatt jelenik meg (`statsOpacity`).
- **Magasságprofil:** egy pont halad rajta (`elevationMarker`).

## Előnézet és előtöltés (`FlyoverPreview`)

A cél: a videó lejátszása közben ne töltsön a térkép, és a várakozás legyen rövid, telefonon is.

**Könnyebb előnézet, azonos videó:** az előnézet térképe ugyanakkora (így a feliratok, vonalak és a keretezés pontosan olyan, mint a kész videón), de:
- egy szinttel kevésbé részletes csempéket tölt (`detail: 'preview'`: utcák legfeljebb 13-as, domborzat 12-es szintig; a stílus felülírja a szerver alapértékét). A domborzatnál a 12 és a 13 között a képernyőn nem látszott különbség, a 13 kb. 2 mp-cel lassabb volt;
- csak annyi pixelt rajzol, amennyi a képernyőn látszik (`pixelRatio` = kijelzett méret × eszköz-pixelarány, 0,5 és 1 között).

A kész videó **mindig** külön, teljes részletességű térképen készül, ezért minden készüléken ugyanolyan.

**Előtöltés (`MapView.warmUp`, `FlyoverPath.warmUpShots`):** lejátszás előtt a kamera rejtve végigrepüli a pályát, és minden nézetnél megvárja, amíg minden csempe betöltődik. A nézetek nem egyenletesen jönnek: új nézet akkor kell, amikor a kép az előzőhöz képest érdemben változott (a kamera-távolság 12%-ával elmozdult, 0,18 zoomszintet változott, 12°-ot fordult vagy 5°-ot dőlt). Mivel a kamera már nem fordul az útvonallal, a nézetek jobban átfedik egymást, és 96 helyett kb. 30 nézet elég.

Hogy a csempék meg is maradjanak, a videós térkép gyorsítótára nagyobb: a MapLibre a tárat „egy nézet csempéi × `maxTileCacheZoomLevels`” értékre korlátozza (alapból kb. 100 csempe), ezért ez 40, a felső határ (`maxTileCacheSize`) pedig 1200 csempe forrásonként.

**Előre kezdés:** amint az egér a „Kép | Videó” kapcsoló fölé ér, a videó térképe láthatatlanul elkészül és előtölt (`FlyoverPreview.prepare`). Kattintáskor a kész térkép átköltözik az előnézetbe. Érintőképernyőn ez nem segít (ott a koppintás maga a kattintás), és nem indul, ha a böngésző adattakarékos módot jelez. Az előkészített térkép a fájl végéig megmarad, így a Kép és a Videó közti váltás után azonnal ott van.

**Töltés közben:** a háttérben a nyitókép látszik a teljes útvonallal és a végső adatokkal (halványítva), előtérben a „Videó előkészítése” kártya a haladással.

Mérve (valódi videókártya, 20 mp-es videó, futás 4,7 km / kerékpár 41 km):

| | Lejátszhatóig | Csempekérés lejátszás közben |
|---|---|---|
| Előtöltés nélkül | – | 139 / 205 |
| 96 egyenletes nézet, teljes részletesség | ~16 mp | 14 / 10 |
| Könnyebb előnézet, 30–45 nézet, forgó kamera | ~7,5 mp | 13 / 16 |
| Könnyebb előnézet, nyugodt (nem forgó) kamera | **~5,3 mp** | 9 / 6 (többnyire a böngésző saját tárából) |
| Ugyanez, egér a kapcsoló fölött 4 mp-ig, majd kattintás | **~3 mp** | 12 |
| Telefonméretű nézet (390×844, 3× pixelarány, asztali videókártyán) | ~7 mp | – |

Valódi telefonon a rajzolás lassabb, ezért ott ezek az idők hosszabbak lehetnek; mérni érdemes.

**Hova megy az idő:** a mérés szerint asztali gépen nem a hálózat a szűk keresztmetszet. A második látogatás (minden csempe a készüléken) csak kb. 1 mp-cel gyorsabb. Az idő nagy része a csempék feldolgozása és a nézetek kirajzolása, mert a kevésbé részletes adatból a MapLibre a nagyobb nagyításokhoz újra feldolgozza ugyanazt a csempét. Lassú mobilneten viszont a hálózat számít, ott segít a tartós tárolás (lásd lent).

**Előnézet lejátszása:** valós időben, 60 fps-sel fut az előtöltött csempéken.

## Videókészítés (`FlyoverExporter`)

Külön, rejtett, teljes részletességű térképen (`detail: 'full'`, `pixelRatio` 1). Közben **minden más le van tiltva** (`useLockWhile`): a szerkesztőpanel, a Kép/Videó kapcsoló, a fájlcsere, a vissza gomb és a nyelvváltó (`inert`, halványítva). A telefon „vissza” gesztusa sem lép ki, és az oldal bezárása előtt a böngésző rákérdez. Az előnézet alján nagy százalék, vastag sáv, becsült hátralévő idő és egy jól látható **Mégse** gomb jelenik meg. Közben az előnézet térképe felszabadul (telefonon két térkép nem biztos, hogy elfér a memóriában), és az előnézet helyén a ténylegesen elkészült képkockák látszanak (minden harmadik). Készítés után az előnézet újra elkészül, ez már a böngésző tárából jön (kb. 6 mp).

Képkockánként, nem valós időben:

1. `moveTo(t)`: kamera beállítása;
2. `ready()`: a térkép azonnal kirajzolja a nézetet; ha minden csempe megvan, kész, különben megvárja a következő érkező csempét, és újra próbálja (legfeljebb 5 mp);
3. `overlayAt(t)`: az útvonal kivetítése a már betöltött domborzatra, majd a felirat-réteg;
4. a térkép és a felirat összeolvasztása egy vásznon;
5. a kép átadása a kódolónak (és az előnézetnek, `onFrame`).

**Formátum:**
- **Kodek:** H.264 / MP4, ha a böngésző tudja (ez kell az Instagramnak); különben VP9 / WebM.
- **Felbontás:** 30 fps, a választott formátum mérete (pl. 1080×1920).
- **Hossz:** 10, 20 vagy 30 mp (alapból 20). Egy régebbi, már nem létező hossz (pl. 15) mentve az alapértékre áll vissza.

**Gyorsítás (`MapView.ready`):** mérve a készítési idő 95%-a a térképre várás volt: képkockánként a MapLibre „kész” (`idle`) jelzésére vártunk, ami további képfrissítési ciklusokat vár ki, akkor is, ha minden csempe megvan. Most a nézet szinkron rajzolódik (`map.redraw()`), és csak akkor várunk, ha `areTilesLoaded()` szerint még hiányzik csempe; ilyenkor a következő `data` eseményre (érkező csempére). A videó térképének külön előtöltése így feleslegessé vált.

Mérve (valódi videókártya, 10 mp-es videó):

| Útvonal | Előtte | Utána |
|---|---|---|
| Kerékpár, 120 km (távoli kamera) | 50 mp | **7 mp** |
| Kerékpár, 41 km | – | **8 mp** |
| Futás, 4,7 km (közeli kamera, sok épület) | – | **11 mp** |

Képkockánként visszajátszva egyik videóban sincs ugrás, a képkockák teljesek (domborzat, épületek, nevek). Mellékhatásként a készítés háttérlapon is halad, mert már nem függ a képfrissítési ciklustól (`requestAnimationFrame`), amit a böngésző háttérlapon leállít.

**Ellenőrizve:** szabályos MP4 (`ftyp isom`).

**Telefon:** lassabb lehet. Mivel minden képkocka megvárja a térképet, az eredmény akkor is sima.

## Várakozás közben (`useExportAttention`)

A cél, hogy a felhasználónak ne kelljen a haladásjelzőt néznie. Az ajánlások szerint 10 mp-nél hosszabb várakozásnál pontos haladás kell (százalék, hátralévő idő), és a legjobb, ha közben máshol lehet, és szólunk, ha kész. Mivel minden a böngészőben fut, ez így valósul meg:

- **Nagy haladásjelző** az előnézet alján: százalék, vastag sáv, becsült hátralévő idő, jól látható Mégse gomb, közben az elkészült képkockák.
- **Számítógépen:** „Nyugodtan válts másik lapra” – a készítés háttérlapon is halad. A lap címe mutatja a százalékot („45% · Linea”), a végén „✓ Elkészült a videód · Linea”, amíg vissza nem tér. A „Szólj, ha kész” gombbal (csak kérésre kér engedélyt) rendszerértesítést is kap; Androidon a service workeren át (`showNotification`), kattintásra a lap előre jön.
- **Telefonon:** „Maradj ezen az oldalon” – a képernyő nem alszik el közben (Screen Wake Lock), mert egy elalvó telefon leállítaná a munkát; a végén rövid rezgés.

## Ha a 3D térkép nem érhető el (egyszerű videó)

Ha a 3D térkép nem tölt be (nincs internet, a térképszolgáltató nem elérhető, vagy a böngésző nem tud WebGL-t), egy ablak elmondja, mi történt, és két lehetőséget ad: „Újrapróbálom a 3D-t” (ez az első, alapértelmezett gomb) vagy „Egyszerű videó”.

Az **egyszerű videó** a kép kinézete: témaszínű háttéren a felülnézeti útvonal rajzolódik ki (`routeProgress`, `RouteShape.cut`), a számlálók pörögnek, a magasságprofilon halad a jelölő; a videó 85%-ánál az útvonal kész, utána kitart. Térkép nélkül készül (`FlyoverExporter` térkép nélkül), ezért gyors (10 mp-es videó kb. 3,4 mp alatt).

**A 3D az első:** egyszerű módban egy sáv jelzi, hogy ez nem a 3D változat, „Újra a 3D-vel” gombbal. Ha a böngésző jelzi, hogy visszajött a kapcsolat (`online`), a háttérben magától újrapróbálja, és ha a 3D elkészül, automatikusan arra vált.

## Tartós csempetár (service worker)

A [public/sw.js](../public/sw.js) a térkép által már letöltött csempéket, betűket és ikonokat a készüléken tartja (Cache Storage), így ugyanannak a környéknek a következő videója vagy képe a hálózat nélkül tölt. Szabályok:
- csak azt tárolja, amit a térkép amúgy is kért; magától semmit nem tölt le;
- a csempét azonnal továbbadja a térképnek, a mentés mellette történik;
- legfeljebb 2000 bejegyzés (nagyjából 100–200 MB); fölötte a legrégebbiek törlődnek;
- az OpenFreeMap csempeútvonalai adatverziót tartalmaznak, ezért nem avulnak el; a térkép indexe (melyik verzió az aktuális) nincs tárolva, mindig friss;
- csak éles buildben működik (fejlesztés közben zavarná a gyors újratöltést).

Feltételek: az OpenFreeMap nem tiltja a tárolást (tömeges letöltésnél 3000 csempe a határ, egy videó ~200–400 csempét néz meg), a Mapterhorn nyílt adat, szabály nélkül. A csempék hosszú ideig gyorsítótárazhatók (utca 10 év, domborzat 7 nap), a böngésző saját tára is használja őket; a service worker ezt teszi tartóssá (a böngésző a saját tárát telefonon hamar üríti).

## Gyorsítások összefoglalva

- **Kevesebb újrarajzolás:** az útvonal saját rajzolóval készül, a térkép csak háttér. Így a stílus változása nem kér új térképet.
- **Kevesebb újraindítás:** egy életben tartott állókép-térkép, csempe-gyorsítótárral és eredmény-gyorsítótárral.
- **Kevesebb újrarenderelés:** rögzített kamera és rögzített keretezés, ezért a szöveg változása sem indít új térképet.
- **Kevesebb letöltés:** a domborzati adat legfeljebb 13-as szintig, 512 px-es csempékben; az alapstílusból kikerültek a felesleges feliratok.
- **Gyorsabb első betöltés:** előre megnyitott kapcsolat (`preconnect`) a térkép-szolgáltatókhoz az `index.html`-ben; mindkét alapstílus előtöltése, amikor az egér a „Kép | Videó” vagy a háttérválasztó fölé ér (`MapView.preload`).
- **Nincs töltés lejátszás közben:** előtöltött repülés, adaptív nézetválasztás és nagy csempe-gyorsítótár (lásd fent).
- **Könnyebb előnézet:** egy szinttel kevesebb csemperészlet, csak a látható pixelek; a videó ettől független, teljes részletességű.
- **Előre kezdés:** a videó térképe már az egérmutatásra elkészül.
- **Tartós tár:** service worker a már letöltött csempékhez.
- **Színváltás újratöltés nélkül:** a stílus (alap / témaszín) és a kiemelő szín csak átfesti a futó térképet.
- **Lusta betöltés:** a térkép- és videókódot csak akkor tölti le a böngésző, amikor kell.
- **Olcsó kamera-számítás:** előre kiszámolt irány-sáv; képkockánként csak kiolvasás.

## Forrásmegjelölés

Csak a kötelező szerepel, minden térképes képen és videón a logó alatt, kis, de olvasható betűvel:
„© OpenStreetMap · © OpenMapTiles · © Mapterhorn”.

| Forrás | Miért kell |
|---|---|
| OpenStreetMap | ODbL; az OSMF irányelve szerint a „© OpenStreetMap” a minimum, a képen vagy közvetlenül mellette, olvashatóan. Videónál a térképen, plusz a stáblistában vagy a leírásban. |
| OpenMapTiles | A csempék az OpenMapTiles-sémát követik (CC-BY); a termékeknek látható „OpenMapTiles” említés kell, állóképnél a kép mellett. |
| Mapterhorn | A domborzati csempék ezt adják meg forrásként; a pontos előírás nem egyértelmű, ezért biztonságból szerepel. |
| OpenFreeMap | Nem ír elő említést, ezért kimaradt. |

## Tesztek

| Tesztfájl | Mit ellenőriz |
|---|---|
| [map.test.ts](../tests/map.test.ts) | Földrajzi segédfüggvények; a kamera szakaszai, simasága (legfeljebb 6°/képkocka) és követési távolsága; a részleges útvonal; az élő adatok növekedése és korlátja; az utcás és a videós stílusok rétegei (3D épületek, utcaszínek, nagyobb településnevek); a sötét/világos tónus; a témaszínes árnyalás; a „legrosszabb” térképszín; a domborzat kiemelése; a számlálók 0-ról indulása; a kész kör kitartása a végén; a nyugodt követés (lassú fordulás, simított magasság); az előtöltés nézeteinek száma és sűrűsége; az útvonal darabolása. |
| [poster.test.ts](../tests/poster.test.ts) | WCAG-kontraszt: a mérés, minden téma, 300 véletlen saját szín, a takarás szükséges átlátszatlansága. |

**Böngészős ellenőrzés:** a térképes rész WebGL-t igényel, ezért valódi böngészőben ellenőriztük. Sötét (Volt, Alkony) és világos (Kréta) témával kipróbáltuk az állóképet és a videót, mindkét videós stílussal, egy kerékpáros (41 km) és egy futós (4,7 km, kertvárosi) fájllal. Mértük az előtöltést és a lejátszás közbeni csempekéréseket, és ellenőriztük, hogy színváltáskor a térkép azonnal, újratöltés nélkül átszíneződik. Korábban egy rövid MP4 elkészítését is.

## Ismert korlátok

- **Épületek:** csak ott vannak, ahol az OpenStreetMap-ben fel vannak rajzolva; magasság híján 6 m-esek.
- **Takarás:** a mi rajzunk nem tudja, ha az útvonalat egy hegy eltakarja; a vonal ilyenkor a hegy előtt látszik.
- **Előtöltés ideje:** a videó előnézete asztali gépen kb. 7–8 mp után indul (egérmutatással kb. 3 mp); telefonon hosszabb lehet. A nagyobb csempe-gyorsítótár több memóriát igényel.
- **Előnézet és videó:** az előnézet egy szinttel kevésbé részletes (kevesebb épület látszik), a videó teljes részletességű.
- **Távoli követés:** a kamera messziről követ, ezért a nyomvonal egy része a magasságprofil vagy a cím közelébe is kerülhet (a szöveg alatti takarás ilyenkor is biztosítja az olvashatóságot).
- **Videókészítés ideje:** tovább tart, mint a videó hossza (képkockánként vár a térképre). Valódi videókártyán ez elfogadható, szoftveres rajzolással lassú.
