import React from 'react';
import logoStyles from '../Icons.module.css';

export default function ZLogo({ size = 32, className = '', style = {} }) {
  return (
    <div
      className={`${logoStyles.zLogo} ${className}`}
      style={{
        '--logo-size': `${size}px`,
        '--logo-radius': `${Math.max(2, Math.round(size * 0.25))}px`,
        '--logo-font-size': `${Math.round(size * 0.56)}px`,
        ...style,
      }}
    >
      Z
    </div>
  );
}
