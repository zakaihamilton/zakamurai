import Node from '@/components/state/Node';
import { createState } from '@/components/state/State';
import { Icons } from '@/components/ui/Icons';
import React, { useEffect, useRef } from 'react';
import styles from './Select.module.css';

const SelectState = createState('SelectState');

export default function Select({
  id,
  label,
  value,
  options = [],
  onChange,
  disabled = false,
  tabIndex,
  className = '',
}) {
  return (
    <Node id={id || 'Select'}>
      <SelectInner
        id={id}
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        disabled={disabled}
        tabIndex={tabIndex}
        className={className}
      />
    </Node>
  );
}

function SelectInner({
  id,
  label,
  value,
  options = [],
  onChange,
  disabled = false,
  tabIndex,
  className = '',
}) {
  const selectState = SelectState.useState(null, { isOpen: false });
  const { isOpen = false } = selectState || {};
  const wrapperRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        selectState((draft) => {
          draft.isOpen = false;
        });
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, selectState]);

  const selectOption = (nextValue) => {
    onChange?.(nextValue);
    selectState((draft) => {
      draft.isOpen = false;
    });
  };

  return (
    <div className={`${styles.field} ${className}`} ref={wrapperRef}>
      {label && (
        <span className={styles.label} id={id ? `${id}-label` : undefined}>
          {label}
        </span>
      )}
      <div className={styles.control}>
        <button
          id={id}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-labelledby={id && label ? `${id}-label ${id}` : undefined}
          disabled={disabled}
          className={styles.trigger}
          onClick={() =>
            selectState((draft) => {
              draft.isOpen = !draft.isOpen;
            })
          }
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              selectState((draft) => {
                draft.isOpen = false;
              });
            }
          }}
          tabIndex={tabIndex}
        >
          <span className={styles.triggerText}>{selectedOption?.label}</span>
          <Icons.ChevronDown />
        </button>
        {isOpen && !disabled && (
          <div className={styles.menu} aria-labelledby={id ? `${id}-label` : undefined}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={option.value === value}
                className={`${styles.option} ${option.value === value ? styles.optionSelected : ''}`}
                onClick={() => selectOption(option.value)}
              >
                <span className={styles.optionHeader}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {(option.badges?.length > 0 || option.badge) && (
                    <span className={styles.optionBadges}>
                      {(option.badges || [option.badge]).filter(Boolean).map((badge) => (
                        <span key={badge} className={styles.optionBadge}>
                          {badge}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                {option.description && (
                  <span className={styles.optionDescription}>{option.description}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
