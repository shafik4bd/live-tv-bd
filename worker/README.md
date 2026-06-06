# OTT Proxy Worker

Deploy `ott-proxy-worker.js` to Cloudflare Workers when you want to proxy dynamic OTT streams outside the Next.js server.

Preferred safe URL:

```text
https://your-worker.workers.dev/play?source=ENCODED_JSON_URL&id=CHANNEL_ID
```

This mode fetches the JSON source inside the Worker, reads the channel `headers`/`Cookie` there, and never exposes those headers in the player URL.

Legacy direct URL:

```text
https://your-worker.workers.dev/proxy?url=ENCODED_STREAM_URL&headers=ENCODED_HEADERS_JSON
```

Use legacy mode only for testing because headers/cookies are visible in the URL.

The Next.js app already includes an internal proxy at:

```text
/api/iptv/ott-proxy?source=ENCODED_JSON_URL&id=CHANNEL_ID
```

So Cloudflare Worker deployment is optional unless you want to offload stream proxying from your app server.
