import type { ScreenPoint } from '../../domain/route/RouteShape';

/**
 * Projected route points (undefined = hidden) to drawable points: coloring values attached,
 * and a new line piece wherever hidden points were left out.
 */
export function toScreenRoute(
  projected: ({ x: number; y: number } | undefined)[],
  values?: number[],
): ScreenPoint[] {
  const points: ScreenPoint[] = [];
  let gap = false;
  projected.forEach((point, i) => {
    if (!point) {
      gap = points.length > 0;
      return;
    }
    points.push({ ...point, value: values?.[i], newSegment: gap || undefined });
    gap = false;
  });
  // A piece of a single point would show up as a stray dot
  return points.filter((point, i) => {
    const next = points[i + 1];
    const startsPiece = i === 0 || point.newSegment === true;
    const endsPiece = next === undefined || next.newSegment === true;
    return !(startsPiece && endsPiece);
  });
}
