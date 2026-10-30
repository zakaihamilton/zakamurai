import { EditorState } from '@/components/App/Views/EditorArea';
import {
  createEffectivePreviewFileContentsSnapshot,
  mergeWorkspaceDiskFiles,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import { collectWorkspaceFiles } from '@/components/AI/Agent/Snapshot';
import { useFileSystem } from '@/components/Storage';
import { analyzeProjectHealth } from '@/contracts/project';
import { useEffect, useRef, useState } from 'react';
import { requireStore } from '../../types';
import styles from './Compatibility.module.css';

const statusLabel = {
  ready: 'Ready for browser build',
  warnings: 'Build may need attention',
  blocked: 'Fix project errors first',
} as const;

export default function ProjectCompatibility() {
  const fs = useFileSystem();
  const filesystemVersionRef = useRef(fs.version);
  filesystemVersionRef.current = fs.version;
  const editorState = requireStore(
    EditorState.useState([
      'fileContents',
      'dirtyBufferContents',
      'pendingDiffs',
      'pendingDeletions',
    ]),
  );
  const [report, setReport] = useState(() =>
    analyzeProjectHealth(createEffectivePreviewFileContentsSnapshot(editorState)),
  );
  useEffect(() => {
    const requestVersion = fs.version;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        let files = createEffectivePreviewFileContentsSnapshot(editorState);
        if (fs.mode === 'local' && fs.rootHandle) {
          const diskFiles = await collectWorkspaceFiles(
            { mode: 'local', rootHandle: fs.rootHandle },
            {},
          );
          if (cancelled || filesystemVersionRef.current !== requestVersion) return;
          files = mergeWorkspaceDiskFiles(diskFiles, editorState);
        }
        if (!cancelled && filesystemVersionRef.current === requestVersion) {
          setReport(analyzeProjectHealth(files));
        }
      } catch (error) {
        console.error('Failed to analyze project compatibility:', error);
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    fs.mode,
    fs.rootHandle,
    fs.version,
    editorState,
    editorState.dirtyBufferContents,
    editorState.fileContents,
    editorState.pendingDiffs,
    editorState.pendingDeletions,
  ]);
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
