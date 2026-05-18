const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'avif', 'bmp'];
const VIDEO_EXTENSIONS = ['webm', 'mp4', 'ogg'];

export const isVideoFile = (filename) => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
};

export const isMediaFile = (filename) => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].includes(ext);
};
