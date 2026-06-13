"use client";

import SpotifyPanel from "../components/SpotifyPanel";

// Esta rota também é a Redirect URI do OAuth do Spotify.
// O SpotifyPanel trata o ?code=... automaticamente ao montar.
export default function SpotifyPage() {
  return (
    <main>
      <SpotifyPanel />
    </main>
  );
}
