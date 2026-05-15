import { Icons } from '@/components/Core/Base/Icons';
import React, { useEffect, useRef, useState } from 'react';
import styles from './Select.module.css';

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
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const selectOption = (nextValue) => {
    onChange?.(nextValue);
    setIsOpen(false);
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
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
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
