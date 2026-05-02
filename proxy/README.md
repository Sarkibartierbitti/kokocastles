# kokocastles transcript proxy

Stateless Cloudflare Worker. Fetches YouTube caption tracks server-side (browsers can't reach `youtube.com/watch` due to CORS).

## Endpoints

`GET /transcript?platform=youtube&id={videoId}` → `200` JSON `[{start, dur, text}]` or `4xx/5xx` `{error}`.

The `platform` param is required. Future TT/IG branches plug into the same switch.

## Deploy

```
npm i -g wrangler
wrangler login
wrangler deploy
```

Then set `VITE_PROXY_URL=https://kokocastles-transcript.<your-subdomain>.workers.dev` in the SPA's `.env`.

## Local

```
wrangler dev
```
