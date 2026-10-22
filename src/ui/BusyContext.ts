import { createContext, useContext, useEffect } from 'react';

interface Busy {
  /** A long job (making a video) is running: everything else is locked meanwhile */
  busy: boolean;
  setBusy: (busy: boolean) => void;
}

export const BusyContext = createContext<Busy>({ busy: false, setBusy: () => undefined });

export function useBusy(): boolean {
  return useContext(BusyContext).busy;
}

/**
 * Locks the app while `active` is true (a change mid-job would spoil its result), and asks
 * before the page is closed or reloaded.
 */
export function useLockWhile(active: boolean): void {
  const { setBusy } = useContext(BusyContext);
  useEffect(() => {
    if (!active) return;
    setBusy(true);
    const confirmLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', confirmLeave);
    return () => {
      setBusy(false);
      window.removeEventListener('beforeunload', confirmLeave);
    };
  }, [active, setBusy]);
}
