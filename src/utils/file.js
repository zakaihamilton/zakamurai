export const isMediaFile = (filename) => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'webm', 'mp4', 'ogg', 'avif', 'bmp'].includes(
    ext,
  );
};
