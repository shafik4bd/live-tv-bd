"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Play, X } from "lucide-react";
import { PopupConfig } from "../lib/iptv-types";

interface PopupProps {
  popup: PopupConfig;
}

export default function WorldCupPopup({ popup }: PopupProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!popup.enabled) return;
    const timer = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(timer);
  }, [popup.enabled, popup.title, popup.body, popup.image]);

  const close = () => {
    setOpen(false);
  };

  if (!popup.enabled) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.button
            aria-label="Close popup backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-slate-950/85 backdrop-blur-xl"
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#101827] shadow-2xl"
          >
            {popup.image ? (
              <div className="h-56 bg-slate-900">
                <img src={popup.image} alt="" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="h-32 bg-linear-to-br from-emerald-500/20 via-cyan-500/15 to-amber-500/20" />
            )}
            <button
              onClick={close}
              className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/40 p-2 text-white hover:bg-black/70"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="p-5 sm:p-6">
              <p className="text-xs font-black uppercase tracking-widest text-emerald-300">Announcement</p>
              <h3 className="mt-2 text-2xl font-black sm:text-3xl">{popup.title}</h3>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-300">{popup.body}</p>
              <button
                onClick={close}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-emerald-300"
              >
                <Play size={16} fill="currentColor" />
                {popup.cta || "Start watching"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
