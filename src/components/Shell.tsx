import type { ReactNode } from "react";

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 font-sans antialiased relative overflow-hidden">
      {/* ambient light */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-200px] right-[-120px] h-[420px] w-[420px] rounded-full bg-teal-400/10 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.14) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8 sm:px-6 sm:py-12">
        {children}
      </div>

      <style>{`
        @keyframes kv-rise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .kv-rise { animation: kv-rise 380ms cubic-bezier(.22,1,.36,1) both; }
        @keyframes kv-pulse-ring {
          0%   { transform: scale(0.9); opacity: .7; }
          70%  { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .kv-ring { animation: kv-pulse-ring 2.4s ease-out infinite; }
      `}</style>
    </div>
  );
}