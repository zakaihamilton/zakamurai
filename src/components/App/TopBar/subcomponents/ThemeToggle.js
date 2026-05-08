import React from 'react';
import { Icons } from '../../Icons';
import Tooltip from '../../../Widgets/Tooltip/Tooltip';
import styles from '../TopBar.module.css';

export default function ThemeToggle({ theme, onToggle }) {
  return (
    <Tooltip content={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
      <button type="button" onClick={onToggle} className={styles.themeToggle}>
        {theme === 'light' ? <Icons.Moon /> : <Icons.Sun />}
      </button>
    </Tooltip>
  );
}
