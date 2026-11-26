import type { IconProps } from '../types';
import styles from './ZLogo.module.css';

export default function ZLogo({ size = 32, className = '' }: IconProps = {}) {
  return (
    <div
      className={`${styles.zLogo} ${className}`}
      aria-hidden="true"
      style={{
        '--logo-size': `${size}px`,
        '--logo-radius': `${Math.max(2, Math.round(size * 0.25))}px`,
        '--logo-font-size': `${Math.round(size * 0.56)}px`,
      }}
    >
      <svg
        width="56%"
        height="56%"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5 5H19L6.5 19H19"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </div>
  );
}
