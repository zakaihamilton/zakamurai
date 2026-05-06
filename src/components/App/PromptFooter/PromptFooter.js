import React, { useState } from 'react';
import { LogState } from '../LogArea';
import { SidebarState } from '../Sidebar';
import { TabState } from '../TabBar';
import styles from './PromptFooter.module.css';

export default function PromptFooter() {
  const [val, setVal] = useState('');
  const logState = LogState.useState();
  const { isProcessing } = logState;
  const sidebarState = SidebarState.useState();
  const { showAIInput } = sidebarState;
  const tabState = TabState.useState();

  if (!showAIInput) return null;

  const send = (e) => {
    e.preventDefault();
    if (!val.trim() || isProcessing) return;
    const userMsg = val;
    setVal('');

    logState((draft) => {
      draft.logs = [...draft.logs, { id: Date.now(), role: 'user', text: userMsg }];
      draft.isProcessing = true;
    });
    tabState((draft) => {
      draft.activeTabId = 'ai-logs';
    });

    setTimeout(() => {
      logState((draft) => {
        draft.logs = [
          ...draft.logs,
          {
            id: Date.now(),
            role: 'ai',
            text: `Command received: "${userMsg}". Parsing context and scaffolding requested structures.`,
          },
        ];
        draft.isProcessing = false;
      });
    }, 1500);
  };

  const isBtnActive = val.trim() && !isProcessing;

  return (
    <div className={styles.promptFooter}>
      <form onSubmit={send} className={styles.form}>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={isProcessing}
          placeholder="Command the Scaffolder..."
          className={styles.input}
        />
        <button
          type="submit"
          disabled={!isBtnActive}
          className={`${styles.button} ${isBtnActive ? styles.buttonActive : styles.buttonDisabled}`}
        >
          Execute
        </button>
      </form>
    </div>
  );
}
