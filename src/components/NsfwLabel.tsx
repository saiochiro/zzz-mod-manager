import React from 'react';
import { nsfwLevelOf, type NsfwLevel } from '../shared/nsfw';

interface Labeled {
  is_nsfw?: boolean;
  nsfw_level?: NsfwLevel;
  nsfw_checked?: boolean;
}

/**
 * Read-only badge for cards. Labels come from the pre-scanned list only; users can't change them.
 * Nothing for SFW, "18+" for anything else (the Experimental tier is on hold and counts as NSFW).
 */
export const NsfwBadge: React.FC<{ item: Labeled; className?: string }> = ({ item, className = '' }) => {
  if (nsfwLevelOf(item) === 'sfw') return null;
  return (
    <span className={`badge badge--error nsfw-badge ${className}`} title="NSFW">
      18+
    </span>
  );
};
