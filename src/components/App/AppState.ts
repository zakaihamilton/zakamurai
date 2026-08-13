import type { AppStateShape } from '@/types/domain-types';
import { createState } from 'triactor';

export const AppState = createState<AppStateShape>('AppState');
