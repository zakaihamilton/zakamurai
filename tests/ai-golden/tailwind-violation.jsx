import React from 'react';

export function BadButton({ label }) {
  return (
    <button type="button" className="bg-blue-500 text-white p-2 flex">
      {label}
    </button>
  );
}
