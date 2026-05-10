import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from '../TopBar.module.css';

export default function ThemeToggle({ theme, onToggle }) {
  return (
    <Tooltip
      content={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      shortcut={formatShortcut('⌘⇧T')}
    >
      <button type="button" onClick={onToggle} className={styles.themeToggle}>
        {theme === 'light' ? <Icons.Moon /> : <Icons.Sun />}
      </button>
    </Tooltip>
  );
}
