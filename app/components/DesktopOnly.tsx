"use client";

/** Aviso exibido quando a UI é aberta num navegador comum, fora do app. */
export default function DesktopOnly() {
  return (
    <div className="panel">
      <h2 className="label-marker text-2xl text-rust">Aparelho desligado da tomada</h2>
      <p className="mt-2 text-sm">
        Esta interface agora roda dentro do <b>app desktop Alexander Audio Tools</b>
        (Windows, macOS e Linux). Baixe o instalador na página de Releases do
        repositório e abra o programa.
      </p>
    </div>
  );
}
