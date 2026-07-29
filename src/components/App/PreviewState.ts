import type { PreviewStateShape } from '@/components/state/domain-types';
import { createState } from '@/components/state/State';

export const PreviewState = createState<PreviewStateShape>('PreviewState');
