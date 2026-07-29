import type { RagStateShape } from '@/components/state/domain-types';
import { createState } from '@/components/state/State';

export const RagState = createState<RagStateShape>('RagState');
