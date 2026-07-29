import type { AppStateShape } from '@/components/state/domain-types';
import { createState } from '@/components/state/State';

export const AppState = createState<AppStateShape>('AppState');
