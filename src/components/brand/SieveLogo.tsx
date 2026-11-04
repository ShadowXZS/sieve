/**
 * Sieve Brand Vector Logo Component (Brand Symmetry)
 *
 * Wraps /sieve.svg with scalable dimensional tokens (xs to hero),
 * contrast adaptation (dark/light), and accessible role="img" ARIA declarations.
 */

import React from 'react';

export type SieveLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
export type SieveLogoContrast = 'default' | 'dark' | 'light';

export interface SieveLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: SieveLogoSize;
  contrast?: SieveLogoContrast;
  className?: string;
  alt?: string;
  animate?: boolean;
  onClick?: () => void;
}

const SIZE_MAP: Record<SieveLogoSize, string> = {
  xs: 'w-4 h-4',
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-12 h-12',
  hero: 'w-20 h-20',
};

export const SieveLogo: React.FC<SieveLogoProps> = ({
  size = 'md',
  contrast = 'default',
  className = '',
  alt = 'Sieve Vector Logo',
  animate = false,
  onClick,
  ...restProps
}) => {
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;

  const contrastClass =
    contrast === 'light'
      ? 'contrast-light brightness-110 drop-shadow-sm'
      : contrast === 'dark'
      ? 'contrast-dark brightness-95 filter'
      : 'brightness-100';

  const animationClass = animate ? 'animate-pulse transition-transform duration-300' : 'transition-transform duration-150 ease-out';

  return (
    <img
      role="img"
      src="/sieve.svg"
      alt={alt}
      aria-label={alt}
      data-size={size}
      data-contrast={contrast}
      onClick={onClick}
      className={`object-contain select-none ${sizeClass} ${contrastClass} ${animationClass} size-${size} ${className}`}
      {...restProps}
    />
  );
};
