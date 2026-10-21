import { useCallback, useRef, useState } from 'react';
import type { Activity } from '../domain/activity/Activity';
import { ActivityLoader } from '../domain/parsing/ActivityLoader';
import { ParseError, type ParseErrorCode } from '../domain/parsing/ParseError';
import type { ActivityStats } from '../domain/stats/ActivityStats';
import { StatsCalculator } from '../domain/stats/StatsCalculator';

export type FileState =
  | { status: 'idle' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; fileName: string; code: ParseErrorCode }
  | { status: 'ready'; fileName: string; activity: Activity; stats: ActivityStats };

const loader = new ActivityLoader();
const calculator = new StatsCalculator();

/** Loads a dropped file into an Activity and its stats; the latest file always wins. */
export function useActivityFile() {
  const [state, setState] = useState<FileState>({ status: 'idle' });
  const latestRequest = useRef(0);

  const open = useCallback(async (file: File) => {
    const request = ++latestRequest.current;
    setState({ status: 'loading', fileName: file.name });
    try {
      const activity = await loader.loadFile(file);
      const stats = calculator.calculate(activity);
      if (request === latestRequest.current) {
        setState({ status: 'ready', fileName: file.name, activity, stats });
      }
    } catch (error) {
      if (request !== latestRequest.current) return;
      const code = error instanceof ParseError ? error.code : 'corrupt';
      if (!(error instanceof ParseError)) console.error(error);
      setState({ status: 'error', fileName: file.name, code });
    }
  }, []);

  const preload = useCallback(() => loader.preload(), []);

  return { state, open, preload };
}
