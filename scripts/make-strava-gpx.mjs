// Builds a Strava-style GPX fixture from a FIT file, so GPX and FIT parsing can be compared.
// Usage: node scripts/make-strava-gpx.mjs <input.fit> <output.gpx> [name]
import { readFileSync, writeFileSync } from 'node:fs';
import { Decoder, Stream } from '@garmin/fitsdk';

const [input, output, name = 'Afternoon Ride'] = process.argv.slice(2);
const { messages } = new Decoder(Stream.fromBuffer(readFileSync(input))).read();
const deg = (semicircles) => (semicircles * 180) / 2 ** 31;

const points = messages.recordMesgs
  .filter((r) => r.positionLat !== undefined && r.positionLong !== undefined)
  .map((r) => {
    const ext = [
      r.temperature !== undefined && `<gpxtpx:atemp>${r.temperature}</gpxtpx:atemp>`,
      r.heartRate !== undefined && `<gpxtpx:hr>${r.heartRate}</gpxtpx:hr>`,
      r.cadence !== undefined && `<gpxtpx:cad>${r.cadence}</gpxtpx:cad>`,
    ]
      .filter(Boolean)
      .join('');
    const power = r.power !== undefined ? `<power>${r.power}</power>` : '';
    const ele = r.enhancedAltitude ?? r.altitude;
    return `   <trkpt lat="${deg(r.positionLat).toFixed(7)}" lon="${deg(r.positionLong).toFixed(7)}">
    ${ele !== undefined ? `<ele>${ele.toFixed(1)}</ele>` : ''}
    <time>${r.timestamp.toISOString().replace('.000', '')}</time>
    <extensions>${power}<gpxtpx:TrackPointExtension>${ext}</gpxtpx:TrackPointExtension></extensions>
   </trkpt>`;
  });

const start = messages.recordMesgs[0].timestamp.toISOString().replace('.000', '');
writeFileSync(
  output,
  `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <metadata>
  <time>${start}</time>
 </metadata>
 <trk>
  <name>${name}</name>
  <type>cycling</type>
  <trkseg>
${points.join('\n')}
  </trkseg>
 </trk>
</gpx>
`,
);
console.log(`Wrote ${points.length} points to ${output}`);
