import { Channel } from "./iptv-types";

interface RawChannelInput {
  id?: string | number;
  name?: string;
  title?: string;
  channel_name?: string;
  channelName?: string;
  logo?: string;
  logoUrl?: string;
  logo_url?: string;
  image?: string;
  icon?: string;
  tvgLogo?: string;
  group?: string;
  groupTitle?: string;
  "group-title"?: string;
  category?: string;
  categoryName?: string;
  category_name?: string;
  genre?: string;
  url?: string;
  streamUrl?: string;
  stream_url?: string;
  hls_url?: string;
  hlsUrl?: string;
  manifest_url?: string;
  manifestUrl?: string;
  link?: string;
  headers?: Record<string, string>;
  cookie?: string;
  user_agent?: string;
  userAgent?: string;
  referer?: string;
  referrer?: string;
  origin?: string;
}

const makeId = (prefix: string, idx: number) =>
  `${prefix}-${idx}-${Math.random().toString(36).slice(2, 9)}`;

const stableId = (prefix: string, rawId: string | number | undefined, name: string, idx: number) => {
  if (rawId) return String(rawId);
  return `${prefix}-${idx}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "channel"}`;
};

const getOTTProxyUrl = (sourceUrl: string, channelId: string) => {
  const workerUrl = process.env.NEXT_PUBLIC_OTT_WORKER_URL?.replace(/\/$/, "");
  const params = `source=${encodeURIComponent(sourceUrl)}&id=${encodeURIComponent(channelId)}`;
  if (workerUrl) return `${workerUrl}/play?${params}`;
  return `/api/iptv/ott-proxy?${params}`;
};

const getHeaderProxyUrl = (streamUrl: string, headers: Record<string, string>) => {
  const params = `url=${encodeURIComponent(streamUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
  const workerUrl = process.env.NEXT_PUBLIC_OTT_WORKER_URL?.replace(/\/$/, "");
  if (workerUrl) return `${workerUrl}/proxy?${params}`;
  return `/api/iptv/proxy?${params}`;
};

const getGroupName = (ch: RawChannelInput, fallback = "Custom") =>
  ch.group ||
  ch.groupTitle ||
  ch["group-title"] ||
  ch.category ||
  ch.categoryName ||
  ch.category_name ||
  ch.genre ||
  fallback;

const getDynamicHeaders = (ch: RawChannelInput) => {
  const headers: Record<string, string> = { ...(ch.headers || {}) };
  if (ch.cookie) headers.Cookie = ch.cookie;
  if (ch.user_agent || ch.userAgent) headers["User-Agent"] = ch.user_agent || ch.userAgent || "";
  if (ch.referer || ch.referrer) headers.Referer = ch.referer || ch.referrer || "";
  if (ch.origin) headers.Origin = ch.origin;
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => Boolean(value)));
};

const getChannelName = (ch: RawChannelInput, idx: number) =>
  ch.name || ch.title || ch.channel_name || ch.channelName || `Channel ${idx + 1}`;

const getChannelLogo = (ch: RawChannelInput) =>
  ch.logo || ch.logoUrl || ch.logo_url || ch.tvgLogo || ch.image || ch.icon || "";

const getChannelUrl = (ch: RawChannelInput) =>
  ch.url || ch.streamUrl || ch.stream_url || ch.hls_url || ch.hlsUrl || ch.manifest_url || ch.manifestUrl || ch.link || "";

function extractJSONChannels(data: unknown, inheritedGroup = "Custom"): RawChannelInput[] {
  if (Array.isArray(data)) {
    return data.flatMap((item) => extractJSONChannels(item, inheritedGroup));
  }

  if (!data || typeof data !== "object") return [];

  const obj = data as RawChannelInput & {
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
  const streamUrl = getChannelUrl(obj);

  if (streamUrl) {
    return [{ ...obj, group: ownGroup }];
  }

  const nested =
    obj.channels ||
    obj.items ||
    obj.data ||
    obj.results ||
    obj.list ||
    obj.streams ||
    obj.categories ||
    obj.groups;

  return nested ? extractJSONChannels(nested, ownGroup) : [];
}

export function normalizeChannels(list: RawChannelInput[], prefix = "ch"): Channel[] {
  return list
    .map((ch, idx) => {
      const url = getChannelUrl(ch);
      if (!url) return null;
      return {
        id: ch.id || makeId(prefix, idx),
        name: getChannelName(ch, idx),
        logo: getChannelLogo(ch),
        group: getGroupName(ch),
        url,
      };
    })
    .filter((ch): ch is Channel => Boolean(ch));
}

export function parseOTTJSONPlaylist(text: string, sourceUrl: string, prefix = "ott"): Channel[] {
  const data = JSON.parse(text);
  const list = extractJSONChannels(data, "OTT");
  if (!Array.isArray(list)) {
    throw new Error("Invalid JSON. Expected an array or an object with channels/items.");
  }
  return list
    .map((ch: RawChannelInput, idx: number) => {
      const originalUrl = getChannelUrl(ch);
      if (!originalUrl) return null;
      const name = getChannelName(ch, idx);
      const id = stableId(prefix, ch.id, name, idx);
      const hasDynamicHeaders = Object.keys(getDynamicHeaders(ch)).length > 0;
      const channel: Channel = {
        id,
        name,
        logo: getChannelLogo(ch),
        group: getGroupName(ch, "OTT"),
        url: hasDynamicHeaders ? getOTTProxyUrl(sourceUrl, id) : originalUrl,
        sourceUrl,
        sourceType: hasDynamicHeaders ? "ott-json" : "standard",
      };
      return channel;
    })
    .filter((ch): ch is Channel => Boolean(ch));
}

export function parseJSONPlaylist(text: string, prefix = "json", sourceUrl?: string): Channel[] {
  const data = JSON.parse(text);
  const list = extractJSONChannels(data);
  if (!Array.isArray(list)) {
    throw new Error("Invalid JSON. Expected an array or an object with channels/items.");
  }
  if (sourceUrl && list.some((item: RawChannelInput) => Object.keys(getDynamicHeaders(item)).length > 0)) {
    return parseOTTJSONPlaylist(text, sourceUrl, prefix);
  }
  return normalizeChannels(list, prefix);
}

export function parseM3UPlaylist(text: string, prefix = "m3u"): Channel[] {
  const lines = text.split(/\r?\n/);
  const parsed: Channel[] = [];
  let current: Partial<Channel> = {};
  let currentHeaders: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      current = {};
      currentHeaders = {};
      const nameMatch = line.match(/,(.*)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      current.name = nameMatch?.[1]?.trim() || `Channel ${parsed.length + 1}`;
      current.logo = logoMatch?.[1] || "";
      current.group = groupMatch?.[1] || "Custom";
      continue;
    }

    if (line.startsWith("#EXTGRP:")) {
      current.group = line.replace("#EXTGRP:", "").trim() || current.group;
      continue;
    }

    if (line.startsWith("#EXTHTTP:")) {
      try {
        const parsedHeaders = JSON.parse(line.replace("#EXTHTTP:", "").trim());
        if (parsedHeaders && typeof parsedHeaders === "object") {
          currentHeaders = { ...currentHeaders, ...parsedHeaders };
        }
      } catch {
        // Ignore malformed EXTHTTP headers.
      }
      continue;
    }

    if (line.startsWith("#EXTVLCOPT:")) {
      const option = line.replace("#EXTVLCOPT:", "").trim();
      const [rawKey, ...valueParts] = option.split("=");
      const value = valueParts.join("=");
      const key = rawKey.toLowerCase();
      if (key === "http-user-agent") currentHeaders["User-Agent"] = value;
      if (key === "http-referrer") currentHeaders["Referer"] = value;
      if (key === "http-cookie") currentHeaders["Cookie"] = value;
      continue;
    }

    if (!line.startsWith("#")) {
      const url = line;
      const fallbackName = url.split(/[/?#]/).filter(Boolean).pop() || `Channel ${parsed.length + 1}`;
      const hasHeaders = Object.keys(currentHeaders).length > 0;
      parsed.push({
        id: makeId(prefix, parsed.length),
        name: current.name || fallbackName,
        logo: current.logo || "",
        group: current.group || "Custom",
        url: hasHeaders ? getHeaderProxyUrl(url, currentHeaders) : url,
        sourceType: hasHeaders ? "ott-json" : "standard",
      });
      current = {};
      currentHeaders = {};
    }
  }

  return parsed;
}

export function parsePlaylistText(text: string, prefix = "playlist", sourceUrl?: string): Channel[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJSONPlaylist(text, prefix, sourceUrl);
  }
  return parseM3UPlaylist(text, prefix);
}
