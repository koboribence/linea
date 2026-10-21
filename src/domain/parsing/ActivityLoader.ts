import type { Activity } from '../activity/Activity';
import type { ActivityParser } from './ActivityParser';
import { ParseError } from './ParseError';

type ParserFactory = () => Promise<ActivityParser>;

/**
 * Entry point for reading activity files: unpacks .gz and picks the parser by extension.
 * Parsers are lazy-loaded, so the large FIT SDK is only downloaded when a FIT file arrives.
 */
export class ActivityLoader {
  static readonly ACCEPT = '.fit,.gpx,.tcx,.gz';

  private static readonly factories: Record<string, ParserFactory> = {
    fit: () => import('./FitParser').then((m) => new m.FitParser()),
    gpx: () => import('./GpxParser').then((m) => new m.GpxParser()),
    tcx: () => import('./TcxParser').then((m) => new m.TcxParser()),
  };

  private readonly parsers = new Map<string, Promise<ActivityParser>>();

  async loadFile(file: File): Promise<Activity> {
    return this.load(file.name, await file.arrayBuffer());
  }

  async load(fileName: string, data: ArrayBuffer): Promise<Activity> {
    let name = fileName.toLowerCase();
    if (name.endsWith('.gz')) {
      data = await ActivityLoader.gunzip(data);
      name = name.slice(0, -3);
    }

    const parser = await this.parserFor(name.split('.').pop() ?? '');
    try {
      return parser.parse(data);
    } catch (error) {
      if (error instanceof ParseError) throw error;
      throw new ParseError('corrupt', error instanceof Error ? error.message : String(error));
    }
  }

  /** Starts downloading parser code early, e.g. when a file is dragged over the page. */
  preload(): void {
    for (const extension of Object.keys(ActivityLoader.factories)) void this.parserFor(extension);
  }

  private parserFor(extension: string): Promise<ActivityParser> {
    const factory = ActivityLoader.factories[extension];
    if (!factory) {
      return Promise.reject(new ParseError('unsupported', `Unsupported: .${extension}`));
    }
    let parser = this.parsers.get(extension);
    if (!parser) {
      parser = factory();
      this.parsers.set(extension, parser);
    }
    return parser;
  }

  private static async gunzip(data: ArrayBuffer): Promise<ArrayBuffer> {
    try {
      const stream = new Response(data).body!.pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).arrayBuffer();
    } catch {
      throw new ParseError('corrupt', 'Invalid gzip data');
    }
  }
}
