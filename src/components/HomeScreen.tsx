import { Video, Plus, LogIn, ShieldCheck, Zap, Users } from "lucide-react";

type Props = {
  onCreate: () => void;
  onJoin: () => void;
};

const FEATURES = [
  { icon: Zap, label: "Instant rooms", detail: "No downloads, no setup" },
  { icon: ShieldCheck, label: "Private by default", detail: "Codes expire with the room" },
  { icon: Users, label: "Up to 8 people", detail: "Grid or speaker view" },
];

export default function HomeScreen({ onCreate, onJoin }: Props) {
  return (
    <div className="kv-rise flex flex-1 flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        {/* logo */}
        <div className="mb-9 flex flex-col items-center text-center">
          <div className="relative mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-cyan-400 to-teal-500 shadow-lg shadow-cyan-500/25">
            <span
              aria-hidden
              className="kv-ring absolute inset-0 rounded-3xl border border-cyan-400/60"
            />
            <Video className="h-9 w-9 text-slate-950" strokeWidth={2.2} />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Wavelink
          </h1>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-slate-400">
            Face-to-face in one tap. Start a room or drop in with a six-character
            code.
          </p>
        </div>

        {/* actions */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={onCreate}
            className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-cyan-400 px-5 py-4 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-300 hover:shadow-cyan-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.985]"
          >
            <Plus className="h-5 w-5 transition-transform group-hover:rotate-90" />
            Create room
          </button>

          <button
            type="button"
            onClick={onJoin}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4 font-semibold text-slate-200 backdrop-blur transition hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.985]"
          >
            <LogIn className="h-5 w-5 text-cyan-400" />
            Join with a code
          </button>
        </div>

        {/* features */}
        <ul className="mt-10 divide-y divide-slate-900 overflow-hidden rounded-2xl border border-slate-900 bg-slate-950/40">
          {FEATURES.map(({ icon: Icon, label, detail }) => (
            <li key={label} className="flex items-center gap-3.5 px-5 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-cyan-400">
                <Icon className="h-4.5 w-4.5" size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-200">
                  {label}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {detail}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-xs text-slate-600">
          By continuing you agree to be a reasonably polite human on camera.
        </p>
      </div>
    </div>
  );
}