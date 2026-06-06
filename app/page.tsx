"use client";

import BackgroundScene from "./components/BackgroundScene";
import Header from "./components/Header";
import IPTVPlayer from "./components/IPTVPlayer";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      <BackgroundScene />
      <div className="relative z-10">
        <Header />
        <IPTVPlayer />
      </div>
    </main>
  );
}
