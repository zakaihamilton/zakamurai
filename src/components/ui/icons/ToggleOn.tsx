import type { IconProps } from '../types';

export default function ToggleOn(_props: IconProps = {}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2"
    >
      <rect x="1" y="5" width="22" height="14" rx="7" />
      <circle cx="16" cy="12" r="4" fill="currentColor" />
    </svg>
  );
}
