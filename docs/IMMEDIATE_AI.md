# Immediate ChatGPT generation

MercaSync uses a small Cloudflare Worker to start the secret-bearing GitHub
Actions generator immediately after an authenticated household member requests
it. The PWA never receives the GitHub or OpenAI credentials.

## One-time production configuration

1. Create a fine-grained GitHub personal access token restricted to
   `flyboi96/mercasync`, with **Actions: Read and write** and no other write
   permissions.
2. Store it as the Cloudflare Worker secret `GITHUB_ACTIONS_TOKEN` for
   `mercasync-ai-dispatch`.
3. Add this GitHub Actions repository variable:

   `NEXT_PUBLIC_AI_DISPATCH_URL=https://mercasync-ai-dispatch.mercasync-alex.workers.dev`

The Worker already restricts browser origins to the MercaSync GitHub Pages
origin, verifies the caller's Firebase ID token, and permits only Alex's and
Nathalia's Firebase UIDs. The Firebase web API key is stored in Cloudflare's
secret store. The hourly workflow schedule is intentionally absent; the Sunday
automatic generation remains.

## Local verification

Use `npm run ai:dispatch:dev` with local Wrangler secrets, then set
`NEXT_PUBLIC_AI_DISPATCH_URL=http://localhost:8788`. Use
`npm run ai:dispatch:deploy` for later Worker updates.
