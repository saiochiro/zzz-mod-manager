import { AlertCircle, CheckCircle2, Wrench } from 'lucide-react';
import type { ModHealthStatus, ModManifest } from '../shared/types';

export function getModHealth(mod: ModManifest): ModHealthStatus {
  return (
    mod.health_status ||
    (mod.missing_resources && mod.missing_resources.length > 0
      ? 'broken'
      : mod.broken_hashes.length > 0 || mod.needs_orfix || mod.needs_stride_fix
      ? 'fixable'
      : 'working')
  );
}

/** Plain-language labels — no hashes or file jargon on the surface. */
export const HEALTH_META: Record<
  ModHealthStatus,
  { label: string; tone: 'success' | 'warning' | 'error'; icon: typeof CheckCircle2; description: string }
> = {
  working: {
    label: 'Ready',
    tone: 'success',
    icon: CheckCircle2,
    description: 'Everything checks out. This mod is ready to use.',
  },
  fixable: {
    label: 'Needs update',
    tone: 'warning',
    icon: Wrench,
    description: 'Made for an older game version. One click updates it — a backup is kept automatically.',
  },
  broken: {
    label: 'Missing files',
    tone: 'error',
    icon: AlertCircle,
    description: 'Some files this mod needs are missing. Try re-downloading or reinstalling it.',
  },
};

export function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
