import React from 'react';
import type { IconProps } from '../types';

export default function Brain({ size = 14 }: IconProps = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 2a2.5 2.5 0 0 1 2.5 2.5V10" />
      <path d="M14.5 2a2.5 2.5 0 0 0-2.5 2.5V10" />
      <path d="M18 9a4.5 4.5 0 0 1 0 9" />
      <path d="M6 9a4.5 4.5 0 0 0 0 9" />
      <path d="M12 10.5v1.5" />
      <path d="M12 16v2" />
      <path d="M9 13H5" />
      <path d="M19 13h-4" />
      <path d="M9 20a2 2 0 0 1 0-4h3" />
      <path d="M15 20a2 2 0 0 0 0-4h-3" />
    </svg>
  );
}
