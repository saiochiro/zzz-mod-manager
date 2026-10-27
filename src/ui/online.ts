import { useEffect, useState } from 'react';

/** True while the computer has a network connection (as far as the browser can tell). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = typeof err === 'string' ? err : (err as Error)?.message || String(err ?? '');
  return OFFLINE_RE.test(msg);
}
