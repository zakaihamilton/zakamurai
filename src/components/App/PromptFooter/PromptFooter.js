import React, { useState } from 'react';
import { ZakamuraiState } from '../State';
import styles from './PromptFooter.module.css';

export default function PromptFooter() {
  const [val, setVal] = useState('');
  const state = ZakamuraiState.useState();
  if (!state.showAIInput) return null;

  const send = (e) => {
    e.preventDefault();
    if (!val.trim() || state.isProcessing) return;
    const userMsg = val;
    setVal('');

    state((draft) => {
      draft.logs = [...draft.logs, { id: Date.now(), role: 'user', text: userMsg }];
      draft.isProcessing = true;
      draft.activeTabId = 'ai-logs';
    });

    setTimeout(() => {
      state((draft) => {
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

  const isBtnActive = val.trim() && !state.isProcessing;

  return (
    <div className={styles.promptFooter}>
      <form onSubmit={send} className={styles.form}>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={state.isProcessing}
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
