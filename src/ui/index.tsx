import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, Search, X, XCircle } from 'lucide-react';
import { Motif } from '../themes/Motif';
import type { MotifKind } from '../themes/types';

/* ------------------------------------------------------------------ */
/* Click-outside popover state                                        */
/* ------------------------------------------------------------------ */
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      // Panels drawn on top of the app (portals) count as inside.
      if (target?.closest?.('[data-popover-portal]')) return;
      if (ref.current && !ref.current.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/** Closes on Escape — used by modals and drawers. */
export function useEscape(handler: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handler, active]);
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */
export type ToastTone = 'success' | 'info' | 'warning' | 'error';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  duration: number;
  action?: { label: string; onClick: () => void };
}
type Notify = (t: {
  tone?: ToastTone;
  title: string;
  message?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}) => void;

const ToastCtx = createContext<Notify>(() => {});
export const useToast = () => useContext(ToastCtx);

const TONE_ICON: Record<ToastTone, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setItems((p) => p.filter((t) => t.id !== id)), []);

  const notify = useCallback<Notify>(
    ({ tone = 'info', title, message, duration, action }) => {
      const id = ++idRef.current;
      const d = duration ?? (tone === 'error' ? 8000 : 4500);
      setItems((p) => [...p.slice(-3), { id, tone, title, message, duration: d, action }]);
      window.setTimeout(() => dismiss(id), d);
    },
    [dismiss]
  );

  return (
    <ToastCtx.Provider value={notify}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = TONE_ICON[t.tone];
          return (
            <div key={t.id} className={`toast toast--${t.tone}`}>
              <Icon />
              <div className="toast__body">
                <div className="toast__title">{t.title}</div>
                {t.message && <div className="muted">{t.message}</div>}
                {t.action && (
                  <button
                    className="btn btn--soft btn--sm"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button className="icon-btn icon-btn--sm" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X />
              </button>
              <span className="toast__timer" style={{ animationDuration: `${t.duration}ms` }} />
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
};

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */
export const Switch: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
  size?: 'md' | 'lg';
  disabled?: boolean;
}> = ({ checked, onChange, label, size = 'md', disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={label}
    disabled={disabled}
    className={`switch ${size === 'lg' ? 'switch--lg' : ''}`}
    onClick={(e) => {
      e.stopPropagation();
      onChange();
    }}
  />
);

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode; title?: string }>;
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const el = wrap.querySelector<HTMLButtonElement>(`button[data-value="${CSS.escape(value)}"]`);
      setInd(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel} ref={wrapRef}>
      {ind && <span className="segmented__indicator" style={{ left: ind.left, width: ind.width }} />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          data-value={o.value}
          title={o.title}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  autoFocus?: boolean;
}> = ({ value, onChange, placeholder, className = '', autoFocus }) => (
  <label className={`search ${className}`}>
    <Search />
    <span className="sr-only">{placeholder}</span>
    <input
      className="input"
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && value) {
          e.stopPropagation();
          onChange('');
        }
      }}
    />
    {value && (
      <button type="button" className="icon-btn icon-btn--sm search__clear" onClick={() => onChange('')} aria-label="Clear search">
        <X />
      </button>
    )}
  </label>
);

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */
export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: 'brand' | 'muted' | 'error';
  motif?: MotifKind;
  compact?: boolean;
}> = ({ icon, title, children, actions, tone = 'brand', motif, compact }) => (
  <div className="empty" style={compact ? { padding: '32px 24px' } : undefined}>
    {motif && <Motif kind={motif} className="empty__motif" bias="edges" density={16} opacity={0.35} seed={title} />}
    <div className={`empty__art ${tone === 'error' ? 'empty__art--error' : tone === 'muted' ? 'empty__art--muted' : ''}`}>
      {icon}
    </div>
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {actions && <div className="empty__actions">{actions}</div>}
  </div>
);

export const Skeleton: React.FC<{ w?: number | string; h?: number | string; r?: number; style?: React.CSSProperties }> = ({
  w = '100%',
  h = 14,
  r,
  style,
}) => <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;

export const CardSkeletonGrid: React.FC<{ count?: number; className?: string }> = ({ count = 8, className = 'mod-grid' }) => (
  <div className={className} aria-busy="true" aria-label="Loading">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card" style={{ overflow: 'hidden' }}>
        <Skeleton h={0} r={0} style={{ aspectRatio: '16 / 10', height: 'auto' }} />
        <div className="stack" style={{ padding: 16 }}>
          <Skeleton w="72%" h={14} />
          <Skeleton w="40%" h={12} />
        </div>
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  size?: 'md' | 'wide' | 'xl';
  labelledBy?: string;
  children: React.ReactNode;
}> = ({ open, onClose, size = 'md', labelledBy, children }) => {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal ${size === 'wide' ? 'modal--wide' : size === 'xl' ? 'modal--xl' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Images with graceful fallback                                       */
/* ------------------------------------------------------------------ */
function initials(title: string): string {
  const words = title
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return (words[0]?.[0] ?? '?').toUpperCase() + (words[1]?.[0] ?? '').toUpperCase();
}

/** Shows the image, or a themed gradient + motif + initials if it's missing or fails. */
export const ThumbImage: React.FC<{
  src?: string | null;
  alt: string;
  motif: MotifKind;
  className?: string;
  loading?: 'lazy' | 'eager';
}> = ({ src, alt, motif, className, loading = 'lazy' }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className="thumb-fallback" aria-label={alt} role="img">
        <Motif kind={motif} bias="edges" density={12} opacity={0.6} seed={alt} />
        <span className="thumb-fallback__initials">{initials(alt)}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
};

export const Avatar: React.FC<{
  src?: string | null;
  fallbackSrc?: string | null;
  alt: string;
  size?: 'md' | 'lg';
  live?: boolean;
  icon?: React.ReactNode;
}> = ({ src, fallbackSrc, alt, size = 'md', live, icon }) => {
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [src, fallbackSrc]);
  const current = stage === 0 ? src || fallbackSrc : stage === 1 ? fallbackSrc : null;
  return (
    <span className={`avatar ${size === 'lg' ? 'avatar--lg' : ''}`}>
      {icon ? (
        icon
      ) : current ? (
        <img src={current} alt={alt} draggable={false} onError={() => setStage((s) => s + 1)} />
      ) : (
        <span style={{ fontWeight: 700, fontSize: 13 }}>{initials(alt)}</span>
      )}
      {live && <span className="avatar__live" />}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Misc helpers                                                        */
/* ------------------------------------------------------------------ */
export function formatCount(n: number | undefined | null): string {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(v);
}

export function relativeTime(input: string | number | Date | undefined): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)} d ago`;
  return d.toLocaleDateString();
}

export function useMediaQuery(query: string): boolean {
  const get = () => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useMemo(() => ((...args: any[]) => ref.current(...args)) as T, []);
}

/** "1.6.0 // extra notes" → "1.6.0" */
export function shortVersion(v?: string): string {
  return (v || '').split('//')[0].trim() || '—';
}
