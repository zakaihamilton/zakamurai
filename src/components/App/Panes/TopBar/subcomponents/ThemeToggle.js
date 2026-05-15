import { AppState } from '@/components/App/AppState';
import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from '../TopBar.module.css';

export default function ThemeToggle() {
  const appState = AppState.useState();
  const { theme } = appState;

  const toggleTheme = () => {
    appState((draft) => {
      draft.theme = draft.theme === 'light' ? 'dark' : 'light';
    });
  };

  return (
    <Tooltip
      content={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      shortcut={formatShortcut('⌃⇧T')}
    >
      <button
        type="button"
        onClick={toggleTheme}
        className={styles.themeToggle}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        data-testid="theme-toggle"
      >
        {theme === 'light' ? <Icons.Moon /> : <Icons.Sun />}
      </button>
    </Tooltip>
  );
}
