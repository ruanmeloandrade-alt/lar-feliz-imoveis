# AGENTS.md

- Preserve existing working code.
- Do not commit secrets or service-role keys.
- Use only the same-origin API and the exclusive Railway volume for runtime data. No external database SDKs or old backend URLs.
- Validate with `npm run build` before delivery.
- Never invoke Lovable tools, APIs, chat, editor, or SQL bridge. There are no testing or cleanup exceptions.
- Allowed deployment providers are Railway, GitHub, and Hostinger only. Do not use Heroku, HostGator, or introduce another provider.
- The user rejected provisional use of the old backend. Do not publish a build that still depends on it.
- Do not access the old Lovable-managed backend through another tool to bypass this restriction.
- Do not run remote QA against the old backend. Any cleanup there requires new explicit authorization.
- Keep Vanessa isolated from Saude Slim, Harpia, MKTon, and other clients' databases, Auth, Storage, credentials, and data.
- No Chrome/browser automation, GitHub Actions, new paid resources, or production dependencies without explicit approval.
