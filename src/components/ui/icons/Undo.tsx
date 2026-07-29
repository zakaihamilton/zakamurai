import React from 'react';
import type { IconProps } from '../types';

export default function Undo(_props: IconProps = {}) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 10h10a8 8 0 0 1 8 8v2" />
      <polyline points="7 14 3 10 7 6" />
    </svg>
  );
}
