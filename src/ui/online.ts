import { useEffect, useState } from 'react';

/** True when the browser reports no network connection (false where there is no navigator). */
export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** True while the computer has a network connection (as far as the browser can tell). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => !isBrowserOffline());
  useEffect(() => {
    const update = () => setOnline(!isBrowserOffline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** Errors that mean "no internet" rather than "the site said no". */
const OFFLINE_RE = /offline|failed to fetch|fetch failed|network|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|getaddrinfo|internet/i;

export function isOfflineError(err: unknown): boolean {
  if (isBrowserOffline()) return true;
  const msg = typeof err === 'string' ? err : (err as Error)?.message || String(err ?? '');
  return OFFLINE_RE.test(msg);
}
