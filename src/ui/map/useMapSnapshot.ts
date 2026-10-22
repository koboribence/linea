import { useEffect, useRef, useState } from 'react';
import type { MapStyleId } from '../../domain/map/MapStyles';
import type { RouteShape } from '../../domain/route/RouteShape';
import { StillMap, type StillRequest, type StillResult } from './StillMap';

interface Snapshot {
  /** Which request the result belongs to */
  key: string;
  result?: StillResult;
  failed: boolean;
}

export interface MapSnapshotState {
  result?: StillResult;
  loading: boolean;
  failed: boolean;
}

/**
 * The still 3D map for the image background. Only size, map style and the route's geometry
 * cause a new render; the previous image stays visible until the new one is ready.
 */
export function useMapSnapshot(
  enabled: boolean,
  route: RouteShape | undefined,
  size: { width: number; height: number },
  style: MapStyleId,
): MapSnapshotState {
  const stillMap = useRef<StillMap>(undefined);
  const [snapshot, setSnapshot] = useState<Snapshot>();

  const request: StillRequest | undefined =
    enabled && route ? { ...size, style, route: route.geo } : undefined;
  const key = request ? StillMap.key(request) : '';

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    stillMap.current ??= new StillMap();
    stillMap.current
      .render(request)
      .then((result) => !cancelled && setSnapshot({ key, result, failed: false }))
      .catch(() => {
        if (!cancelled)
          setSnapshot((previous) => ({ key, result: previous?.result, failed: true }));
      });
    return () => {
      cancelled = true;
    };
    // The key covers everything the request depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The off-screen map lives as long as the editor
  useEffect(() => () => stillMap.current?.destroy(), []);

  if (!request) return { loading: false, failed: false };
  const current = snapshot?.key === key;
  return {
    result: snapshot?.result,
    loading: !current,
    failed: current && snapshot.failed,
  };
}
