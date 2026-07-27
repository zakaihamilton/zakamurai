import React from 'react';
import styles from './Button.module.css';

export function BadButton({ label }) {
  return <button className={styles.btn} style={{ color: 'red' }}>{label}</button>;
}
