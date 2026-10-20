import React, { useMemo } from 'react';
import { getTheme } from '../themes/registry';
import { buildAppIconSvg, svgToDataUrl } from '../themes/appIcon';

interface ThemeIconProps {
  themeId: string;
  size?: number;
  className?: string;
}

/** The app icon, tinted for the given theme. */
export const ThemeIcon: React.FC<ThemeIconProps> = ({ themeId, size = 32, className = '' }) => {
  const theme = getTheme(themeId);
  const src = useMemo(() => svgToDataUrl(buildAppIconSvg(theme, { simplified: size <= 24, small: size <= 48 })), [theme, size]);
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
};
