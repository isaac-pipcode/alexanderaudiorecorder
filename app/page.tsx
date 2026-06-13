"use client";

import { useState } from "react";
import SpotifyPanel from "./components/SpotifyPanel";
import YoutubePanel from "./components/YoutubePanel";

type Tab = "spotify" | "youtube";

export default function Home() {
  const [tab, setTab] = useState<Tab>("spotify");

  return (
    <main>
      <div className="mb-6 inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-1">
        <TabButton active={tab === "spotify"} onClick={() => setTab("spotify")}>
          Spotify
        </TabButton>
        <TabButton active={tab === "youtube"} onClick={() => setTab("youtube")}>
          YouTube
        </TabButton>
      </div>

      {tab === "spotify" ? <SpotifyPanel /> : <YoutubePanel />}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-brand text-black"
          : "text-neutral-400 hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}
