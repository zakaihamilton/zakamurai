import React from 'react';
import styles from './Button.module.css';

export function Button({ label }) {
  return <button className={styles.btn}>{label}</button>;
}
