'use client';

import App from '@/components/App';
import AppErrorBoundary from '@/components/App/AppErrorBoundary';
import { VisitoringProvider } from 'visitoring';
import { StateRoot } from 'triactor';

const VISITORING_SITE_KEY = 'vk_ECTBdX_1LON-AA9iBUzKmF_J7WImUSDl';

export default function Home() {
  const app = (
    <StateRoot>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StateRoot>
  );

  if (process.env.NODE_ENV !== 'production') return app;

  return <VisitoringProvider siteKey={VISITORING_SITE_KEY}>{app}</VisitoringProvider>;
}
