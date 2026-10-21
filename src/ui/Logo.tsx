import { BRAND } from '../brand';

/** Wordmark: the brand name over a route line that starts with a ring and ends with a dot. */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 520 190" role="img" aria-label={BRAND.name}>
      <text x="2" y="138" className="logo__text">
        {BRAND.name.toUpperCase()}
      </text>
      <path className="logo__route" d="M14 168 C120 150 210 182 300 166 S440 150 500 162" />
      <circle className="logo__start" cx="14" cy="168" r="9" />
      <circle className="logo__finish" cx="500" cy="162" r="8" />
    </svg>
  );
}
