export const detailValue = (model, label) =>
  model.details?.find(([key]) => key === label)?.[1] || '';

export const formatSize = (megabytes) => {
  if (megabytes < 1000) return `${Math.round(megabytes).toLocaleString()} MB`;
  return `${(megabytes / 1000).toFixed(2).replace(/0$/, '')} GB`;
};

export const COLUMNS = [
  { key: 'model', label: 'Model' },
  { key: 'bestFor', label: 'Best for' },
  { key: 'ram', label: 'RAM' },
  { key: 'storage', label: 'Storage' },
  { key: 'speed', label: 'Speed' },
];

export const modelValues = (model, selectedModelId, cachedModelIds) => {
  const statuses = [
    model.id === selectedModelId ? 'Selected' : '',
    model.recommended ? 'Recommended' : '',
    cachedModelIds.includes(model.id) ? 'Cached' : '',
  ].filter(Boolean);

  return {
    model: `${model.name} ${model.id}`,
    bestFor: detailValue(model, 'Best for'),
    ram: model.ramMB,
    storage: model.storageMB,
    speed: detailValue(model, 'Speed'),
    status: statuses.join(' '),
    searchText: `${model.requirement} ${model.details?.flat().join(' ') || ''}`,
  };
};
