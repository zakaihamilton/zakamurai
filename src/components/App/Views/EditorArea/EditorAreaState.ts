import { createState } from '@/components/state/State';
import type { EditorAreaUiStateShape } from '@/types/domain-types';

export const EditorAreaUiState = createState<EditorAreaUiStateShape>('EditorAreaUiState');
