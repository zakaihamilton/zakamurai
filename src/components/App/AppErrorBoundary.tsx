'use client';

import { reportDiagnostic } from '@/components/Diagnostics';
import React, { type ErrorInfo, type ReactNode, type RefObject } from 'react';
import styles from './AppErrorBoundary.module.css';

type AppErrorBoundaryState = {
  error: Error | string | null;
};

type AppErrorBoundaryProps = {
  children?: ReactNode;
};

export default class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  headingRef: RefObject<HTMLHeadingElement | null>;

  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
    this.headingRef = React.createRef<HTMLHeadingElement>();
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info?.componentStack);
    reportDiagnostic({
      source: 'app',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      details: info?.componentStack || '',
    });
  }

  focusFallback() {
    this.headingRef.current?.focus();
  }

  componentDidMount() {
    if (this.state.error) this.focusFallback();
  }

  componentDidUpdate(_prevProps: AppErrorBoundaryProps, prevState: AppErrorBoundaryState) {
    if (this.state.error && !prevState.error) this.focusFallback();
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const details =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === 'string'
          ? error
          : 'An unexpected error occurred.';

    return (
      <div
        className={styles.root}
        role="alert"
        aria-labelledby="app-error-title"
        aria-describedby="app-error-details"
      >
        <div className={styles.card}>
          <h1 id="app-error-title" ref={this.headingRef} className={styles.title} tabIndex={-1}>
            Something went wrong
          </h1>
          <p className={styles.message}>
            The IDE hit an unexpected error. Try again to remount the workspace, or reload the page
            — your browser storage and any linked local folder should still be available.
          </p>
          <pre id="app-error-details" className={styles.details}>
            {details}
          </pre>
          <div className={styles.actions}>
            <button type="button" className={styles.retryBtn} onClick={this.handleRetry}>
              Try again
            </button>
            <button type="button" className={styles.reloadBtn} onClick={this.handleReload}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
