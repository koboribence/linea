/** Hungarian texts. This file defines the key set; every other language must provide the same keys. */
export const hu = {
  'app.tagline': 'Edzésből megosztható kép, regisztráció nélkül.',
  'lang.label': 'Nyelv',

  'drop.title': 'Húzd ide az edzésfájlt',
  'drop.hint': '.fit, .gpx vagy .tcx, tömörítve (.gz) is',
  'drop.browse': 'Fájl kiválasztása',
  'drop.privacy': 'A fájl a böngésződben marad, nem töltjük fel sehova.',
  'drop.loading': 'Beolvasás…',
  'drop.another': 'Másik fájl',
  'drop.release': 'Engedd el a fájlt',

  'error.unsupported': 'Ezt a fájltípust nem ismerjük. FIT, GPX vagy TCX fájlt húzz ide.',
  'error.corrupt': 'A fájl sérült vagy hiányos, nem sikerült beolvasni.',
  'error.empty': 'A fájlban nincs edzésadat.',

  'sport.run': 'Futás',
  'sport.ride': 'Kerékpár',
  'sport.other': 'Egyéb',

  'title.auto': '{daypart} {activity}',
  'daypart.night': 'Éjszakai',
  'daypart.morning': 'Reggeli',
  'daypart.lunch': 'Déli',
  'daypart.afternoon': 'Délutáni',
  'daypart.evening': 'Esti',
  'activity.run': 'futás',
  'activity.ride': 'kerékpározás',
  'activity.other': 'edzés',

  'meta.points': '{count} mérési pont',

  'stat.distance': 'Táv',
  'stat.movingTime': 'Mozgásidő',
  'stat.elapsedTime': 'Teljes idő',
  'stat.avgPace': 'Átlagtempó',
  'stat.bestPace': 'Legjobb tempó',
  'stat.avgSpeed': 'Átlagsebesség',
  'stat.maxSpeed': 'Max sebesség',
  'stat.elevationGain': 'Emelkedés',
  'stat.elevationLoss': 'Lejtés',
  'stat.maxElevation': 'Legmagasabb pont',
  'stat.minElevation': 'Legalacsonyabb pont',
  'stat.avgHeartRate': 'Átlagpulzus',
  'stat.maxHeartRate': 'Max pulzus',
  'stat.avgPower': 'Átlagwatt',
  'stat.maxPower': 'Max watt',
  'stat.avgCadence': 'Átlagkadencia',
  'stat.maxCadence': 'Max kadencia',
  'stat.avgTemperature': 'Hőmérséklet',
  'stat.calories': 'Kalória',

  'editor.format': 'Formátum',
  'format.story': 'Story',
  'format.feed': 'Feed',
  'format.square': 'Négyzet',

  'editor.colors': 'Színek',
  'editor.background': 'Háttér',
  'editor.accent': 'Kiemelés',
  'editor.resetColors': 'Téma színei',
  'editor.transparent': 'Átlátszó háttér',
  'editor.transparentHint': 'Matrica a saját fotódra.',
  'theme.volt': 'Volt',
  'theme.chalk': 'Kréta',
  'theme.ocean': 'Éjkék',
  'theme.dusk': 'Alkony',
  'theme.forest': 'Erdő',
  'theme.graphite': 'Grafit',

  'editor.text': 'Szöveg',
  'editor.title': 'Cím',
  'editor.showDate': 'Dátum és sportág',

  'editor.stats': 'Adatok a képen',
  'editor.statsHint': 'Legfeljebb {max}, a kiválasztás sorrendjében.',

  'editor.route': 'Útvonal',
  'editor.coloring': 'Színezés',
  'coloring.solid': 'Egyszínű',
  'coloring.pace': 'Tempó',
  'coloring.speed': 'Sebesség',
  'coloring.elevation': 'Magasság',
  'coloring.heartRate': 'Pulzus',
  'editor.lineWidth': 'Vonalvastagság',
  'editor.privacy': 'Privacy zone',
  'editor.privacyHint': 'Az útvonal elejét és végét levágja, hogy ne látsszon, hol laksz.',
  'privacy.off': 'Ki',
  'editor.elevation': 'Magasságprofil',
  'editor.noRoute': 'Nincs GPS-útvonal, ezért a fő adat kerül a kép közepére.',
  'editor.privacyHidesRoute':
    'Az edzés olyan rövid, hogy a privacy zone a teljes útvonalat elrejti. Kapcsold ki vagy csökkentsd, ha látni szeretnéd.',

  'editor.more': 'Egyéb',
  'editor.sport': 'Sportág',
  'editor.logo': 'Logó a képen',

  'export.download': 'Letöltés',
  'export.share': 'Megosztás',
} as const;

export type MessageKey = keyof typeof hu;
export type Messages = Record<MessageKey, string>;
