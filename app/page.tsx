"use client";

import { useState } from "react";
import SpotifyPanel from "./components/SpotifyPanel";
import YoutubePanel from "./components/YoutubePanel";
import DownloadPanel from "./components/DownloadPanel";

type Tab = "spotify" | "youtube" | "download";

export default function Home() {
  const [tab, setTab] = useState<Tab>("spotify");

  return (
    <main>
      <div className="mb-6 flex flex-wrap justify-center gap-3">
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
        <button
          onClick={() => setTab("download")}
          className={`btn-key ${tab === "download" ? "btn-stop" : ""}`}
        >
          ⬇ DUB · BAIXAR
        </button>
      </div>

      {tab === "spotify" && <SpotifyPanel />}
      {tab === "youtube" && <YoutubePanel />}
      {tab === "download" && <DownloadPanel />}
    </main>
  );
}
