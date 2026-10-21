import type { Activity } from '../activity/Activity';
import { sportFromText } from '../activity/SportType';
import type { TrackPoint } from '../activity/TrackPoint';
import { XmlActivityParser } from './XmlActivityParser';

/** GPX 1.0/1.1, including Garmin TrackPointExtension and Strava's <power> extension. */
export class GpxParser extends XmlActivityParser {
  readonly format = 'gpx';

  parse(data: ArrayBuffer): Activity {
    const doc = this.parseXml(data);
    let nodes = doc.getElementsByTagNameNS('*', 'trkpt');
    // Planned routes have no track, only route points
    if (nodes.length === 0) nodes = doc.getElementsByTagNameNS('*', 'rtept');

    const points = Array.from(nodes, (node) => GpxParser.readPoint(node));
    const trk = doc.getElementsByTagNameNS('*', 'trk')[0];
    const metadata = doc.getElementsByTagNameNS('*', 'metadata')[0];
    const metaTime = metadata && GpxParser.toTime(GpxParser.childText(metadata, 'time'));

    return this.createActivity(
      {
        sport: sportFromText(trk && GpxParser.childText(trk, 'type')),
        name:
          (trk && GpxParser.childText(trk, 'name')) ??
          (metadata && GpxParser.childText(metadata, 'name')),
        device: doc.documentElement.getAttribute('creator') ?? undefined,
        startTime: metaTime === undefined ? undefined : new Date(metaTime),
      },
      points,
    );
  }

  private static readPoint(node: Element): TrackPoint {
    const point: TrackPoint = {
      lat: GpxParser.toNumber(node.getAttribute('lat')),
      lon: GpxParser.toNumber(node.getAttribute('lon')),
    };
    // One pass over all descendants, extensions included
    for (const el of node.getElementsByTagName('*')) {
      const text = el.textContent;
      switch (el.localName) {
        case 'ele':
          point.ele = GpxParser.toNumber(text);
          break;
        case 'time':
          point.time = GpxParser.toTime(text);
          break;
        case 'hr':
          point.heartRate = GpxParser.toNumber(text);
          break;
        case 'cad':
          point.cadence = GpxParser.toNumber(text);
          break;
        case 'power':
          point.power = GpxParser.toNumber(text);
          break;
        case 'atemp':
        case 'temp':
          point.temperature = GpxParser.toNumber(text);
          break;
        case 'speed':
          point.speed = GpxParser.toNumber(text);
          break;
      }
    }
    return point;
  }
}
