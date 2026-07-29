import { Icons } from '@/components/ui/Icons';
import type { ModelTableProps } from '../prompt-types';
import ModelCacheToggle from './ModelCacheToggle';
import styles from './ModelTable.module.css';
import { COLUMNS, detailValue, formatSize } from './modelUtils';

export default function ModelTable({
  visibleModels,
  sort,
  onToggleSort,
  selectedModelId,
  cachedModelIds = [],
  modelCacheWork,
  onModelCacheAction,
  onRequestUncache,
}: ModelTableProps) {
  return (
    <div className={styles.modelTableWrap}>
      <table className={styles.modelTable}>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} aria-sort={sort?.key === column.key ? sort.direction : 'none'}>
                <button type="button" onClick={() => onToggleSort(column.key)}>
                  {column.label}
                  <span aria-hidden="true">
                    {sort?.key === column.key ? (
                      sort.direction === 'ascending' ? (
                        <Icons.ChevronUp />
                      ) : (
                        <Icons.ChevronDown />
                      )
                    ) : (
                      <span className={styles.modelSortIdle}>↕</span>
                    )}
                  </span>
                </button>
              </th>
            ))}
            <th>Cache</th>
          </tr>
        </thead>
        <tbody>
          {visibleModels.length ? (
            visibleModels.map((model) => {
              const isCached = cachedModelIds.includes(model.id);
              const cacheKey = `${isCached ? 'uncache' : 'cache'}:${model.id}`;
              const isBusy =
                modelCacheWork === cacheKey || modelCacheWork?.endsWith(`:${model.id}`);
              const isSelected = model.id === selectedModelId;

              return (
                <tr key={model.id} className={isSelected ? styles.modelTableSelected : ''}>
                  <td className={styles.modelNameCell}>
                    <div className={styles.modelNameContent}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        tabIndex={-1}
                        aria-label={`${model.name} selected`}
                      />
                      <span>
                        <strong>{model.name}</strong>
                        <code>{model.id}</code>
                      </span>
                    </div>
                  </td>
                  <td>{detailValue(model, 'Best for')}</td>
                  <td>{formatSize(model.ramMB)}</td>
                  <td>{formatSize(model.storageMB)}</td>
                  <td>{detailValue(model, 'Speed')}</td>
                  <td>
                    <ModelCacheToggle
                      isCached={isCached}
                      isBusy={Boolean(isBusy)}
                      disabled={Boolean(modelCacheWork)}
                      onToggle={() => {
                        if (isCached) {
                          onRequestUncache(model);
                        } else {
                          onModelCacheAction?.(model, 'cache');
                        }
                      }}
                    />
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={6} className={styles.modelTableEmpty}>
                No AI models match your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
