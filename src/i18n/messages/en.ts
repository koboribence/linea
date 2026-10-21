import type { Messages } from './hu';

export const en: Messages = {
  'app.tagline': 'Turn your workout into a shareable image. No sign-up.',
  'lang.label': 'Language',

  'drop.title': 'Drop your activity file here',
  'drop.hint': '.fit, .gpx or .tcx, also gzipped (.gz)',
  'drop.browse': 'Choose file',
  'drop.privacy': 'Your file stays in your browser. Nothing is uploaded.',
  'drop.loading': 'Reading…',
  'drop.another': 'Another file',
  'drop.release': 'Release to open',

  'error.unsupported': "We don't recognize this file type. Drop a FIT, GPX or TCX file.",
  'error.corrupt': 'The file is damaged or incomplete and could not be read.',
  'error.empty': 'The file contains no workout data.',

  'sport.run': 'Run',
  'sport.ride': 'Ride',
  'sport.other': 'Workout',

  'meta.device': 'Device',
  'meta.points': '{count} data points',
  'meta.noGps': 'No GPS data, so the image will have no route (e.g. treadmill or indoor trainer).',

  'channel.gps': 'GPS',
  'channel.elevation': 'Elevation',
  'channel.heartRate': 'Heart rate',
  'channel.cadence': 'Cadence',
  'channel.power': 'Power',

  'group.overview': 'Overview',
  'group.elevation': 'Elevation',
  'group.sensors': 'Sensors',

  'stat.distance': 'Distance',
  'stat.movingTime': 'Moving time',
  'stat.elapsedTime': 'Elapsed time',
  'stat.avgPace': 'Avg pace',
  'stat.bestPace': 'Best pace',
  'stat.avgSpeed': 'Avg speed',
  'stat.maxSpeed': 'Max speed',
  'stat.elevationGain': 'Elevation gain',
  'stat.elevationLoss': 'Elevation loss',
  'stat.maxElevation': 'Highest point',
  'stat.minElevation': 'Lowest point',
  'stat.avgHeartRate': 'Avg heart rate',
  'stat.maxHeartRate': 'Max heart rate',
  'stat.avgPower': 'Avg power',
  'stat.maxPower': 'Max power',
  'stat.avgCadence': 'Avg cadence',
  'stat.maxCadence': 'Max cadence',
  'stat.avgTemperature': 'Temperature',
  'stat.calories': 'Calories',
};
