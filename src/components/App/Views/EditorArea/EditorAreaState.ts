import type { EditorAreaUiStateShape } from '@/components/state/domain-types';
import { createState } from '@/components/state/State';

export const EditorAreaUiState = createState<EditorAreaUiStateShape>('EditorAreaUiState');
