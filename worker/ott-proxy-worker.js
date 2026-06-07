const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname === "/play") {
      return playFromJsonSource(request, url);
    }

    if (url.pathname === "/proxy") {
      return proxyDirect(request, url);
    }

    return jsonError(404, "Use /play?source=JSON_URL&id=CHANNEL_ID or /proxy?url=STREAM_URL");
  },
};

async function playFromJsonSource(request, url) {
  const sourceUrl = url.searchParams.get("source") || "";
  const channelId = url.searchParams.get("id") || "";
  const overrideUrl = url.searchParams.get("url") || "";

  if (!isHttpUrl(sourceUrl) || !channelId) {
    return jsonError(400, "Missing or invalid source/id");
  }

  const freshSourceUrl = withCacheBuster(sourceUrl);
  const source = await fetch(freshSourceUrl, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 OTT Proxy Worker",
      "Cache-Control": "no-cache, no-store",
    },
  });
  if (!source.ok) return jsonError(source.status, `Source fetch failed: ${source.status}`);

  const text = await source.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return jsonError(400, "Source is not valid JSON");
  }

  const channels = extractChannels(data);
  if (!Array.isArray(channels)) return jsonError(400, "Source JSON must be an array or contain channels/items");

  const channel = channels.find((item, index) => makeChannelId(item, index) === channelId);
  if (!channel) return jsonError(404, "Channel not found");

  const targetUrl = overrideUrl || getChannelUrl(channel);
  if (!isHttpUrl(targetUrl)) return jsonError(400, "Invalid stream URL");

  return fetchAndRewrite(request, targetUrl, getDynamicHeaders(channel), {
    mode: "play",
    sourceUrl,
    channelId,
  });
}

function getDynamicHeaders(channel) {
  const headers = { ...(channel.headers || {}) };
  if (channel.cookie) headers.Cookie = channel.cookie;
  if (channel.user_agent || channel.userAgent) {
    headers["User-Agent"] = channel.user_agent || channel.userAgent || "";
  }
  if (channel.referer || channel.referrer) {
    headers.Referer = channel.referer || channel.referrer || "";
  }
  if (channel.origin) headers.Origin = channel.origin;
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => Boolean(value)));
}

function getChannelUrl(channel) {
  return (
    channel.url ||
    channel.streamUrl ||
    channel.stream_url ||
    channel.hls_url ||
    channel.hlsUrl ||
    channel.manifest_url ||
    channel.manifestUrl ||
    channel.link ||
    ""
  );
}

function getGroupName(channel, fallback = "OTT") {
  return (
    channel.group ||
    channel.groupTitle ||
    channel["group-title"] ||
    channel.category ||
    channel.categoryName ||
    channel.category_name ||
    channel.genre ||
    fallback
  );
}

function extractChannels(data, inheritedGroup = "OTT") {
  if (Array.isArray(data)) return data.flatMap((item) => extractChannels(item, inheritedGroup));
  if (!data || typeof data !== "object") return [];

  const ownGroup = getGroupName(data, inheritedGroup);
  if (getChannelUrl(data)) return [{ ...data, group: ownGroup }];

  const nested = data.channels || data.items || data.data || data.results || data.list || data.streams || data.categories || data.groups;
  return nested ? extractChannels(nested, ownGroup) : [];
}

async function proxyDirect(request, url) {
  const targetUrl = url.searchParams.get("url") || "";
  const headersParam = url.searchParams.get("headers");
  if (!isHttpUrl(targetUrl)) return jsonError(400, 'Missing or invalid "url" parameter');

  let injectHeaders = {};
  if (headersParam) {
    try {
      injectHeaders = JSON.parse(decodeURIComponent(headersParam));
    } catch {
      return jsonError(400, "Invalid headers JSON");
    }
  }

  return fetchAndRewrite(request, targetUrl, injectHeaders, { mode: "proxy" });
}

async function fetchAndRewrite(request, targetUrl, injectHeaders, context) {
  const fetchHeaders = new Headers();
  for (const [key, value] of Object.entries(injectHeaders || {})) {
    try {
      fetchHeaders.set(key, value);
    } catch {
      // Ignore invalid upstream header names.
    }
  }

  for (const header of ["Accept", "Accept-Language", "Range"]) {
    const value = request.headers.get(header);
    if (value) fetchHeaders.set(header, value);
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method: "GET",
      headers: fetchHeaders,
      redirect: "follow",
    });
  } catch (error) {
    return jsonError(502, `Upstream fetch failed: ${error.message}`);
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream error: ${upstream.status} ${upstream.statusText}`, {
      status: upstream.status,
      headers: CORS_HEADERS,
    });
  }

  const contentType = upstream.headers.get("Content-Type") || "";
  if (contentType.toLowerCase().includes("mpegurl") || targetUrl.includes(".m3u8")) {
    const text = await upstream.text();
    const rewritten = rewriteM3U8(text, targetUrl, request, injectHeaders, context);
    return new Response(rewritten, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache, no-store",
      },
    });
  }

  const responseHeaders = new Headers(CORS_HEADERS);
  for (const header of ["Content-Type", "Content-Range", "Accept-Ranges"]) {
    const value = upstream.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }
  responseHeaders.set("Cache-Control", "public, max-age=10");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

function rewriteM3U8(text, baseUrl, request, headers, context) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#EXT-X-KEY") || trimmed.startsWith("#EXT-X-MAP")) {
        return trimmed.replace(/URI="([^"]+)"/, (_, uri) => `URI="${buildNextUrl(request, resolveUrl(uri, baseUrl), headers, context)}"`);
      }
      if (!trimmed.startsWith("#")) {
        return buildNextUrl(request, resolveUrl(trimmed, baseUrl), headers, context);
      }
      return line;
    })
    .join("\n");
}

function buildNextUrl(request, targetUrl, headers, context) {
  const url = new URL(request.url);
  if (context.mode === "play") {
    url.pathname = "/play";
    url.search = "";
    url.searchParams.set("source", context.sourceUrl);
    url.searchParams.set("id", context.channelId);
    url.searchParams.set("url", targetUrl);
    return url.toString();
  }

  url.pathname = "/proxy";
  url.search = "";
  url.searchParams.set("url", targetUrl);
  if (Object.keys(headers || {}).length) {
    url.searchParams.set("headers", JSON.stringify(headers));
  }
  return url.toString();
}

function makeChannelId(item, index) {
  if (item.id) return String(item.id);
  const name = item.name || item.title || item.channel_name || item.channelName || `Channel ${index + 1}`;
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "channel";
  return `remote-${index}-${slug}`;
}

function resolveUrl(uri, baseUrl) {
  return new URL(uri, baseUrl).toString();
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function withCacheBuster(value) {
  const url = new URL(value);
  url.searchParams.set("_ott_ts", Date.now().toString());
  return url.toString();
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
