import { useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Copy,
  Check,
  Users,
} from "lucide-react";
import { formatCode } from "../lib/room";

type Props = {
  code: string;
  isHost: boolean;
  onLeave: () => void;
};

export default function RoomScreen({ code, isHost, onLeave }: Props) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [copied, setCopied] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;

  return (
    <div className="kv-rise flex flex-1 flex-col">
      {/* top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="kv-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">
              {isHost ? "Your room" : "Connected"}
            </p>
            <p className="font-mono text-xs text-slate-500">{mmss} elapsed</p>
          </div>
        </div>

        <button
          type="button"
          onClick={copy}
          className="group inline-flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2 backdrop-blur transition hover:border-slate-700 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <span className="font-mono text-sm font-bold tracking-[0.2em] text-cyan-300">
            {formatCode(code)}
          </span>
          {copied ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4 text-slate-500 transition group-hover:text-slate-300" />
          )}
        </button>
      </div>

      {/* stage */}
      <div className="mt-6 flex flex-1 flex-col">
        <div className="relative flex-1 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900">
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div>
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-slate-800/80 text-slate-400">
                <Users className="h-7 w-7" />
              </div>
              <p className="font-display text-xl font-bold tracking-tight text-white">
                Waiting for others to join
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
                Share the code{" "}
                <span className="font-mono font-semibold text-cyan-300">
                  {formatCode(code)}
                </span>{" "}
                and they&apos;ll appear here the moment they connect.
              </p>
            </div>
          </div>

          {/* self preview */}
          <div className="absolute bottom-4 right-4 h-28 w-20 overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-800 shadow-xl sm:h-36 sm:w-28">
            {camOn ? (
              <div className="grid h-full w-full place-items-center bg-gradient-to-br from-cyan-500/30 to-teal-600/20">
                <span className="font-display text-2xl font-bold text-white/90">
                  You
                </span>
              </div>
            ) : (
              <div className="grid h-full w-full place-items-center bg-slate-900">
                <VideoOff className="h-5 w-5 text-slate-600" />
              </div>
            )}
            {!micOn && (
              <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-rose-500/90">
                <MicOff className="h-3.5 w-3.5 text-white" />
              </span>
            )}
          </div>
        </div>

        {/* controls */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <ControlButton
            active={micOn}
            onClick={() => setMicOn((v) => !v)}
            label={micOn ? "Mute microphone" : "Unmute microphone"}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </ControlButton>

          <ControlButton
            active={camOn}
            onClick={() => setCamOn((v) => !v)}
            label={camOn ? "Turn camera off" : "Turn camera on"}
          >
            {camOn ? (
              <VideoIcon className="h-5 w-5" />
            ) : (
              <VideoOff className="h-5 w-5" />
            )}
          </ControlButton>

          <button
            type="button"
            onClick={onLeave}
            aria-label="Leave room"
            className="inline-flex items-center gap-2 rounded-2xl bg-rose-500 px-6 py-3.5 font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.97]"
          >
            <PhoneOff className="h-5 w-5" />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={!active}
      className={[
        "grid h-14 w-14 place-items-center rounded-2xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.96]",
        active
          ? "border-slate-800 bg-slate-900/70 text-slate-200 hover:border-slate-700 hover:bg-slate-900 focus-visible:ring-slate-500"
          : "border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 focus-visible:ring-rose-400",
      ].join(" ")}
    >
      {children}
    </button>
  );
}