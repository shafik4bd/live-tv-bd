export interface Channel {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  sourceUrl?: string;
  sourceType?: "standard" | "ott-json";
}

export interface Playlist {
  id: string;
  name: string;
  type: "json" | "m3u" | "single" | "mixed" | "ott-json";
  source?: string;
  channels: Channel[];
}

export interface Segment {
  id: string;
  title: string;
  description: string;
  badge: string;
  artwork: string;
  channels: Channel[];
}

export interface PopupConfig {
  enabled: boolean;
  title: string;
  body: string;
  image: string;
  cta: string;
}

export interface IPTVConfig {
  segments: Segment[];
  playlists: Playlist[];
  popup: PopupConfig;
  updatedAt: string;
}
