import { createState } from '@/components/state/State';
import type { PreviewStateShape } from '@/components/state/domain-types';

export const PreviewState = createState<PreviewStateShape>('PreviewState');
