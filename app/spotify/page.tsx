import Shell from "../components/Shell";

// Esta rota é a Redirect URI do OAuth do Spotify (http://127.0.0.1:47816/spotify).
// O SpotifyPanel trata o ?code=... automaticamente ao montar.
export default function SpotifyPage() {
  return <Shell initialTab="spotify" />;
}
