export function reportLovableError(error:unknown,context:Record<string,unknown>={}) { console.error('Application error',{...context,message:error instanceof Error?error.message:String(error)}); }
