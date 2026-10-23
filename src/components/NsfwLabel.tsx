import React from 'react';
import { FlaskConical } from 'lucide-react';
import { nsfwLevelOf, type NsfwLevel } from '../shared/nsfw';

interface Labeled {
  is_nsfw?: boolean;
  nsfw_level?: NsfwLevel;
  nsfw_checked?: boolean;
}

/**
 * Read-only badge for cards. Labels are decided by the scan pipeline only; there is no way
 * for users to change them. Nothing for SFW, "Experimental" for sanitized toggle mods, "18+" for NSFW.
 */
export const NsfwBadge: React.FC<{ item: Labeled; className?: string }> = ({ item, className = '' }) => {
  const level = nsfwLevelOf(item);
  if (level === 'sfw') return null;
  if (level === 'toggle') {
    return (
      <span
        className={`badge badge--warning nsfw-badge ${className}`}
        title="Experimental: a safe outfit with an optional NSFW toggle. Only its safe pictures are shown."
      >
        <FlaskConical />
        Experimental
      </span>
    );
  }
  return (
    <span className={`badge badge--error nsfw-badge ${className}`} title="NSFW">
      18+
    </span>
  );
};
