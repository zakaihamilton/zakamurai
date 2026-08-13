import { createState } from '@/components/state/State';
import type { AppStateShape } from '@/types/domain-types';

export const AppState = createState<AppStateShape>('AppState');
