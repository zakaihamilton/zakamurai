'use client';

import App from '@/components/App';
import AppErrorBoundary from '@/components/App/AppErrorBoundary';
import { StateRoot } from 'triactor';

export default function Home() {
  return (
    <StateRoot>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StateRoot>
  );
}
