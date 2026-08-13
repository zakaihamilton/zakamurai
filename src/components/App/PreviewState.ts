import { createState } from '@/components/state/State';
import type { PreviewStateShape } from '@/types/domain-types';

export const PreviewState = createState<PreviewStateShape>('PreviewState');
