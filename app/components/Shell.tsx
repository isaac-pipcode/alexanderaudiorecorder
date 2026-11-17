"use client";

import { useEffect, useState } from "react";
import { desktop } from "../lib/desktop";
import DesktopOnly from "./DesktopOnly";
import DownloadPanel from "./DownloadPanel";
import SettingsPanel from "./SettingsPanel";
import SpotifyPanel from "./SpotifyPanel";
import VideoPanel from "./VideoPanel";
import YoutubePanel from "./YoutubePanel";

export type Tab = "spotify" | "youtube" | "download" | "video" | "settings";

const TABS: { id: Tab; label: string; rec?: boolean }[] = [
  { id: "spotify", label: "⦿ REC · FITA K7", rec: true },
  { id: "youtube", label: "✂ SPLICE · YOUTUBE" },
  { id: "download", label: "⬇ DUB · BAIXAR" },
  { id: "video", label: "🎞 VÍDEO" },
  { id: "settings", label: "⚙ AJUSTES" },
];

export default function Shell({ initialTab = "spotify" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  // SpotifyPanel remonta ao trocar o Client ID nos Ajustes.
  const [spotifyKey, setSpotifyKey] = useState("");

  useEffect(() => setIsDesktop(desktop() !== null), []);

  if (isDesktop === null) return null;
  if (!isDesktop) return <main><DesktopOnly /></main>;

  return (
    <main>
      <div className="mb-6 flex flex-wrap justify-center gap-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`btn-key ${tab === t.id ? (t.rec ? "btn-rec" : "btn-stop") : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Painéis ficam montados para não perder gravação/jobs ao trocar de aba. */}
      <div hidden={tab !== "spotify"}>
        <SpotifyPanel key={spotifyKey} onOpenSettings={() => setTab("settings")} />
      </div>
      <div hidden={tab !== "youtube"}><YoutubePanel /></div>
      <div hidden={tab !== "download"}><DownloadPanel /></div>
      <div hidden={tab !== "video"}><VideoPanel /></div>
      <div hidden={tab !== "settings"}>
        <SettingsPanel onChange={(s) => setSpotifyKey(s.spotifyClientId)} />
      </div>
    </main>
  );
}
