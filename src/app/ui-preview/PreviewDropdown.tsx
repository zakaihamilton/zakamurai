'use client';

import { useRef } from 'react';
import styles from './PreviewDropdown.module.css';

type PreviewOption = { value: string; label: string };

export default function PreviewDropdown({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: PreviewOption[];
  onSelect: (value: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const selected = options.find((option) => option.value === value);
  const close = (restoreFocus = false) => {
    if (!detailsRef.current) return;
    detailsRef.current.open = false;
    if (restoreFocus) triggerRef.current?.focus();
  };

  return (
    <details
      ref={detailsRef}
      className="ui-preview-dropdown"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(true);
        } else if (event.key === 'Tab') {
          window.setTimeout(() => {
            const details = detailsRef.current;
            const activeElement = document.activeElement;
            if (details && activeElement instanceof Node && !details.contains(activeElement)) {
              details.open = false;
            }
          }, 0);
        }
      }}
    >
      <summary ref={triggerRef} className="ui-preview-dropdown__trigger">
        <span className="ui-preview-dropdown__label">{label}</span>
        <span className="ui-preview-dropdown__value">{selected?.label ?? value}</span>
        <span className="ui-preview-dropdown__chevron" aria-hidden="true" />
      </summary>
      <fieldset
        className={`${styles.menu} ui-preview-dropdown__menu`}
        aria-label={`${label} options`}
      >
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              className="ui-preview-dropdown__option"
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                onSelect(option.value);
                close(true);
              }}
            >
              <span>{option.label}</span>
              <span className="ui-preview-dropdown__mark" aria-hidden="true">
                {isSelected ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </fieldset>
    </details>
  );
}
