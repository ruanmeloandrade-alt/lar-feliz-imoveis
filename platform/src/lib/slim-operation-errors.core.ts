/**
 * Persist bounded, redacted errors instead of provider responses containing
 * inline audio/PDF base64. This never modifies historical business rows.
 */
export const SLIM_ERROR_MAX_LENGTH = 512;

export function slimSafeOperationalError(value: unknown): string {
 const errorObject=value && typeof value==='object'?value as {message?:unknown}:null;
 const raw=typeof value==='string'?value:typeof errorObject?.message==='string'?errorObject.message:'Falha operacional não especificada.';
 const clipped=raw.slice(0,4096);
 const safe=clipped
  .replace(/data:[^,\r\n]{1,200};base64,[a-z0-9+/=\r\n]+/gi,'[mídia base64 omitida]')
  .replace(/\b[a-z0-9+/]{200,}={0,2}\b/gi,'[payload omitido]')
  .replace(/(authorization|apikey|access_token|refresh_token|password|secret)\s*[:=]\s*["']?[^"',;&}\s]{6,}/gi,'$1=[omitido]')
  .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi,'$1[omitido]')
  .trim();
 return (safe.slice(0,SLIM_ERROR_MAX_LENGTH) || 'Falha operacional não especificada.');
}
