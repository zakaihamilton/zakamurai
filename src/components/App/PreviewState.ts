import type { PreviewStateShape } from '@/types/domain-types';
import { createState } from 'triactor';

export const PreviewState = createState<PreviewStateShape>('PreviewState');
