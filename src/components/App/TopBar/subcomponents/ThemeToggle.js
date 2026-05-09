import React from 'react';
import Tooltip from '../../../Widgets/Tooltip/Tooltip';
import { Icons } from '../../Icons';
import styles from '../TopBar.module.css';

export default function ThemeToggle({ theme, onToggle }) {
  return (
    <Tooltip content={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} shortcut="⌘⇧T">
      <button type="button" onClick={onToggle} className={styles.themeToggle}>
        {theme === 'light' ? <Icons.Moon /> : <Icons.Sun />}
      </button>
    </Tooltip>
  );
}
