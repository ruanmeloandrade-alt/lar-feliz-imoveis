import { lazy, type ComponentType } from "react";

/**
 * A wrapper around React.lazy that catches "Failed to fetch dynamically imported module" errors.
 * These errors occur when a new version of the app is deployed and the old JS chunks
 * are no longer available on the server.
 * 
 * When this happens, we force a page reload to ensure the user gets the latest version.
 */
export function safeLazy<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error: any) {
      // Check if it's a chunk load error
      const isChunkError = 
        error?.name === "ChunkLoadError" ||
        /Failed to fetch dynamically imported module/.test(error?.message || "");

      if (isChunkError) {
        console.warn("Detectado erro de carregamento de chunk. Recarregando a página...", error);
        
        // Use a session storage flag to avoid infinite reload loops
        const lastReload = sessionStorage.getItem("mkton_last_chunk_reload");
        const now = Date.now();
        
        // Only reload if we haven't reloaded in the last 10 seconds
        if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
          sessionStorage.setItem("mkton_last_chunk_reload", now.toString());
          window.location.reload();
          // Return a dummy promise that never resolves while the page is reloading
          return new Promise<{ default: T }>(() => {});
        }
      }

      // Rethrow the error if it's not a chunk error or we already reloaded recently
      throw error;
    }
  });
}
