import { useEffect, useRef } from 'react';
import { BRAND } from '../../brand';
import { useLocale } from '../../i18n/LocaleContext';
import type { ExportState } from './useFlyover';

/** Phones and tablets: the app must stay in front while a video is made. */
export function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** Whether this browser can show a system notification, and hasn't been told not to. */
export function canNotify(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission !== 'denied';
}

/**
 * Keeps the person informed while a video is made, so they needn't watch the progress:
 * the percentage in the tab title, the screen kept awake on phones, and when it's done a
 * notification (if they asked for one and are on another tab), a ✓ in the title and a short
 * vibration.
 */
export function useExportAttention(state: ExportState, notify: boolean): void {
  const { i18n } = useLocale();
  const rendering = state.status === 'rendering';
  const percent = rendering ? Math.round(state.share * 100) : 0;

  // Progress in the tab title, readable from another tab
  useEffect(() => {
    if (!rendering) return;
    document.title = `${percent}% · ${BRAND.name}`;
  }, [rendering, percent]);

  // Keep the screen on: a sleeping phone would stop the work
  useEffect(() => {
    if (!rendering || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let released = false;
    navigator.wakeLock
      .request('screen')
      .then((sentinel) => {
        if (released) void sentinel.release();
        else lock = sentinel;
      })
      .catch(() => undefined);
    return () => {
      released = true;
      void lock?.release();
    };
  }, [rendering]);

  // Done (or stopped): tell the person once, then put the title back when they look
  const wasRendering = useRef(false);
  useEffect(() => {
    const finished = wasRendering.current && !rendering;
    wasRendering.current = rendering;
    if (!finished) {
      if (!rendering) document.title = BRAND.name;
      return;
    }
    if (state.status !== 'done') {
      document.title = BRAND.name;
      return;
    }
    const message = i18n.t('video.doneNotice');
    navigator.vibrate?.(200);
    if (!document.hidden) {
      document.title = BRAND.name;
      return;
    }
    document.title = `✓ ${message} · ${BRAND.name}`;
    if (notify) void showNotification(message, BRAND.name);
    const restore = () => {
      if (document.hidden) return;
      document.title = BRAND.name;
      document.removeEventListener('visibilitychange', restore);
    };
    document.addEventListener('visibilitychange', restore);
    return () => document.removeEventListener('visibilitychange', restore);
  }, [rendering, state.status, notify, i18n]);
}

/** A system notification; through the service worker where there is one (needed on Android). */
async function showNotification(body: string, title: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(title, { body, icon: '/favicon.svg' });
    else new Notification(title, { body, icon: '/favicon.svg' }).onclick = () => window.focus();
  } catch {
    // A notification is a courtesy; the ✓ in the title is still there
  }
}
