"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Maximize,
  Maximize2,
  Minimize,
  Minimize2,
  Pause,
  PictureInPicture,
  Play,
  Radio,
  RefreshCw,
  Search,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Channel, IPTVConfig, Playlist, PopupConfig, Segment } from "../lib/iptv-types";
import WorldCupPopup from "./WorldCupPopup";

const emptyConfig: IPTVConfig = {
  segments: [],
  playlists: [],
  popup: {
    enabled: false,
    title: "",
    body: "",
    image: "",
    cta: "Start watching",
  },
  updatedAt: new Date(0).toISOString(),
};

const getPlayableUrl = (url: string) => {
  if (url.startsWith("http://")) {
    return `/api/iptv/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

const shouldUseHlsUrl = (url: string) =>
  url.includes(".m3u8") ||
  url.includes("/api/iptv/ott-proxy") ||
  url.includes("/api/iptv/proxy") ||
  url.includes("/proxy?") ||
  url.includes("/play?");

const isDynamicOTTUrl = (url: string) =>
  url.includes("/api/iptv/ott-proxy") ||
  url.includes("/api/iptv/proxy") ||
  url.includes("/proxy?") ||
  url.includes("/play?");

export default function IPTVPlayer() {
  const [config, setConfig] = useState<IPTVConfig>(emptyConfig);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playerStatus, setPlayerStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(true);
  const [volume, setVolume] = useState(0.85);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryRef = useRef(0);
  const volumeRef = useRef(0.85);

  const loadChannelStream = useCallback((channel: Channel, options: { silent?: boolean } = {}) => {
    const video = videoRef.current;
    if (!video) return;

    const playableUrl = getPlayableUrl(channel.url);
    const wasMuted = video.muted;
    const wasPaused = options.silent ? video.paused : false;

    if (!options.silent) {
      setShowControls(true);
      setPlayerStatus("loading");
      setIsPaused(true);
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.muted = wasMuted;
    video.volume = volumeRef.current;

    if (Hls.isSupported() && shouldUseHlsUrl(playableUrl)) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(playableUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        retryRef.current = 0;
        if (!wasPaused || options.silent) {
          video.play().catch(() => undefined);
        }
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal || retryRef.current >= 3) {
          if (data.fatal) setPlayerStatus("error");
          return;
        }
        retryRef.current += 1;
        window.setTimeout(() => loadChannelStream(channel, { silent: true }), 2500 * retryRef.current);
      });
    } else {
      video.src = playableUrl;
      if (!wasPaused || options.silent) video.play().catch(() => undefined);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/config", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load IPTV configuration.");
      const data = await response.json();
      const nextConfig = { ...emptyConfig, ...data, popup: { ...emptyConfig.popup, ...data.popup } };
      setConfig(nextConfig);

      const firstSegmentChannel = nextConfig.segments.find((segment: Segment) => segment.channels.length)?.channels[0];
      const firstPlaylistChannel = nextConfig.playlists.find((playlist: Playlist) => playlist.channels.length)?.channels[0];
      const firstChannel = firstSegmentChannel || firstPlaylistChannel || null;

      setSelectedChannel((current) => current || firstChannel);
      if (firstChannel) {
        const source =
          nextConfig.segments.find((segment: Segment) => segment.channels.some((channel) => channel.id === firstChannel.id)) ||
          nextConfig.playlists.find((playlist: Playlist) => playlist.channels.some((channel) => channel.id === firstChannel.id));
        setSelectedSourceId(source?.id || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!selectedChannel) return;
    retryRef.current = 0;
    setDuration(0);
    setCurrentTime(0);
    loadChannelStream(selectedChannel);

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [loadChannelStream, selectedChannel]);

  useEffect(() => {
    if (!selectedChannel || !isDynamicOTTUrl(getPlayableUrl(selectedChannel.url))) return;
    const interval = window.setInterval(() => {
      loadChannelStream(selectedChannel, { silent: true });
    }, 25 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [loadChannelStream, selectedChannel]);

  useEffect(() => {
    if (playerStatus !== "playing" || !showControls) return;
    const timer = window.setTimeout(() => setShowControls(false), 5000);
    return () => window.clearTimeout(timer);
  }, [playerStatus, showControls, selectedChannel?.id]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const allSources = useMemo(
    () => [
      ...config.segments.map((segment) => ({ id: segment.id, name: segment.title, channels: segment.channels })),
      ...config.playlists.map((playlist) => ({ id: playlist.id, name: playlist.name, channels: playlist.channels })),
    ],
    [config]
  );

  useEffect(() => {
    setExpandedSources((current) => {
      const next = { ...current };
      for (const source of allSources) {
        if (next[source.id] === undefined) next[source.id] = allSources.indexOf(source) === 0;
      }
      return next;
    });
  }, [allSources]);

  const filteredSources = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return allSources;
    return allSources
      .map((source) => ({
        ...source,
        channels: source.channels.filter((channel) => channel.name.toLowerCase().includes(term)),
      }))
      .filter((source) => source.channels.length);
  }, [allSources, query]);

  const groupedSources = useMemo(() => {
    return filteredSources.map((source) => {
      const groups = source.channels.reduce<Record<string, Channel[]>>((acc, channel) => {
        const groupName = channel.group?.trim() || "Other";
        acc[groupName] = acc[groupName] || [];
        acc[groupName].push(channel);
        return acc;
      }, {});

      return {
        ...source,
        groups: Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)),
      };
    });
  }, [filteredSources]);

  const selectedSource = allSources.find((source) => source.id === selectedSourceId) || allSources[0];
  const hasContent = config.segments.some((segment) => segment.channels.length) || config.playlists.some((playlist) => playlist.channels.length);

  const selectChannel = (channel: Channel, sourceId: string) => {
    setSelectedChannel(channel);
    setSelectedSourceId(sourceId);
    setShowControls(true);
  };

  const toggleSource = (sourceId: string) => {
    setExpandedSources((current) => ({ ...current, [sourceId]: !current[sourceId] }));
  };

  const toggleGroup = (sourceId: string, groupName: string) => {
    const key = `${sourceId}:${groupName}`;
    setExpandedGroups((current) => ({ ...current, [key]: !current[key] }));
  };

  const playFirstSegmentChannel = (segment: Segment) => {
    const firstChannel = segment.channels[0];
    if (firstChannel) selectChannel(firstChannel, segment.id);
  };

  const playPause = () => {
    const video = videoRef.current;
    if (!video) return;
    setShowControls(true);
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  };

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    setShowControls(true);
  };

  const seekTo = (value: string) => {
    const video = videoRef.current;
    const nextTime = Number(value);
    if (!video || !Number.isFinite(nextTime)) return;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    setShowControls(true);
  };

  const changeVolume = (value: string) => {
    const video = videoRef.current;
    const nextVolume = Number(value);
    if (!video || !Number.isFinite(nextVolume)) return;
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    volumeRef.current = nextVolume;
    setVolume(nextVolume);
    setIsMuted(video.muted);
    setShowControls(true);
  };

  const formatTime = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "0:00";
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    setShowControls(true);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    playerRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const toggleMobileLandscape = async () => {
    if (isMobileLandscape) {
      try {
        await (screen.orientation as any).unlock?.();
      } catch {
        // ignore
      }
      setIsMobileLandscape(false);
    } else {
      try {
        await (screen.orientation as any).lock?.("landscape");
      } catch {
        // Browser may not support lock; still enter UI landscape mode
      }
      setIsMobileLandscape(true);
    }
  };

  // Exit mobile landscape when device rotates back to portrait
  useEffect(() => {
    const handleOrientationChange = () => {
      if (isMobileLandscape && window.screen.orientation?.type?.startsWith("portrait")) {
        (screen.orientation as any).unlock?.().catch?.(() => undefined);
        setIsMobileLandscape(false);
      }
    };
    screen.orientation?.addEventListener?.("change", handleOrientationChange);
    return () => screen.orientation?.removeEventListener?.("change", handleOrientationChange);
  }, [isMobileLandscape]);

  const pip = () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => undefined);
    else video.requestPictureInPicture().catch(() => undefined);
  };

  const toggleControls = () => {
    if (!selectedChannel) return;
    setShowControls((current) => !current);
  };

  const canSeek = Number.isFinite(duration) && duration > 0;

  return (
    <div className="mx-auto max-w-7xl px-3 pb-12 pt-4 text-white sm:px-6">
      <WorldCupPopup popup={config.popup as PopupConfig} />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div
            ref={playerRef}
            className={`overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/40 ${
              isMobileLandscape
                ? "fixed inset-0 z-[9999] rounded-none border-0"
                : ""
            }`}
          >
            <div
              className={`relative bg-black ${isMobileLandscape ? "h-screen w-screen" : "aspect-video"}`}
              onClick={toggleControls}
            >
              {selectedChannel ? (
                <video
                  ref={videoRef}
                  className="h-full w-full object-contain"
                  playsInline
                  muted={isMuted}
                  onPlay={() => {
                    setIsPaused(false);
                    setPlayerStatus("playing");
                    setShowControls(true);
                  }}
                  onPause={() => {
                    setIsPaused(true);
                    setShowControls(true);
                  }}
                  onError={() => setPlayerStatus("error")}
                  onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
                  onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
                  onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <Tv size={46} className="text-slate-600" />
                  <p className="text-lg font-black">No stream selected</p>
                  <p className="max-w-sm text-sm text-slate-500">Add a featured segment or playlist from the admin panel.</p>
                </div>
              )}

              {playerStatus === "loading" && selectedChannel && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <RefreshCw className="animate-spin text-cyan-300" size={30} />
                </div>
              )}

              {selectedChannel && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      seekBy(-10);
                    }}
                    className="pointer-events-auto mr-28 flex h-20 w-28 items-center justify-center rounded-2xl bg-black/0 text-lg font-black text-white/0 transition hover:bg-black/35 hover:text-white"
                    disabled={!canSeek}
                    title={canSeek ? "Back 10 seconds" : "Seek is unavailable on this live stream"}
                    aria-label="Back 10 seconds"
                  >
                    -10
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      seekBy(10);
                    }}
                    className="pointer-events-auto ml-28 flex h-20 w-28 items-center justify-center rounded-2xl bg-black/0 text-lg font-black text-white/0 transition hover:bg-black/35 hover:text-white"
                    disabled={!canSeek}
                    title={canSeek ? "Forward 10 seconds" : "Seek is unavailable on this live stream"}
                    aria-label="Forward 10 seconds"
                  >
                    +10
                  </button>
                </div>
              )}

              <div
                className={`absolute inset-x-0 bottom-0 bg-linear-to-t from-black via-black/60 to-transparent p-3 transition-opacity duration-300 sm:p-5 ${
                  showControls || playerStatus !== "playing" ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                onClick={(event) => event.stopPropagation()}
              >
                {canSeek && (
                  <div className="mb-3 flex items-center gap-3 text-[11px] font-bold text-slate-300">
                    <span className="w-10 text-right">{formatTime(currentTime)}</span>
                    <input
                      type="range"
                      min="0"
                      max={duration || 0}
                      step="1"
                      value={Math.min(currentTime, duration || 0)}
                      onChange={(event) => seekTo(event.target.value)}
                      className="h-1 min-w-0 flex-1 accent-emerald-400"
                      aria-label="Seek video"
                    />
                    <span className="w-10">{formatTime(duration)}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-300">
                      <Radio size={13} />
                      {playerStatus === "playing" ? "Live now" : "Ready"}
                    </p>
                    <h2 className="truncate text-xl font-black sm:text-3xl">{selectedChannel?.name || "Admin-managed IPTV"}</h2>
                    <p className="truncate text-sm text-slate-400">{selectedSource?.name || "No source"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={playPause} className="rounded-xl bg-white p-3 text-slate-950 hover:bg-cyan-200" title={isPaused ? "Play" : "Pause"}>
                      {isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
                    </button>
                    <button onClick={toggleMute} className="rounded-xl border border-white/10 bg-white/10 p-3 hover:bg-white/20" title={isMuted ? "Unmute" : "Mute"}>
                      {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={(event) => changeVolume(event.target.value)}
                      className="hidden h-1 w-20 accent-cyan-300 sm:block"
                      aria-label="Volume"
                    />
                    <button onClick={pip} className="rounded-xl border border-white/10 bg-white/10 p-3 hover:bg-white/20" title="Picture in picture">
                      <PictureInPicture size={18} />
                    </button>
                    <button
                      onClick={toggleMobileLandscape}
                      className="rounded-xl border border-white/10 bg-white/10 p-3 hover:bg-white/20 sm:hidden"
                      title={isMobileLandscape ? "Exit big screen" : "Big screen (mobile)"}
                    >
                      {isMobileLandscape ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                    <button onClick={toggleFullscreen} className="rounded-xl border border-white/10 bg-white/10 p-3 hover:bg-white/20" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                      {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {config.segments.length > 0 && (
            <section className="grid gap-4 md:grid-cols-2">
              {config.segments.map((segment) => (
                <article key={segment.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#101827]/85">
                  <div className="relative h-48 bg-slate-900 sm:h-56">
                    {segment.artwork ? (
                      <img src={segment.artwork} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-linear-to-br from-emerald-500/20 via-cyan-500/10 to-amber-500/20">
                        <Tv size={42} className="text-white/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-linear-to-t from-[#101827] via-[#101827]/35 to-transparent" />
                    <span className="absolute left-4 top-4 rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-slate-950">{segment.badge || "Featured"}</span>
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <h3 className="text-2xl font-black">{segment.title}</h3>
                      {segment.description && <p className="mt-1 line-clamp-2 text-sm text-slate-300">{segment.description}</p>}
                      <button
                        onClick={() => playFirstSegmentChannel(segment)}
                        disabled={!segment.channels.length}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Play size={16} fill="currentColor" />
                        Watch Free
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>

        <aside className="rounded-2xl border border-white/10 bg-[#101827]/90 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Channel Desk</p>
              <h3 className="text-xl font-black">Browse</h3>
            </div>
            <button onClick={loadConfig} className="rounded-xl border border-white/10 bg-white/5 p-2 hover:bg-white/10" title="Refresh">
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <Search size={16} className="text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search channels"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="custom-scrollbar mt-4 max-h-[620px] space-y-5 overflow-y-auto pr-1">
            {loading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-xl bg-white/5" />
                ))}
              </div>
            )}
            {error && (
              <div className="flex gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm font-bold text-rose-200">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            {!loading && !hasContent && (
              <div className="rounded-xl border border-dashed border-white/15 p-5 text-center">
                <p className="font-black">No channels yet</p>
                <p className="mt-2 text-sm text-slate-500">Use the admin panel to add segments or playlists.</p>
              </div>
            )}
            {groupedSources.map((source) => {
              const sourceOpen = query.trim() ? true : Boolean(expandedSources[source.id]);
              return (
              <div key={source.id}>
                <button
                  onClick={() => toggleSource(source.id)}
                  className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left hover:bg-white/[0.07]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {sourceOpen ? <ChevronDown size={16} className="text-cyan-300" /> : <ChevronRight size={16} className="text-cyan-300" />}
                    <span className="truncate text-sm font-black">{source.name}</span>
                  </span>
                  <span className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-400">{source.channels.length}</span>
                </button>
                {sourceOpen && (
                  <div className="space-y-3">
                    {source.groups.map(([groupName, channels]) => {
                      const groupKey = `${source.id}:${groupName}`;
                      const groupOpen = query.trim() ? true : Boolean(expandedGroups[groupKey]);
                      return (
                        <div key={groupKey} className="rounded-xl border border-white/10 bg-slate-950/20 p-2">
                          <button
                            onClick={() => toggleGroup(source.id, groupName)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[0.05]"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {groupOpen ? <ChevronDown size={15} className="text-emerald-300" /> : <ChevronRight size={15} className="text-emerald-300" />}
                              <span className="truncate text-xs font-black uppercase tracking-wider text-slate-200">{groupName}</span>
                            </span>
                            <span className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-400">{channels.length}</span>
                          </button>
                          {groupOpen && (
                            <div className="mt-2 space-y-2">
                              {channels.slice(0, query.trim() ? 160 : 80).map((channel) => {
                                const active = selectedChannel?.id === channel.id;
                                return (
                                  <button
                                    key={channel.id}
                                    onClick={() => selectChannel(channel, source.id)}
                                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                                      active
                                        ? "border-emerald-300/50 bg-emerald-300/10 text-emerald-100"
                                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                                    }`}
                                  >
                                    {channel.logo ? (
                                      <img src={channel.logo} alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-1" />
                                    ) : (
                                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-700 text-xs font-black">
                                        {channel.name.slice(0, 2).toUpperCase()}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-black">{channel.name}</p>
                                      <p className="truncate text-xs text-slate-500">{channel.group}</p>
                                    </div>
                                    {active && <Play size={14} fill="currentColor" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </aside>
      </section>
    </div>
  );
}
