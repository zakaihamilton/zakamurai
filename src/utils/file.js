export const isMediaFile = (filename) => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'webm', 'mp4', 'ogg', 'avif', 'bmp'].includes(
    ext,
  );
};

export const isSvgFile = (filename) => {
  if (!filename) return false;
  return filename.split('.').pop()?.toLowerCase() === 'svg';
};
