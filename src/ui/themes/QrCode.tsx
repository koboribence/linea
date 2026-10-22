import { useEffect, useState } from 'react';

/** QR code as an SVG; the encoder is loaded only when a code is first shown. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const [path, setPath] = useState<{ d: string; size: number }>();

  useEffect(() => {
    let cancelled = false;
    void import('uqr').then(({ encode }) => {
      if (cancelled) return;
      const { data, size } = encode(text, { ecc: 'M', border: 2 });
      // One path of 1×1 squares: small DOM, crisp at any size
      let d = '';
      data.forEach((row, y) =>
        row.forEach((dark, x) => {
          if (dark) d += `M${x},${y}h1v1h-1z`;
        }),
      );
      setPath({ d, size });
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!path) return <div className="qr qr--loading" aria-hidden="true" />;
  return (
    <svg
      className="qr"
      viewBox={`0 0 ${path.size} ${path.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={path.size} height={path.size} fill="#ffffff" />
      <path d={path.d} fill="#0e0f12" />
    </svg>
  );
}
