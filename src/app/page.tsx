'use client';

import App from '@/components/App';
import AppErrorBoundary from '@/components/App/AppErrorBoundary';

export default function Home() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}
