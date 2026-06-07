"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertCircle,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture,
  Play,
  Radio,
  RefreshCw,
  RotateCw,
  Search,
  Tv,
  Volume2,
  VolumeX,
  ZoomIn,
  Scan,
} from "lucide-react";
import { Channel, IPTVConfig, Playlist, PopupConfig, Segment } from "../lib/iptv-types";
import WorldCupPopup from "./WorldCupPopup";

// ─── Constants ───────────────────────────────────────────────────────────────

const emptyConfig: IPTVConfig = {
  segments: [],
  playlists: [],
  popup: { enabled: false, title: "", body: "", image: "", cta: "Start watching" },
  updatedAt: new Date(0).toISOString(),
};

const getPlayableUrl = (url: string) =>
  url.startsWith("http://") ? `/api/iptv/proxy?url=${encodeURIComponent(url)}` : url;

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

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const m = Math.floor(value / 60);
  const s = Math.floor(value % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function IPTVPlayer() {
  // Config & channel state (your file)
  const [config, setConfig] = useState<IPTVConfig>(emptyConfig);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Player state
  const [playerStatus, setPlayerStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(true);
  const [isPip, setIsPip] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Zoom & Pan (fullscreen only)
  const [videoZoom, setVideoZoom] = useState(1);
  const [videoPan, setVideoPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const lastPinchDistRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Double-tap seek indicator (GitHub)
  const [activeSeekIndicator, setActiveSeekIndicator] = useState<{ side: "left" | "right"; visible: boolean }>({ side: "left", visible: false });

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null); // fullscreen target (GitHub pattern)
  const hlsRef = useRef<Hls | null>(null);
  const retryRef = useRef(0);
  const volumeRef = useRef(0.85);
  const userMutedRef = useRef(false);
  const isFullscreenRef = useRef(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmuteCleanupRef = useRef<(() => void) | null>(null);

  // ─── Controls auto-hide (GitHub: 3s, better than your 5s) ──────────────────

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) setShowControls(false);
    }, 3000);
    controlsTimeoutRef.current = timeout;
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      if (unmuteCleanupRef.current) unmuteCleanupRef.current();
    };
  }, []);

  // ─── Setup unmute on first interaction (GitHub) ─────────────────────────────

  const setupUnmuteOnInteraction = useCallback(() => {
    if (unmuteCleanupRef.current) unmuteCleanupRef.current();
    const unmute = () => {
      const v = videoRef.current;
      if (v && v.muted) {
        v.muted = false;
        setIsMuted(false);
        if (v.volume === 0) { v.volume = 1.0; setVolume(1.0); }
      }
      cleanup();
    };
    const cleanup = () => {
      document.removeEventListener("click", unmute);
      document.removeEventListener("touchstart", unmute);
      document.removeEventListener("keydown", unmute);
      unmuteCleanupRef.current = null;
    };
    document.addEventListener("click", unmute);
    document.addEventListener("touchstart", unmute);
    document.addEventListener("keydown", unmute);
    unmuteCleanupRef.current = cleanup;
  }, []);

  // ─── Fullscreen (GitHub: orientation lock + iOS Safari + zoom reset) ────────

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      isFullscreenRef.current = isFs;
      setIsFullscreen(isFs);
      if (!isFs) {
        setTimeout(() => {
          try { (screen.orientation as any).unlock?.(); } catch { /* not supported */ }
        }, 150);
        // Reset zoom/pan on exit
        setVideoZoom(1); setVideoPan({ x: 0, y: 0 });
        zoomRef.current = 1; panRef.current = { x: 0, y: 0 };
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const container = playerContainerRef.current;
    const video = videoRef.current;
    if (!container) return;

    // iOS Safari fallback
    const videoEl = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (!document.fullscreenElement && !container.requestFullscreen && videoEl?.webkitEnterFullscreen) {
      videoEl.webkitEnterFullscreen();
      resetControlsTimeout();
      return;
    }

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => {
        setTimeout(() => {
          try {
            (screen.orientation as any).lock?.("landscape").catch?.(() => { /* not supported */ });
          } catch { /* not supported */ }
        }, 300);
      }).catch((err) => console.warn("Fullscreen failed:", err));
    } else {
      document.exitFullscreen().catch((err) => console.warn("Exit fullscreen failed:", err));
    }
    resetControlsTimeout();
  };

  // ─── Zoom & Pan ─────────────────────────────────────────────────────────────

  const cycleZoom = () => {
    const next = zoomRef.current >= 1.9 ? 1 : zoomRef.current >= 1.4 ? 2 : 1.5;
    zoomRef.current = next;
    if (next === 1) { panRef.current = { x: 0, y: 0 }; setVideoPan({ x: 0, y: 0 }); }
    setVideoZoom(next);
  };

  const clampPan = (x: number, y: number, zoom: number) => {
    const v = videoRef.current;
    if (!v || zoom <= 1) return { x: 0, y: 0 };
    const mx = (v.clientWidth * (zoom - 1)) / 2;
    const my = (v.clientHeight * (zoom - 1)) / 2;
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };

  const handleVideoTouchStart = (e: React.TouchEvent) => {
    if (!isFullscreenRef.current) return;
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      isDraggingRef.current = false;
    } else if (e.touches.length === 1 && zoomRef.current > 1) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, px: panRef.current.x, py: panRef.current.y };
    }
  };

  const handleVideoTouchMove = (e: React.TouchEvent) => {
    if (!isFullscreenRef.current) return;
    if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
      e.stopPropagation();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newZoom = Math.max(1, Math.min(3, zoomRef.current * (dist / lastPinchDistRef.current)));
      lastPinchDistRef.current = dist;
      zoomRef.current = newZoom;
      const clamped = clampPan(panRef.current.x, panRef.current.y, newZoom);
      panRef.current = clamped;
      setVideoZoom(newZoom); setVideoPan(clamped);
    } else if (e.touches.length === 1 && isDraggingRef.current && dragStartRef.current) {
      e.stopPropagation();
      const clamped = clampPan(
        dragStartRef.current.px + (e.touches[0].clientX - dragStartRef.current.x),
        dragStartRef.current.py + (e.touches[0].clientY - dragStartRef.current.y),
        zoomRef.current
      );
      panRef.current = clamped; setVideoPan(clamped);
    }
  };

  const handleVideoTouchEnd = (e: React.TouchEvent) => {
    if (!isFullscreenRef.current) return;
    if (e.touches.length < 2) lastPinchDistRef.current = null;
    if (e.touches.length === 0) { isDraggingRef.current = false; dragStartRef.current = null; }
  };

  // ─── Stream loading (your file — better retry + OTT logic) ─────────────────

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

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    video.muted = wasMuted;
    video.volume = volumeRef.current;

    if (Hls.isSupported() && shouldUseHlsUrl(playableUrl)) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 60 });
      hlsRef.current = hls;
      hls.loadSource(playableUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        retryRef.current = 0;
        if (!wasPaused || options.silent) {
          video.play().catch((err) => {
            if (err.name === "NotAllowedError") {
              video.muted = true; setIsMuted(true);
              video.play().then(() => setupUnmuteOnInteraction()).catch(() => undefined);
            }
          });
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
  }, [setupUnmuteOnInteraction]);

  // ─── Config loading (your file) ─────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/config", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load IPTV configuration.");
      const data = await response.json();
      const nextConfig = { ...emptyConfig, ...data, popup: { ...emptyConfig.popup, ...data.popup } };
      setConfig(nextConfig);
      const firstSegmentChannel = nextConfig.segments.find((s: Segment) => s.channels.length)?.channels[0];
      const firstPlaylistChannel = nextConfig.playlists.find((p: Playlist) => p.channels.length)?.channels[0];
      const firstChannel = firstSegmentChannel || firstPlaylistChannel || null;
      setSelectedChannel((current) => current || firstChannel);
      if (firstChannel) {
        const source =
          nextConfig.segments.find((s: Segment) => s.channels.some((c: Channel) => c.id === firstChannel.id)) ||
          nextConfig.playlists.find((p: Playlist) => p.channels.some((c: Channel) => c.id === firstChannel.id));
        setSelectedSourceId(source?.id || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useEffect(() => {
    if (!selectedChannel) return;
    retryRef.current = 0;
    setDuration(0); setCurrentTime(0);
    loadChannelStream(selectedChannel);
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [loadChannelStream, selectedChannel]);

  // OTT stream refresh every 25min (your file)
  useEffect(() => {
    if (!selectedChannel || !isDynamicOTTUrl(getPlayableUrl(selectedChannel.url))) return;
    const interval = window.setInterval(() => loadChannelStream(selectedChannel, { silent: true }), 25 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [loadChannelStream, selectedChannel]);

  // Sync video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPaused(false);
    const onPause = () => setIsPaused(true);
    const onVolumeChange = () => { setIsMuted(video.muted); setVolume(video.volume); };
    const onEnterPip = () => setIsPip(true);
    const onLeavePip = () => setIsPip(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("enterpictureinpicture", onEnterPip);
    video.addEventListener("leavepictureinpicture", onLeavePip);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("leavepictureinpicture", onLeavePip);
    };
  }, [selectedChannel]);

  // Cleanup on unmount
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (video) video.src = "";
      if (unmuteCleanupRef.current) unmuteCleanupRef.current();
    };
  }, []);

  // ─── Source/group derived data (your file) ──────────────────────────────────

  const allSources = useMemo(() => [
    ...config.segments.map((s) => ({ id: s.id, name: s.title, channels: s.channels })),
    ...config.playlists.map((p) => ({ id: p.id, name: p.name, channels: p.channels })),
  ], [config]);

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
      .map((s) => ({ ...s, channels: s.channels.filter((c) => c.name.toLowerCase().includes(term)) }))
      .filter((s) => s.channels.length);
  }, [allSources, query]);

  const groupedSources = useMemo(() => filteredSources.map((source) => {
    const groups = source.channels.reduce<Record<string, Channel[]>>((acc, ch) => {
      const g = ch.group?.trim() || "Other";
      acc[g] = acc[g] || []; acc[g].push(ch); return acc;
    }, {});
    return { ...source, groups: Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)) };
  }), [filteredSources]);

  const selectedSource = allSources.find((s) => s.id === selectedSourceId) || allSources[0];
  const hasContent = config.segments.some((s) => s.channels.length) || config.playlists.some((p) => p.channels.length);
  const canSeek = Number.isFinite(duration) && duration > 0;

  // ─── Player actions ──────────────────────────────────────────────────────────

  const selectChannel = (channel: Channel, sourceId: string) => {
    setSelectedChannel(channel); setSelectedSourceId(sourceId); setShowControls(true);
  };

  const toggleSource = (sourceId: string) =>
    setExpandedSources((c) => ({ ...c, [sourceId]: !c[sourceId] }));

  const toggleGroup = (sourceId: string, groupName: string) => {
    const key = `${sourceId}:${groupName}`;
    setExpandedGroups((c) => ({ ...c, [key]: !c[key] }));
  };

  const playFirstSegmentChannel = (segment: Segment) => {
    const ch = segment.channels[0];
    if (ch) selectChannel(ch, segment.id);
  };

  // playPause — GitHub version (better: handles muted state on resume)
  const playPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.muted && !userMutedRef.current) {
        video.muted = false; setIsMuted(false);
        if (video.volume === 0) { video.volume = 1.0; setVolume(1.0); }
      }
      video.play().catch((err) => { if (err.name !== "AbortError") console.warn("Play failed:", err); });
    } else {
      video.pause();
    }
    resetControlsTimeout();
  };

  // seekBy — your file
  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const seekable = video.seekable;
      let newTime = video.currentTime + seconds;
      if (seekable && seekable.length > 0) {
        newTime = Math.max(seekable.start(0), Math.min(seekable.end(seekable.length - 1), newTime));
      } else if (video.duration) {
        newTime = Math.max(0, Math.min(video.duration, newTime));
      }
      video.currentTime = newTime;
    } catch (err) { console.warn("Seeking failed:", err); }
    resetControlsTimeout();
  };

  const seekTo = (value: string) => {
    const video = videoRef.current;
    const nextTime = Number(value);
    if (!video || !Number.isFinite(nextTime)) return;
    video.currentTime = nextTime; setCurrentTime(nextTime);
    resetControlsTimeout();
  };

  // toggleMute — GitHub version (better: tracks userMuted intent)
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted) {
      video.muted = false; userMutedRef.current = false;
      if (video.volume === 0) { video.volume = 1.0; setVolume(1.0); }
    } else {
      video.muted = true; userMutedRef.current = true;
    }
    resetControlsTimeout();
  };

  const changeVolume = (value: string) => {
    const video = videoRef.current;
    const nextVolume = Number(value);
    if (!video || !Number.isFinite(nextVolume)) return;
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    userMutedRef.current = nextVolume === 0;
    volumeRef.current = nextVolume;
    setVolume(nextVolume); setIsMuted(video.muted);
    resetControlsTimeout();
  };

  // pip — GitHub version (better: try/catch, isPip state)
  const pip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled) await video.requestPictureInPicture();
    } catch (err) { console.warn("PiP failed:", err); }
    resetControlsTimeout();
  };

  const handleReload = () => {
    if (selectedChannel) { retryRef.current = 0; loadChannelStream(selectedChannel); }
  };

  // ─── Click & double-tap (GitHub pattern) ────────────────────────────────────

  const handlePlayerClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".player-controls")) return;

    const video = videoRef.current;
    // First click on muted video → unmute
    if (video && (video.muted || video.volume === 0)) {
      video.muted = false; setIsMuted(false);
      if (video.volume === 0) { video.volume = 1.0; setVolume(1.0); }
      resetControlsTimeout(); return;
    }

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null; return;
    }
    clickTimeoutRef.current = setTimeout(() => {
      playPause(); clickTimeoutRef.current = null;
    }, 200);
  };

  const handlePlayerDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".player-controls")) return;
    if (clickTimeoutRef.current) { clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null; }

    const container = playerContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const isLeft = (e.clientX - rect.left) < rect.width / 2;
    seekBy(isLeft ? -10 : 10);

    if (seekIndicatorTimeoutRef.current) clearTimeout(seekIndicatorTimeoutRef.current);
    setActiveSeekIndicator({ side: isLeft ? "left" : "right", visible: true });
    seekIndicatorTimeoutRef.current = setTimeout(() =>
      setActiveSeekIndicator((prev) => ({ ...prev, visible: false })), 650);
  };

  // ─── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl px-3 pb-12 pt-4 text-white sm:px-6">
      <WorldCupPopup popup={config.popup as PopupConfig} />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">

          {/* ── Player ── */}
          <div
            ref={playerContainerRef}
            onMouseMove={resetControlsTimeout}
            onClick={handlePlayerClick}
            onDoubleClick={handlePlayerDoubleClick}
            onTouchStart={handleVideoTouchStart}
            onTouchMove={handleVideoTouchMove}
            onTouchEnd={handleVideoTouchEnd}
            className={`group relative bg-black shadow-2xl ${
              isFullscreen
                ? "h-full w-full"
                : "overflow-hidden rounded-2xl border border-white/10 aspect-video"
            } ${showControls ? "cursor-default" : "cursor-none"}`}
          >
            {/* Video */}
            {selectedChannel ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-contain bg-black"
                style={{
                  transform: `scale(${videoZoom}) translate(${videoPan.x / videoZoom}px, ${videoPan.y / videoZoom}px)`,
                  touchAction: isFullscreen ? "none" : "auto",
                  transition: "transform 75ms linear",
                }}
                onPlay={() => { setIsPaused(false); setPlayerStatus("playing"); resetControlsTimeout(); }}
                onPause={() => { setIsPaused(true); setShowControls(true); }}
                onError={() => setPlayerStatus("error")}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center aspect-video">
                <Tv size={46} className="text-slate-600" />
                <p className="text-lg font-black">No stream selected</p>
                <p className="max-w-sm text-sm text-slate-500">Add a featured segment or playlist from the admin panel.</p>
              </div>
            )}

            {/* TAP TO UNMUTE */}
            {playerStatus === "playing" && isMuted && (
              <div
                className="absolute top-4 right-4 z-30 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/10 shadow-lg backdrop-blur-md"
                >
                  <VolumeX size={14} className="text-cyan-300 animate-pulse" />
                  <span className="text-[10px] font-bold tracking-wider">TAP TO UNMUTE</span>
                </motion.div>
              </div>
            )}

            {/* Center Play overlay when paused */}
            {playerStatus === "playing" && isPaused && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/35 z-10 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); playPause(); }}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-emerald-400/95 text-slate-950 flex items-center justify-center shadow-lg border border-white/10"
                >
                  <Play size={28} className="fill-current translate-x-0.5" />
                </motion.div>
              </div>
            )}

            {/* Double-tap seek indicator */}
            <AnimatePresence>
              {activeSeekIndicator.visible && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`absolute inset-y-0 w-1/3 flex items-center justify-center pointer-events-none z-30 bg-white/5 ${
                    activeSeekIndicator.side === "left" ? "left-0 rounded-r-full" : "right-0 rounded-l-full"
                  }`}
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                    className="flex flex-col items-center gap-1 text-white bg-black/60 px-4 py-3 rounded-full backdrop-blur-md border border-white/10"
                  >
                    {activeSeekIndicator.side === "left"
                      ? <><ChevronsLeft className="h-6 w-6 text-cyan-300 animate-pulse" /><span className="text-xs font-black tracking-widest">-10s</span></>
                      : <><ChevronsRight className="h-6 w-6 text-cyan-300 animate-pulse" /><span className="text-xs font-black tracking-widest">+10s</span></>
                    }
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Desktop hover seek buttons */}
            <div className="absolute inset-y-0 left-0 w-16 flex items-center justify-start pl-4 pointer-events-none z-20">
              <button
                onClick={(e) => { e.stopPropagation(); seekBy(-10); }}
                className="player-controls pointer-events-auto h-12 w-12 rounded-full bg-black/50 hover:bg-emerald-400/80 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-4 group-hover:translate-x-0 hidden md:flex"
                title="Rewind 10s"
              >
                <ChevronsLeft size={20} />
              </button>
            </div>
            <div className="absolute inset-y-0 right-0 w-16 flex items-center justify-end pr-4 pointer-events-none z-20">
              <button
                onClick={(e) => { e.stopPropagation(); seekBy(10); }}
                className="player-controls pointer-events-auto h-12 w-12 rounded-full bg-black/50 hover:bg-emerald-400/80 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0 hidden md:flex"
                title="Forward 10s"
              >
                <ChevronsRight size={20} />
              </button>
            </div>

            {/* Loading */}
            {playerStatus === "loading" && selectedChannel && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-10">
                <div className="w-10 h-10 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-bold tracking-wider text-cyan-300 animate-pulse">FETCHING STREAM...</span>
              </div>
            )}

            {/* Error */}
            {playerStatus === "error" && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 z-10 px-6 text-center">
                <AlertCircle className="text-rose-400" size={40} />
                <span className="text-base font-bold">Stream Currently Unavailable</span>
                <span className="text-xs text-slate-400 max-w-sm">This live stream might be offline or blocked by the broadcaster.</span>
                <button
                  onClick={handleReload}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-xs font-bold rounded-xl border border-white/10 transition"
                >
                  <RefreshCw size={12} /> Try Reconnecting
                </button>
              </div>
            )}

            {/* Idle */}
            {playerStatus === "idle" && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-10">
                <Radio size={40} className="text-slate-500 animate-pulse" />
                <span className="text-sm text-slate-300 font-medium">Select a channel to play</span>
              </div>
            )}

            {/* Controls overlay */}
            {selectedChannel && (
              <div
                className={`player-controls absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-all duration-300 z-20 ${
                  isFullscreen ? "p-2 pb-[max(8px,env(safe-area-inset-bottom))]" : "p-3 sm:p-5"
                } ${showControls || playerStatus !== "playing" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Seek bar (your file — VOD support) */}
                {canSeek && (
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-slate-300">
                    <span className="w-9 shrink-0 text-right tabular-nums">{formatTime(currentTime)}</span>
                    <input
                      type="range" min="0" max={duration || 0} step="1"
                      value={Math.min(currentTime, duration || 0)}
                      onChange={(e) => seekTo(e.target.value)}
                      className="h-1 min-w-0 flex-1 accent-emerald-400"
                      aria-label="Seek video"
                    />
                    <span className="w-9 shrink-0 tabular-nums">{formatTime(duration)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  {/* Left: channel info */}
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                      <Radio size={10} />
                      {playerStatus === "playing" ? "Live now" : "Ready"}
                    </p>
                    <h2 className={`truncate font-black leading-tight ${isFullscreen ? "text-sm" : "text-base sm:text-2xl"}`}>
                      {selectedChannel?.name || "Admin-managed IPTV"}
                    </h2>
                    {!isFullscreen && (
                      <p className="truncate text-xs text-slate-400">{selectedSource?.name || "No source"}</p>
                    )}
                  </div>

                  {/* Right: buttons */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={playPause} className={`rounded-xl bg-white text-slate-950 hover:bg-cyan-200 ${isFullscreen ? "p-2" : "p-3"}`} title={isPaused ? "Play" : "Pause"}>
                      {isPaused ? <Play size={isFullscreen ? 15 : 18} fill="currentColor" /> : <Pause size={isFullscreen ? 15 : 18} fill="currentColor" />}
                    </button>
                    <button onClick={toggleMute} className={`rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 ${isFullscreen ? "p-2" : "p-3"}`} title={isMuted ? "Unmute" : "Mute"}>
                      {isMuted ? <VolumeX size={isFullscreen ? 15 : 18} /> : <Volume2 size={isFullscreen ? 15 : 18} />}
                    </button>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => changeVolume(e.target.value)}
                      className="hidden h-1 w-20 accent-cyan-300 sm:block"
                      aria-label="Volume"
                    />
                    {/* Zoom button — fullscreen only */}
                    {isFullscreen && (
                      <button
                        onClick={cycleZoom}
                        className={`rounded-xl border p-2 ${videoZoom > 1 ? "border-cyan-400/50 bg-cyan-400/20 text-cyan-300" : "border-white/10 bg-white/10 hover:bg-white/20"}`}
                        title={`Zoom ${videoZoom.toFixed(1)}x`}
                      >
                        {videoZoom > 1 ? <Scan size={15} /> : <ZoomIn size={15} />}
                      </button>
                    )}
                    <button onClick={pip} className={`rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 ${isFullscreen ? "p-2" : "p-3"} ${isPip ? "text-cyan-300 bg-cyan-400/20 border-cyan-400/50" : ""}`} title="Picture in Picture">
                      <PictureInPicture size={isFullscreen ? 15 : 18} />
                    </button>
                    <button onClick={handleReload} className={`rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 ${isFullscreen ? "p-2" : "p-3"}`} title="Reload stream">
                      <RotateCw size={isFullscreen ? 15 : 18} />
                    </button>
                    <button onClick={toggleFullscreen} className={`rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 ${isFullscreen ? "p-2" : "p-3"}`} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                      {isFullscreen ? <Minimize size={isFullscreen ? 15 : 18} /> : <Maximize size={isFullscreen ? 15 : 18} />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Segments (your file) ── */}
          {config.segments.length > 0 && (
            <section className="grid gap-4 md:grid-cols-2">
              {config.segments.map((segment) => (
                <article key={segment.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#101827]/85">
                  <div className="relative h-48 bg-slate-900 sm:h-56">
                    {segment.artwork ? (
                      <img src={segment.artwork} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-amber-500/20">
                        <Tv size={42} className="text-white/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#101827] via-[#101827]/35 to-transparent" />
                    <span className="absolute left-4 top-4 rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-slate-950">{segment.badge || "Featured"}</span>
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <h3 className="text-2xl font-black">{segment.title}</h3>
                      {segment.description && <p className="mt-1 line-clamp-2 text-sm text-slate-300">{segment.description}</p>}
                      <button
                        onClick={() => playFirstSegmentChannel(segment)}
                        disabled={!segment.channels.length}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Play size={16} fill="currentColor" /> Watch Free
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>

        {/* ── Channel Desk (your file) ── */}
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search channels"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="custom-scrollbar mt-4 max-h-[620px] space-y-5 overflow-y-auto pr-1">
            {loading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
                ))}
              </div>
            )}
            {error && (
              <div className="flex gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm font-bold text-rose-200">
                <AlertCircle size={16} /> {error}
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
                                      {active && <Play size={14} fill="currentColor" className="text-emerald-300" />}
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
