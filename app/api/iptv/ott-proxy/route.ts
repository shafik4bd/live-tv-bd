import { NextResponse } from "next/server";
import { parseOTTJSONPlaylist } from "@/app/lib/playlist-parser";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

interface RawOTTChannel {
  id?: string | number;
  name?: string;
  title?: string;
  channel_name?: string;
  channelName?: string;
  link?: string;
  url?: string;
  streamUrl?: string;
  stream_url?: string;
  hls_url?: string;
  hlsUrl?: string;
  manifest_url?: string;
  manifestUrl?: string;
  group?: string;
  groupTitle?: string;
  "group-title"?: string;
  category?: string;
  categoryName?: string;
  category_name?: string;
  genre?: string;
  headers?: Record<string, string>;
  cookie?: string;
  user_agent?: string;
  userAgent?: string;
  referer?: string;
  referrer?: string;
  origin?: string;
}

function isAllowedUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getChannelUrl(channel: RawOTTChannel) {
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

function getGroupName(channel: RawOTTChannel, fallback = "OTT") {
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

function getList(data: unknown, inheritedGroup = "OTT"): RawOTTChannel[] {
  if (Array.isArray(data)) return data.flatMap((item) => getList(item, inheritedGroup));
  if (!data || typeof data !== "object") return [];

  const obj = data as RawOTTChannel & {
    channels?: unknown;
    items?: unknown;
    data?: unknown;
    results?: unknown;
    list?: unknown;
    streams?: unknown;
    categories?: unknown;
    groups?: unknown;
  };
  const ownGroup = getGroupName(obj, inheritedGroup);
  if (getChannelUrl(obj)) return [{ ...obj, group: ownGroup }];

  const nested = obj.channels || obj.items || obj.data || obj.results || obj.list || obj.streams || obj.categories || obj.groups;
  return nested ? getList(nested, ownGroup) : [];
}

function resolveUrl(uri: string, baseUrl: string) {
  return new URL(uri, baseUrl).toString();
}

function proxyUrl(request: Request, targetUrl: string, sourceUrl: string, channelId: string) {
  const url = new URL(request.url);
  url.search = "";
  url.searchParams.set("source", sourceUrl);
  url.searchParams.set("id", channelId);
  url.searchParams.set("url", targetUrl);
  return url.toString();
}

function rewriteM3U8(text: string, baseUrl: string, request: Request, sourceUrl: string, channelId: string) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#EXT-X-KEY") || trimmed.startsWith("#EXT-X-MAP")) {
        return trimmed.replace(/URI="([^"]+)"/, (_, uri) => {
          const absolute = resolveUrl(uri, baseUrl);
          return `URI="${proxyUrl(request, absolute, sourceUrl, channelId)}"`;
        });
      }
      if (!trimmed.startsWith("#")) {
        return proxyUrl(request, resolveUrl(trimmed, baseUrl), sourceUrl, channelId);
      }
      return line;
    })
    .join("\n");
}

function getDynamicHeaders(channel: RawOTTChannel) {
  const headers: Record<string, string> = { ...(channel.headers || {}) };
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

async function fetchSource(sourceUrl: string) {
  const freshSourceUrl = new URL(sourceUrl);
  freshSourceUrl.searchParams.set("_ott_ts", Date.now().toString());
  const response = await fetch(freshSourceUrl.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 IPTV OTT Proxy",
      "Cache-Control": "no-cache, no-store",
    },
  });
  if (!response.ok) throw new Error(`Source JSON failed: ${response.status}`);
  const text = await response.text();
  const parsedChannels = parseOTTJSONPlaylist(text, sourceUrl, "remote");
  const rawChannels = getList(JSON.parse(text));
  return { parsedChannels, rawChannels };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceUrl = searchParams.get("source") || "";
  const channelId = searchParams.get("id") || "";
  const overrideUrl = searchParams.get("url") || "";

  if (!sourceUrl || !channelId || !isAllowedUrl(sourceUrl)) {
    return NextResponse.json({ error: "Missing or invalid source/id" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const { parsedChannels, rawChannels } = await fetchSource(sourceUrl);
    const parsedIndex = parsedChannels.findIndex((channel) => channel.id === channelId);
    if (parsedIndex < 0) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404, headers: CORS_HEADERS });
    }

    const rawChannel = rawChannels[parsedIndex];
    const upstreamUrl = overrideUrl || getChannelUrl(rawChannel);
    if (!isAllowedUrl(upstreamUrl)) {
      return NextResponse.json({ error: "Invalid stream URL" }, { status: 400, headers: CORS_HEADERS });
    }

    const fetchHeaders = new Headers();
    for (const [key, value] of Object.entries(getDynamicHeaders(rawChannel))) {
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

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: fetchHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new Response(`Upstream error: ${upstream.status} ${upstream.statusText}`, {
        status: upstream.status,
        headers: CORS_HEADERS,
      });
    }

    const contentType = upstream.headers.get("Content-Type") || "";
    if (contentType.toLowerCase().includes("mpegurl") || upstreamUrl.includes(".m3u8")) {
      const rewritten = rewriteM3U8(await upstream.text(), upstreamUrl, request, sourceUrl, channelId);
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OTT proxy failed" },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
