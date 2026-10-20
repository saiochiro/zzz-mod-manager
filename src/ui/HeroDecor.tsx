import React from 'react';

/**
 * ZZZ-style poster dressing for page headers: halftone dots, a huge outlined
 * crew/faction watermark (from the active theme) and a hazard-stripe edge.
 * Purely decorative; the faction text comes from the --faction CSS variable.
 */
export const HeroDecor: React.FC = () => (
  <div className="hero-decor" aria-hidden="true">
    <span className="hero-decor__dots" />
    <span className="hero-decor__mark" />
    <span className="hero-decor__tape" />
  </div>
);
