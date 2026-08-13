import type { EditorAreaUiStateShape } from '@/types/domain-types';
import { createState } from 'triactor';

export const EditorAreaUiState = createState<EditorAreaUiStateShape>('EditorAreaUiState');
