# Archived: kokocastles web app + Cloudflare Worker

This directory preserves the original Vite web app and Cloudflare Worker
proxy that shipped through commit `14b5aa8` (May 2026). The product pivoted
to a Firefox extension at `../extension` because YouTube hard-blocks
server-side caption fetch from datacenter IPs (CF Workers).

The extension scrapes captions from the user's residential IP via a
content script on `youtube.com`, eliminating the proxy.

## Running the archived web app

```bash
cd archive/app
npm install
npm run dev
```

The CF Worker at `archive/proxy/` is no longer deployed. The transcript
endpoint will fail; manual paste fallback works.
