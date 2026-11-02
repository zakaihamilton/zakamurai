declare module 'visitoring' {
  import type { ReactNode } from 'react';
  export function VisitoringProvider(props: { siteKey: string; children: ReactNode }): ReactNode;
}
