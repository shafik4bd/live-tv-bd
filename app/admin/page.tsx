"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  FileJson,
  Link2,
  Megaphone,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import BackgroundScene from "../components/BackgroundScene";
import { Channel, IPTVConfig, Playlist, Segment } from "../lib/iptv-types";
import { normalizeChannels, parsePlaylistText } from "../lib/playlist-parser";

const emptyConfig: IPTVConfig = {
  segments: [],
  playlists: [],
  popup: {
    enabled: false,
    title: "Live event announcement",
    body: "Add a custom popup message from the admin panel.",
    image: "",
    cta: "Start watching",
  },
  updatedAt: new Date(0).toISOString(),
};

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [config, setConfig] = useState<IPTVConfig>(emptyConfig);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [segmentTitle, setSegmentTitle] = useState("");
  const [segmentDescription, setSegmentDescription] = useState("");
  const [segmentBadge, setSegmentBadge] = useState("Featured");
  const [segmentArtwork, setSegmentArtwork] = useState("");
  const [segmentStreamUrl, setSegmentStreamUrl] = useState("");
  const [segmentChannelName, setSegmentChannelName] = useState("");
  const [segmentChannelLogo, setSegmentChannelLogo] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const playlistFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((res) => res.json())
      .then((data) => setConfig({ ...emptyConfig, ...data, popup: { ...emptyConfig.popup, ...data.popup } }))
      .catch(() => setError("Could not load admin config."));
  }, []);

  const totals = useMemo(() => {
    const segmentChannels = config.segments.reduce((sum, item) => sum + item.channels.length, 0);
    const playlistChannels = config.playlists.reduce((sum, item) => sum + item.channels.length, 0);
    return { segmentChannels, playlistChannels };
  }, [config]);

  const saveConfig = async (nextConfig = config) => {
    setStatus("Saving...");
    setError("");
    const response = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, config: nextConfig }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus("");
      setError(data.error || "Save failed.");
      return false;
    }
    setConfig(data.config);
    setStatus("Saved");
    setTimeout(() => setStatus(""), 1800);
    return true;
  };

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await saveConfig(config);
    if (ok) setUnlocked(true);
  };

  const addSegment = () => {
    if (!segmentTitle.trim()) {
      setError("Segment title is required.");
      return;
    }
    const next: Segment = {
      id: uid("segment"),
      title: segmentTitle.trim(),
      description: segmentDescription.trim(),
      badge: segmentBadge.trim() || "Featured",
      artwork: segmentArtwork.trim(),
      channels: [],
    };
    setConfig((prev) => ({ ...prev, segments: [next, ...prev.segments] }));
    setSegmentTitle("");
    setSegmentDescription("");
    setSegmentBadge("Featured");
    setSegmentArtwork("");
  };

  const addSingleStreamToSegment = (segmentId: string) => {
    if (!segmentStreamUrl.trim() || !segmentChannelName.trim()) {
      setError("Channel name and stream URL are required.");
      return;
    }
    const channel: Channel = {
      id: uid("single"),
      name: segmentChannelName.trim(),
      logo: segmentChannelLogo.trim(),
      group: "Segment",
      url: segmentStreamUrl.trim(),
    };
    setConfig((prev) => ({
      ...prev,
      segments: prev.segments.map((segment) =>
        segment.id === segmentId ? { ...segment, channels: [...segment.channels, channel] } : segment
      ),
    }));
    setSegmentChannelName("");
    setSegmentChannelLogo("");
  };

  const handleSegmentFile = (segmentId: string, file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const data = JSON.parse(text);
        const list = Array.isArray(data) ? data : data.channels || data.items || [];
        const channels = normalizeChannels(
          list.map((item: Record<string, string>) => ({ ...item, url: item.url || segmentStreamUrl })),
          "segment-upload"
        );
        if (!channels.length) throw new Error("No valid channels found.");
        setConfig((prev) => ({
          ...prev,
          segments: prev.segments.map((segment) =>
            segment.id === segmentId ? { ...segment, channels: [...segment.channels, ...channels] } : segment
          ),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not parse segment JSON.");
      }
    };
    reader.readAsText(file);
  };

  const handlePlaylistFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const channels = parsePlaylistText(String(reader.result || ""), "upload");
        if (!channels.length) throw new Error("No channels found in playlist.");
        const playlist: Playlist = {
          id: uid("playlist"),
          name: playlistName.trim() || file.name.replace(/\.[^/.]+$/, ""),
          type: file.name.endsWith(".json") ? "json" : "m3u",
          channels,
        };
        setConfig((prev) => ({ ...prev, playlists: [playlist, ...prev.playlists] }));
        setPlaylistName("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not parse playlist.");
      }
    };
    reader.readAsText(file);
  };

  const importPlaylistUrl = async (event: FormEvent) => {
    event.preventDefault();
    if (!playlistUrl.trim()) return;
    setStatus("Importing URL...");
    setError("");
    const response = await fetch("/api/admin/import-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, url: playlistUrl.trim() }),
    });
    const data = await response.json();
    setStatus("");
    if (!response.ok) {
      setError(data.error || "URL import failed.");
      return;
    }
    const playlist: Playlist = {
      id: uid("playlist"),
      name: playlistName.trim() || new URL(playlistUrl).hostname,
      type: data.channels.some((channel: Channel) => channel.sourceType === "ott-json")
        ? "ott-json"
        : playlistUrl.toLowerCase().includes("json")
          ? "json"
          : "m3u",
      source: playlistUrl.trim(),
      channels: data.channels,
    };
    setConfig((prev) => ({ ...prev, playlists: [playlist, ...prev.playlists] }));
    setPlaylistName("");
    setPlaylistUrl("");
  };

  const removeSegment = (id: string) =>
    setConfig((prev) => ({ ...prev, segments: prev.segments.filter((segment) => segment.id !== id) }));

  const removePlaylist = (id: string) =>
    setConfig((prev) => ({ ...prev, playlists: prev.playlists.filter((playlist) => playlist.id !== id) }));

  const removeSegmentChannel = (segmentId: string, channelId: string) =>
    setConfig((prev) => ({
      ...prev,
      segments: prev.segments.map((segment) =>
        segment.id === segmentId
          ? { ...segment, channels: segment.channels.filter((channel) => channel.id !== channelId) }
          : segment
      ),
    }));

  return (
    <main className="relative min-h-screen text-white">
      <BackgroundScene />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10">
            <ArrowLeft size={16} />
            Home
          </Link>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Control Room</p>
            <h1 className="text-2xl font-black sm:text-4xl">IPTV Admin Panel</h1>
          </div>
        </header>

        {!unlocked ? (
          <form onSubmit={unlock} className="mx-auto mt-16 max-w-md rounded-2xl border border-white/10 bg-[#101827]/90 p-6 shadow-2xl">
            <h2 className="text-xl font-black">Admin access</h2>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Admin PIN"
              className="mt-5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-emerald-400"
            />
            <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 hover:bg-emerald-400">
              <Save size={16} />
              Unlock panel
            </button>
            {error && <p className="mt-3 text-sm font-semibold text-rose-300">{error}</p>}
          </form>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="space-y-3">
              {[
                ["Segments", config.segments.length],
                ["Segment Channels", totals.segmentChannels],
                ["Playlists", config.playlists.length],
                ["Playlist Channels", totals.playlistChannels],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
                  <p className="mt-1 text-3xl font-black">{value}</p>
                </div>
              ))}
              <button onClick={() => saveConfig()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300">
                <Save size={16} />
                Save changes
              </button>
              {status && <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200">{status}</p>}
              {error && (
                <p className="flex gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm font-bold text-rose-200">
                  <AlertCircle size={16} />
                  {error}
                </p>
              )}
            </aside>

            <section className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-[#0f172a]/90 p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-amber-300" size={20} />
                  <h2 className="text-xl font-black">Featured Segments</h2>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input value={segmentTitle} onChange={(e) => setSegmentTitle(e.target.value)} placeholder="Segment title, e.g. FIFA World Cup" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-amber-300" />
                  <input value={segmentBadge} onChange={(e) => setSegmentBadge(e.target.value)} placeholder="Badge" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-amber-300" />
                  <input value={segmentArtwork} onChange={(e) => setSegmentArtwork(e.target.value)} placeholder="Artwork URL" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-amber-300 md:col-span-2" />
                  <textarea value={segmentDescription} onChange={(e) => setSegmentDescription(e.target.value)} placeholder="Short description" className="min-h-24 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-amber-300 md:col-span-2" />
                </div>
                <button onClick={addSegment} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 hover:bg-amber-200">
                  <Plus size={16} />
                  Create segment
                </button>
              </div>

              {config.segments.map((segment) => (
                <div key={segment.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-amber-300">{segment.badge}</p>
                      <h3 className="text-2xl font-black">{segment.title}</h3>
                      <p className="mt-1 text-sm text-slate-400">{segment.channels.length} channels</p>
                    </div>
                    <button onClick={() => removeSegment(segment.id)} className="rounded-lg border border-rose-400/20 p-2 text-rose-300 hover:bg-rose-400/10" title="Delete segment">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
                    <input value={segmentStreamUrl} onChange={(e) => setSegmentStreamUrl(e.target.value)} placeholder="Shared stream URL" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-cyan-300" />
                    <input value={segmentChannelName} onChange={(e) => setSegmentChannelName(e.target.value)} placeholder="Channel name" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-cyan-300" />
                    <input value={segmentChannelLogo} onChange={(e) => setSegmentChannelLogo(e.target.value)} placeholder="Logo URL" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-cyan-300" />
                    <button onClick={() => addSingleStreamToSegment(segment.id)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300">
                      <Plus size={16} />
                      Add
                    </button>
                    <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black hover:bg-white/10">
                      <Upload size={16} />
                      JSON
                      <input type="file" accept=".json" className="hidden" onChange={(e) => handleSegmentFile(segment.id, e.target.files?.[0])} />
                    </label>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {segment.channels.map((channel) => (
                      <div key={channel.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                        {channel.logo ? <img src={channel.logo} alt="" className="h-10 w-10 rounded-lg object-contain bg-white" /> : <div className="h-10 w-10 rounded-lg bg-white/10" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black">{channel.name}</p>
                          <p className="truncate text-xs text-slate-500">{channel.url}</p>
                        </div>
                        <button onClick={() => removeSegmentChannel(segment.id, channel.id)} className="p-2 text-slate-400 hover:text-rose-300" title="Remove channel">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="rounded-2xl border border-white/10 bg-[#0f172a]/90 p-5">
                <div className="flex items-center gap-2">
                  <FileJson className="text-cyan-300" size={20} />
                  <h2 className="text-xl font-black">Playlist Library</h2>
                </div>
                <form onSubmit={importPlaylistUrl} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
                  <input value={playlistName} onChange={(e) => setPlaylistName(e.target.value)} placeholder="Playlist name" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-cyan-300" />
                  <input value={playlistUrl} onChange={(e) => setPlaylistUrl(e.target.value)} placeholder="JSON or M3U link" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-cyan-300" />
                  <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300">
                    <Link2 size={16} />
                    Import link
                  </button>
                  <button type="button" onClick={() => playlistFileRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black hover:bg-white/10">
                    <Upload size={16} />
                    Upload file
                  </button>
                  <input ref={playlistFileRef} type="file" accept=".json,.m3u,.m3u8" className="hidden" onChange={(e) => handlePlaylistFile(e.target.files?.[0])} />
                </form>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {config.playlists.map((playlist) => (
                    <div key={playlist.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-black">{playlist.name}</p>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{playlist.channels.length} channels · {playlist.type}</p>
                      </div>
                      <button onClick={() => removePlaylist(playlist.id)} className="rounded-lg border border-rose-400/20 p-2 text-rose-300 hover:bg-rose-400/10" title="Delete playlist">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0f172a]/90 p-5">
                <div className="flex items-center gap-2">
                  <Megaphone className="text-emerald-300" size={20} />
                  <h2 className="text-xl font-black">Popup</h2>
                </div>
                <label className="mt-4 flex items-center gap-3 text-sm font-bold">
                  <input type="checkbox" checked={config.popup.enabled} onChange={(e) => setConfig((prev) => ({ ...prev, popup: { ...prev.popup, enabled: e.target.checked } }))} />
                  Show popup on home page
                </label>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input value={config.popup.title} onChange={(e) => setConfig((prev) => ({ ...prev, popup: { ...prev.popup, title: e.target.value } }))} placeholder="Popup title" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-emerald-300" />
                  <input value={config.popup.cta} onChange={(e) => setConfig((prev) => ({ ...prev, popup: { ...prev.popup, cta: e.target.value } }))} placeholder="Button text" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-emerald-300" />
                  <input value={config.popup.image} onChange={(e) => setConfig((prev) => ({ ...prev, popup: { ...prev.popup, image: e.target.value } }))} placeholder="Image URL" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-emerald-300 md:col-span-2" />
                  <textarea value={config.popup.body} onChange={(e) => setConfig((prev) => ({ ...prev, popup: { ...prev.popup, body: e.target.value } }))} placeholder="Popup message" className="min-h-24 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-emerald-300 md:col-span-2" />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
