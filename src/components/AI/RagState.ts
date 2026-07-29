import { createState } from '@/components/state/State';
import type { RagStateShape } from '@/components/state/domain-types';

export const RagState = createState<RagStateShape>('RagState');
