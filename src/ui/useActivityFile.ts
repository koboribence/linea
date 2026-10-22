import { useCallback, useRef, useState } from 'react';
import type { Activity } from '../domain/activity/Activity';
import { ActivityLoader } from '../domain/parsing/ActivityLoader';
import { ParseError, type ParseErrorCode } from '../domain/parsing/ParseError';

export type FileState =
  | { status: 'idle' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; fileName: string; code: ParseErrorCode }
  | { status: 'ready'; fileName: string };

/** The last successfully loaded activity; stays on screen while another file loads or fails. */
export interface LoadedActivity {
  activity: Activity;
  /** Changes with every load, so the editor can reset for a new file */
  loadId: number;
}

const loader = new ActivityLoader();

/** Loads a dropped file into an Activity; the latest file always wins. */
export function useActivityFile() {
  const [state, setState] = useState<FileState>({ status: 'idle' });
  const [loaded, setLoaded] = useState<LoadedActivity>();
  const latestRequest = useRef(0);

  const open = useCallback(async (file: File) => {
    const request = ++latestRequest.current;
    setState({ status: 'loading', fileName: file.name });
    try {
      const activity = await loader.loadFile(file);
      if (request === latestRequest.current) {
        setLoaded({ activity, loadId: request });
        setState({ status: 'ready', fileName: file.name });
      }
    } catch (error) {
      if (request !== latestRequest.current) return;
      const code = error instanceof ParseError ? error.code : 'corrupt';
      if (!(error instanceof ParseError)) console.error(error);
      setState({ status: 'error', fileName: file.name, code });
    }
  }, []);

  const preload = useCallback(() => loader.preload(), []);

  return { state, loaded, open, preload };
}
