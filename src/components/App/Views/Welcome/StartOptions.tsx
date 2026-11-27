import { useCallback } from 'react';
import { AppState } from '@/components/App/AppState';
import { LogState } from '@/components/App/Views/LogArea';
import { getProjectTemplates } from '@/components/Storage/InitialData';
import styles from './StartOptions.module.css';

export default function WelcomeStartOptions() {
  const appState = AppState.usePassiveState();
  const logState = LogState.useState(['isSystemProcessing', 'isAIProcessing']);
  const isProcessing = Boolean(logState?.isSystemProcessing || logState?.isAIProcessing);
  const templates = getProjectTemplates();

  const startWithTemplate = useCallback(
    (templateId: string) => {
      appState?.((draft) => {
        draft.projectActionRequest = {
          id: Date.now(),
          type: 'template',
          templateId,
        };
      });
    },
    [appState],
  );

  const openProjectLibrary = useCallback(() => {
    appState?.((draft) => {
      draft.projectActionRequest = { id: Date.now(), type: 'library' };
    });
  }, [appState]);

  return (
    <section className={styles.startOptions} aria-labelledby="start-options-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Start without a prompt</p>
          <h2 id="start-options-title">Choose a starting point</h2>
        </div>
        <button
          type="button"
          className={styles.libraryButton}
          onClick={openProjectLibrary}
          disabled={isProcessing}
        >
          Open saved project
        </button>
      </div>
      <div className={styles.templateGrid}>
        {templates.map((template, index) => (
          <article className={styles.templateCard} key={template.id}>
            <span className={styles.templateNumber}>{String(index + 1).padStart(2, '0')}</span>
            <h3>{template.name}</h3>
            <p>{template.description}</p>
            <button
              type="button"
              onClick={() => startWithTemplate(template.id)}
              disabled={isProcessing}
            >
              Use this template <span aria-hidden="true">→</span>
            </button>
          </article>
        ))}
      </div>
      <p className={styles.noAiNote}>
        Edit and build without AI. Projects stay in this browser; export a source ZIP to move one or
        open a local folder. Local AI is optional and downloads only when you choose to use it.
      </p>
    </section>
  );
}
