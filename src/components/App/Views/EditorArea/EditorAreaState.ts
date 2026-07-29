import { createState } from '@/components/state/State';
import type { EditorAreaUiStateShape } from '@/components/state/domain-types';

export const EditorAreaUiState = createState<EditorAreaUiStateShape>('EditorAreaUiState');
