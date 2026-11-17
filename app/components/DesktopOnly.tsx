/** Aviso exibido quando a interface do programa é aberta num navegador comum. */
export default function DesktopOnly() {
  return (
    <div className="panel">
      <h2 className="label-marker text-2xl text-rust">Aparelho desligado da tomada</h2>
      <p className="mt-2 text-sm">
        Esta interface roda dentro do <b>programa Alexander Audio Tools</b>
        (Windows, macOS e Linux).
      </p>
      <a href="/" className="btn-key btn-rec mt-4">⬇ BAIXAR O PROGRAMA</a>
    </div>
  );
}
