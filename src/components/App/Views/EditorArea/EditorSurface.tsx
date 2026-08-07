import EditorContent from './EditorContent';
import styles from './EditorSurface.module.css';
import EditorTooling from './EditorTooling';
import type { EditorSurfaceProps } from './types';

/** Presentational editor shell; all state and event orchestration stays in the controller. */
export default function EditorSurface({ toolingProps, contentProps }: EditorSurfaceProps) {
  return (
    <div className={styles.surface}>
      <EditorTooling {...toolingProps} />
      <EditorContent {...contentProps} />
    </div>
  );
}
