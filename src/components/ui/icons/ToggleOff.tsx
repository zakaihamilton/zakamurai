import type { IconProps } from '../types';

export default function ToggleOff(_props: IconProps = {}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-muted)"
      strokeWidth="2"
    >
      <rect x="1" y="5" width="22" height="14" rx="7" />
      <circle cx="8" cy="12" r="4" />
    </svg>
  );
}
