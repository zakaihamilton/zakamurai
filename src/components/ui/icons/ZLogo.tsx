import React from 'react';
import type { IconProps } from '../types';
import styles from './ZLogo.module.css';

export default function ZLogo({ size = 32, className = '' }: IconProps = {}) {
  return (
    <div
      className={`${styles.zLogo} ${className}`}
      style={{
        '--logo-size': `${size}px`,
        '--logo-radius': `${Math.max(2, Math.round(size * 0.25))}px`,
        '--logo-font-size': `${Math.round(size * 0.56)}px`,
      }}
    >
      Z
    </div>
  );
}
