/** unsupported: unknown file type · corrupt: unreadable content · empty: no workout samples */
export type ParseErrorCode = 'unsupported' | 'corrupt' | 'empty';

/** Parsing failure with a code the UI can translate. */
export class ParseError extends Error {
  constructor(
    readonly code: ParseErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}
