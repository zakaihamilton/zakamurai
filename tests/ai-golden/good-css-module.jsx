import React from 'react';
import styles from './Button.module.css';

export function Button({ label }) {
  return (
    <button type="button" className={styles.btn}>
      {label}
    </button>
  );
}
