"use client";

import { useEffect, useRef } from "react";

// VU meter analógico: lê o nível real do áudio captado e move os ponteiros.
// Par estéreo (L/R), com zona vermelha à direita — bem anos 80.
export default function VuMeter({
  stream,
  active,
}: {
  stream: MediaStream | null;
  active: boolean;
}) {
  const leftRef = useRef<SVGGElement>(null);
  const rightRef = useRef<SVGGElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || !active) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const splitter = ctx.createChannelSplitter(2);
    source.connect(splitter);

    const makeAnalyser = (ch: number) => {
      const a = ctx.createAnalyser();
      a.fftSize = 1024;
      splitter.connect(a, ch);
      return a;
    };
    const aL = makeAnalyser(0);
    const aR = makeAnalyser(1);
    const bufL = new Float32Array(new ArrayBuffer(aL.fftSize * 4));
    const bufR = new Float32Array(new ArrayBuffer(aR.fftSize * 4));

    // suavização do ponteiro (ballística do VU real)
    let smoothL = 0;
    let smoothR = 0;

    const rms = (buf: Float32Array<ArrayBuffer>, analyser: AnalyserNode) => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    };

    // mapeia nível [0..1] -> ângulo do ponteiro [-42deg .. +42deg]
    const toAngle = (level: number) => {
      const boosted = Math.min(1, Math.pow(level * 4.5, 0.6));
      return -42 + boosted * 84;
    };

    const draw = () => {
      const lvlL = rms(bufL, aL);
      const lvlR = rms(bufR, aR);
      smoothL += (lvlL - smoothL) * 0.25;
      smoothR += (lvlR - smoothR) * 0.25;
      if (leftRef.current)
        leftRef.current.setAttribute("transform", `rotate(${toAngle(smoothL)} 100 96)`);
      if (rightRef.current)
        rightRef.current.setAttribute("transform", `rotate(${toAngle(smoothR)} 100 96)`);
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      splitter.disconnect();
      ctx.close();
    };
  }, [stream, active]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Gauge label="L" needleRef={leftRef} live={active} />
      <Gauge label="R" needleRef={rightRef} live={active} />
    </div>
  );
}

function Gauge({
  label,
  needleRef,
  live,
}: {
  label: string;
  needleRef: React.RefObject<SVGGElement>;
  live: boolean;
}) {
  // arco de marcas; as últimas viram a zona vermelha (+3 .. +6 dB)
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const angle = -42 + (i / 10) * 84;
    const red = i >= 8;
    return { angle, red };
  });

  return (
    <div className="vu-face">
      <svg viewBox="0 0 200 110" className="w-full">
        {/* arco da zona vermelha */}
        <path
          d="M 138 40 A 70 70 0 0 1 168 78"
          fill="none"
          stroke="#b5471f"
          strokeWidth="4"
          opacity="0.8"
        />
        {/* marcas */}
        {ticks.map((t, i) => {
          const rad = ((t.angle - 90) * Math.PI) / 180;
          const x1 = 100 + Math.cos(rad) * 62;
          const y1 = 96 + Math.sin(rad) * 62;
          const x2 = 100 + Math.cos(rad) * 72;
          const y2 = 96 + Math.sin(rad) * 72;
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={t.red ? "#b5471f" : "#2b2118"}
              strokeWidth={t.red ? 2.5 : 1.5}
            />
          );
        })}
        {/* escala "VU" e dB */}
        <text x="44" y="40" className="vu-text">-20</text>
        <text x="96" y="26" className="vu-text">0</text>
        <text x="150" y="40" className="vu-text">+6</text>
        <text x="100" y="70" textAnchor="middle" className="vu-vu">VU</text>
        {/* ponteiro */}
        <g ref={needleRef} transform="rotate(-42 100 96)">
          <line x1="100" y1="96" x2="100" y2="30" stroke="#1a1410" strokeWidth="2" />
          <circle cx="100" cy="96" r="5" fill="#1a1410" />
        </g>
      </svg>
      <div className={`vu-led ${live ? "vu-led-on" : ""}`} />
      <span className="vu-chan label-marker">{label}</span>
    </div>
  );
}
