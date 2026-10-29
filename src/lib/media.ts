export const isVideoUrl = (url: string): boolean =>
  /\.(mp4|webm|mov|m4v|ogg|ogv|qt)(\?|#|$)/i.test(url);

export const isPdfUrl = (url: string): boolean =>
  /\.pdf(\?|#|$)/i.test(url);

export const fileNameFromUrl = (url: string): string => {
  try {
    const u = new URL(url, window.location.origin);
    const parts = u.pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "arquivo.pdf");
  } catch {
    return "arquivo.pdf";
  }
};

