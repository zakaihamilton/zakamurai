'use client';

import React from 'react';
import styles from './AppErrorBoundary.module.css';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
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
      <div className={styles.root} role="alert">
        <div className={styles.card}>
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.message}>
            The IDE hit an unexpected error. You can reload to continue working — your browser
            storage and any linked local folder should still be available.
          </p>
          <pre className={styles.details}>{details}</pre>
          <button type="button" className={styles.reloadBtn} onClick={this.handleReload}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
