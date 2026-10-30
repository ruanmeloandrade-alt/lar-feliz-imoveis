import { createMiddleware } from '@tanstack/start-client-core'
import { supabase } from './client'

export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    let token: string | undefined
    try {
      const { data } = await supabase.auth.getSession()
      // O cliente já possui autoRefreshToken. Nunca chame refreshSession aqui:
      // duas renovações concorrentes consomem o mesmo refresh token rotativo e
      // podem emitir SIGNED_OUT mesmo com um login recém-criado.
      token = data.session?.access_token
    } catch {
      token = undefined
    }
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  },
)
