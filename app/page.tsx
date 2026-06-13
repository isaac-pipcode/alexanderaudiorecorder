"use client";

import { useState } from "react";
import SpotifyPanel from "./components/SpotifyPanel";
import YoutubePanel from "./components/YoutubePanel";

type Tab = "spotify" | "youtube";

export default function Home() {
  const [tab, setTab] = useState<Tab>("spotify");

  return (
    <main>
      <div className="mb-6 flex justify-center gap-3">
        <button
          onClick={() => setTab("spotify")}
          className={`btn-key ${tab === "spotify" ? "btn-rec" : ""}`}
        >
          ⦿ REC · FITA K7
        </button>
        <button
          onClick={() => setTab("youtube")}
          className={`btn-key ${tab === "youtube" ? "btn-stop" : ""}`}
        >
          ✂ SPLICE · YOUTUBE
        </button>
      </div>

      {tab === "spotify" ? <SpotifyPanel /> : <YoutubePanel />}
    </main>
  );
}
