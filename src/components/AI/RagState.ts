import type { RagStateShape } from '@/types/domain-types';
import { createState } from 'triactor';

export const RagState = createState<RagStateShape>('RagState');
