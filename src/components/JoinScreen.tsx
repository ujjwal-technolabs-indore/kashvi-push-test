import { useState } from "react";
import { ArrowLeft, LogIn, AlertCircle } from "lucide-react";
import RoomCodeInput from "./RoomCodeInput";
import { isValidCode, sanitizeCode } from "../lib/room";

type Props = {
  onBack: () => void;
  onJoin: (code: string) => void;
};

export default function JoinScreen({ onBack, onJoin }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const clean = sanitizeCode(code);
    if (!isValidCode(clean)) {
      setError("Room codes are 6 characters — check and try again.");
      return;
    }
    setError(null);
    setBusy(true);
    // simulate handshake with the signalling server
    window.setTimeout(() => {
      setBusy(false);
      onJoin(clean);
    }, 550);
  };

  return (
    <div className="kv-rise flex flex-1 flex-col">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-900 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="flex flex-1 flex-col justify-center">
        <div className="mx-auto w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Join a call
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-white">
            Enter the room code
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
            Ask the host for their six-character code. Letters and numbers only —
            case doesn&apos;t matter.
          </p>

          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur">
            <label
              htmlFor="code-0"
              className="mb-3 block text-xs font-semibold uppercase tracking-wider text-slate-400"
            >
              Room code
            </label>

            <RoomCodeInput
              value={code}
              invalid={!!error}
              onChange={(v) => {
                setCode(v);
                if (error) setError(null);
              }}
              onComplete={submit}
            />

            {error ? (
              <p className="mt-4 flex items-start gap-2 text-sm text-rose-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                {code.length}/6 characters entered
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy || code.length === 0}
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl bg-cyan-400 px-5 py-3.5 font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cyan-400"
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                  Connecting…
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  Join room
                </>
              )}
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-slate-600">
            Tip: you can paste a full code straight into the first box.
          </p>
        </div>
      </div>
    </div>
  );
}