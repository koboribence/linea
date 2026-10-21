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
  'sport.other': 'Edzés',

  'meta.device': 'Eszköz',
  'meta.points': '{count} mérési pont',
  'meta.noGps': 'Nincs GPS-adat, ezért útvonal sem lesz a képen (pl. futópad vagy görgő).',

  'channel.gps': 'GPS',
  'channel.elevation': 'Magasság',
  'channel.heartRate': 'Pulzus',
  'channel.cadence': 'Kadencia',
  'channel.power': 'Watt',

  'group.overview': 'Áttekintés',
  'group.elevation': 'Szint',
  'group.sensors': 'Szenzorok',

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
  'stat.avgPower': 'Átlagteljesítmény',
  'stat.maxPower': 'Max teljesítmény',
  'stat.avgCadence': 'Átlagkadencia',
  'stat.maxCadence': 'Max kadencia',
  'stat.avgTemperature': 'Hőmérséklet',
  'stat.calories': 'Kalória',
} as const;

export type MessageKey = keyof typeof hu;
export type Messages = Record<MessageKey, string>;
