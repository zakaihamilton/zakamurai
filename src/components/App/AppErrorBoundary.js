'use client';

import { reportDiagnostic } from '@/components/Diagnostics';
import React from 'react';
import styles from './AppErrorBoundary.module.css';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.headingRef = React.createRef();
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info?.componentStack);
    reportDiagnostic({
      source: 'app',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      details: info?.componentStack || '',
    });
  }

  focusFallback() {
    // Move focus into the fallback so keyboard / screen-reader users land here.
    this.headingRef.current?.focus();
  }

  componentDidMount() {
    // First paint can already be the fallback when a child throws on mount.
    if (this.state.error) this.focusFallback();
  }

  componentDidUpdate(_prevProps, prevState) {
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
