import type { SelectOption } from '@/components/ui/types';

export type ModelSortKey =
  | 'model'
  | 'bestFor'
  | 'ram'
  | 'storage'
  | 'speed'
  | 'status'
  | 'searchText';

export type ModelSortState = {
  key: ModelSortKey;
  direction: 'ascending' | 'descending';
} | null;

export type ModelOption = {
  id: string;
  label?: string;
  name?: string;
  ramMB?: number;
  storageMB?: number;
};

export type ModelSelectOption = SelectOption;

export type ModelManagerProps = {
  isOpen: boolean;
  selectedModelId: string;
  cachedModelIds?: string[];
  onCancel: () => void;
  onModelCacheAction?: (model: ModelOption, action: 'cache' | 'uncache' | 'delete') => void;
  modelCacheWork: string | null;
  modelCacheProgress: string;
  modelCacheError: string;
};

export type ModelCacheToggleProps = {
  isCached: boolean;
  isBusy: boolean;
  disabled: boolean;
  onToggle: () => void;
};

export type ModelSearchProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
};

export type ModelTableProps = {
  visibleModels: import('@/components/AI/types').WebLLMModel[];
  sort: ModelSortState;
  onToggleSort: (key: ModelSortKey) => void;
  selectedModelId: string;
  cachedModelIds?: string[];
  modelCacheWork: string | null;
  onModelCacheAction?: (model: ModelOption, action: 'cache' | 'uncache' | 'delete') => void;
  onRequestUncache: (model: ModelOption) => void;
};

export type RemoveCacheDialogProps = {
  model: ModelOption | null;
  onCancel: () => void;
  onConfirm: () => void;
};
