import { createState } from '@/components/state/State';
import type { RagStateShape } from '@/types/domain-types';

export const RagState = createState<RagStateShape>('RagState');
