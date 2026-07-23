import React from 'react';

export default function Info(props) {
  return (
    <svg
      width={props.size || 14}
      height={props.size || 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke={props.stroke || 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
