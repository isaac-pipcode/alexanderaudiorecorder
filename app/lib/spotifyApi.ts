import { getAccessToken } from "./spotifyAuth";

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  durationSec: number;
  isPlaying: boolean;
};

// Equivalente ao get_current_track() do script Python original.
export async function getCurrentTrack(): Promise<Track | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 204 || res.status === 202) return null; // nada tocando
  if (!res.ok) return null;

  const data = await res.json();
  const item = data?.item;
  if (!item) return null;

  return {
    id: item.id,
    title: item.name,
    artist: item.artists.map((a: { name: string }) => a.name).join(", "),
    album: item.album?.name ?? "",
    coverUrl: item.album?.images?.[0]?.url,
    durationSec: item.duration_ms / 1000,
    isPlaying: Boolean(data.is_playing),
  };
}
