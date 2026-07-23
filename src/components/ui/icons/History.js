import React from 'react';

export default function History(props) {
  return (
    <svg
      width={props?.size || 14}
      height={props?.size || 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke={props?.stroke || 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <line x1="12" x2="12" y1="12" y2="7" />
      <polyline points="12 12 16 14" />
    </svg>
  );
}
