import { type ManagerTrace, createManagerReplayFixtureFromTrace } from '@/components/AI/Agent';
import type { FileMap } from '@/components/AI/types';
import styles from './ManagerTraceInspector.module.css';

type ManagerTraceInspectorProps = {
  trace: ManagerTrace | null;
  files?: FileMap;
  onReplayRequest?: (request: string) => void;
};

const formatEventDetail = (trace: ManagerTrace, sequence: number): string => {
  const event = trace.events.find((item) => item.sequence === sequence);
  if (!event) return '';
  return [event.tool, event.task, event.message, event.errorCode].filter(Boolean).join(' · ');
};

export default function ManagerTraceInspector({
  trace,
  files = {},
  onReplayRequest,
}: ManagerTraceInspectorProps) {
  if (process.env.NODE_ENV === 'production' || !trace) return null;

  const exportTrace = () => {
    const json = JSON.stringify(trace, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const urlApi = URL as unknown as {
      createObjectURL?: (value: Blob) => string;
      revokeObjectURL?: (value: string) => void;
    };
    const createObjectURL = urlApi.createObjectURL;
    const revokeObjectURL = urlApi.revokeObjectURL;
    const url = createObjectURL
      ? createObjectURL(blob)
      : `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${trace.runId}.json`;
    link.click();
    if (createObjectURL) revokeObjectURL?.(url);
  };

  const copy = async (value: string) => {
    await navigator.clipboard?.writeText(value);
  };

  const copyTrace = () => copy(JSON.stringify(trace, null, 2));
  const copyReplayFixture = () =>
    copy(JSON.stringify(createManagerReplayFixtureFromTrace(trace, files), null, 2));

  return (
    <details className={styles.panel} data-testid="manager-trace-inspector">
      <summary className={styles.summary}>Manager debug trace</summary>
      <div className={styles.toolbar}>
        <p className={styles.meta}>
          {trace.outcome} · {trace.events.length} events · {trace.durationMs ?? 0} ms
        </p>
        <button type="button" className={styles.button} onClick={exportTrace}>
          Export JSON
        </button>
        <button type="button" className={styles.button} onClick={copyTrace}>
          Copy trace
        </button>
        <button type="button" className={styles.button} onClick={copyReplayFixture}>
          Copy replay fixture
        </button>
        {onReplayRequest && (
          <button
            type="button"
            className={styles.button}
            onClick={() => onReplayRequest(trace.request)}
          >
            Replay request
          </button>
        )}
      </div>
      <ul className={styles.events}>
        {trace.events.map((event) => (
          <li
            key={event.sequence}
            className={`${styles.event} ${event.status === 'failed' ? styles.eventError : ''}`}
          >
            <span className={styles.eventLabel}>
              #{event.sequence} {event.phase} · {event.elapsedMs} ms
            </span>
            <span className={styles.eventDetail}>{formatEventDetail(trace, event.sequence)}</span>
            {event.input && <span className={styles.eventDetail}>input: {event.input}</span>}
            {event.output && <span className={styles.eventDetail}>output: {event.output}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
