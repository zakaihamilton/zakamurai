import { EditorState } from '@/components/App/Views/EditorArea';
import { createEffectiveFileContentsSnapshot } from '@/components/App/Views/EditorArea/EditorBuffers';
import { analyzeProjectHealth } from '@/contracts/project';
import { useEffect, useState } from 'react';
import { requireStore } from '../../types';
import styles from './Compatibility.module.css';

const statusLabel = {
  ready: 'Ready for browser build',
  warnings: 'Build may need attention',
  blocked: 'Fix project errors first',
} as const;

export default function ProjectCompatibility() {
  const editorState = requireStore(EditorState.useState(['fileContents', 'dirtyBufferContents']));
  const [report, setReport] = useState(() =>
    analyzeProjectHealth(createEffectiveFileContentsSnapshot(editorState)),
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setReport(analyzeProjectHealth(createEffectiveFileContentsSnapshot(editorState)));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [editorState, editorState.dirtyBufferContents, editorState.fileContents]);
  const visibleItems = report.items.slice(0, 8);

  return (
    <section className={styles.panel} aria-label="Project compatibility">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Runtime readiness</span>
          <h2>{statusLabel[report.status]}</h2>
        </div>
        <span className={`${styles.badge} ${styles[report.status]}`}>{report.status}</span>
      </div>
      <p className={styles.summary}>
        {report.compatibility.browserBuild
          ? 'The build script matches Zakamurai’s browser bundler.'
          : 'Zakamurai can preview this project, but its build/runtime support may be limited.'}
      </p>
      {visibleItems.length > 0 ? (
        <ul className={styles.items}>
          {visibleItems.map((item) => (
            <li key={`${item.code}-${item.path || ''}`} className={styles[item.severity]}>
              <strong>{item.severity}</strong>
              <span>{item.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.clear}>No compatibility warnings detected.</p>
      )}
      {report.compatibility.unsupportedDependencies.length > 0 && (
        <p className={styles.note}>
          Review these dependencies: {report.compatibility.unsupportedDependencies.join(', ')}
        </p>
      )}
    </section>
  );
}
