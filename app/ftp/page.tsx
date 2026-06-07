"use client";

import { motion } from "motion/react";
import {
  ArrowUpRight,
  CheckCircle2,
  Database,
  FolderOpen,
  Globe,
  HardDrive,
  Network,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";

import BackgroundScene from "../components/BackgroundScene";
import Header from "../components/Header";

const ftpServers = [
  {
    id: "server-1",
    name: "BDIX Server 1",
    host: "103.225.94.27",
    url: "http://103.225.94.27/Infobase/",
    description: "Local BDIX media archive with movies, TV shows, games, and software collections.",
    badge: "Local Archive",
    speed: "100 Mbps+",
    protocol: "HTTP",
    scope: "BDIX Peered ISP",
    icon: Database,
    accent: "emerald",
  },
  {
    id: "server-2",
    name: "FTPBD Server",
    host: "server1.ftpbd.net",
    url: "https://server1.ftpbd.net/#blog",
    description: "Popular FTP media portal with fresh releases, series, movies, games, and blog updates.",
    badge: "Media Portal",
    speed: "100 Mbps+",
    protocol: "HTTPS",
    scope: "Public Access",
    icon: Network,
    accent: "cyan",
  },
];

const summary = [
  { label: "Network", value: "BDIX", icon: Globe },
  { label: "Servers", value: "2 Online", icon: Server },
  { label: "Speed", value: "100 Mbps+", icon: Zap },
  { label: "Library", value: "TB+ Files", icon: HardDrive },
];

export default function FtpPage() {
  return (
    <main className="relative min-h-screen overflow-hidden pb-12 text-white">
      <BackgroundScene />
      <div className="relative z-10">
        <Header />

        <section className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-8">
          <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="max-w-2xl"
            >
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">FTP Directory</span>
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">BDIX Server Access</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
                Fast local media servers for BDIX peered networks. Pick a server, check the host details, and open it in a new tab.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 }}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[560px]"
            >
              {summary.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Icon size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
                    </div>
                    <p className="mt-1 text-sm font-black text-white">{item.value}</p>
                  </div>
                );
              })}
            </motion.div>
          </div>

          <div className="mt-6 grid gap-4">
            {ftpServers.map((server, index) => {
              const Icon = server.icon;
              const isEmerald = server.accent === "emerald";
              return (
                <motion.article
                  key={server.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.12 + index * 0.08 }}
                  className="grid gap-4 rounded-lg border border-white/10 bg-[#101827]/90 p-4 shadow-xl shadow-black/20 lg:grid-cols-[1fr_320px]"
                >
                  <div className="flex gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border ${
                        isEmerald
                          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                          : "border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
                      }`}
                    >
                      <Icon size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black sm:text-2xl">{server.name}</h2>
                        <span
                          className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider ${
                            isEmerald ? "bg-emerald-400/10 text-emerald-300" : "bg-cyan-400/10 text-cyan-300"
                          }`}
                        >
                          {server.badge}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{server.description}</p>

                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-md border border-white/10 bg-slate-950/35 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Host</p>
                          <p className="mt-1 truncate font-mono text-xs text-slate-200">{server.host}</p>
                        </div>
                        <div className="rounded-md border border-white/10 bg-slate-950/35 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Speed</p>
                          <p className="mt-1 text-xs font-black text-slate-200">{server.speed}</p>
                        </div>
                        <div className="rounded-md border border-white/10 bg-slate-950/35 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Protocol</p>
                          <p className="mt-1 text-xs font-black text-slate-200">{server.protocol}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-4 rounded-lg border border-white/10 bg-slate-950/30 p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-300">
                          <CheckCircle2 size={15} />
                          Online
                        </span>
                        <span className="rounded-md bg-white/[0.06] px-2 py-1 text-[10px] font-bold text-slate-400">
                          {server.scope}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-2 text-slate-300">
                          <FolderOpen size={14} className="text-slate-500" />
                          Media library
                        </div>
                        <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-2 text-slate-300">
                          <ShieldCheck size={14} className="text-slate-500" />
                          Direct access
                        </div>
                      </div>
                    </div>

                    <a
                      href={server.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black text-slate-950 transition active:scale-[0.98] ${
                        isEmerald ? "bg-emerald-400 hover:bg-emerald-300" : "bg-cyan-300 hover:bg-cyan-200"
                      }`}
                    >
                      Open Server
                      <ArrowUpRight size={16} />
                    </a>
                  </div>
                </motion.article>
              );
            })}
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-6 text-slate-500">
            BDIX speed depends on your ISP peering and route quality. Some servers may only perform at full speed on supported local networks.
          </p>
        </section>
      </div>
    </main>
  );
}
