# google-oauth-proxy

Edge Function responsável por consumir `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` a partir dos Secrets da Lovable Cloud.

- `GET ?op=start`: público, apenas gera/redireciona para autorização Google; restringe callback à MKTOn.
- `POST { op: "exchange" }`: interno, troca authorization code por tokens.
- `POST { op: "refresh" }`: interno, renova access token.
- `POST { op: "diagnose" }`: interno, valida presença dos secrets.

POSTs exigem `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
