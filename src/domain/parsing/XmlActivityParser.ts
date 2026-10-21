import { ActivityParser } from './ActivityParser';
import { ParseError } from './ParseError';

/** Shared XML helpers for GPX and TCX. Elements are matched by local name, so namespaces don't matter. */
export abstract class XmlActivityParser extends ActivityParser {
  protected parseXml(data: ArrayBuffer): Document {
    const text = new TextDecoder('utf-8').decode(data);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) throw new ParseError('corrupt');
    return doc;
  }

  /** Direct child element by local name. */
  protected static child(parent: Element, name: string): Element | undefined {
    for (const el of parent.children) if (el.localName === name) return el;
    return undefined;
  }

  protected static childText(parent: Element, name: string): string | undefined {
    return XmlActivityParser.child(parent, name)?.textContent?.trim() || undefined;
  }

  protected static childNumber(parent: Element, name: string): number | undefined {
    return XmlActivityParser.toNumber(XmlActivityParser.childText(parent, name));
  }

  protected static toNumber(text: string | null | undefined): number | undefined {
    if (text === null || text === undefined || text.trim() === '') return undefined;
    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
  }

  protected static toTime(text: string | null | undefined): number | undefined {
    if (!text) return undefined;
    const value = Date.parse(text.trim());
    return Number.isNaN(value) ? undefined : value;
  }
}
