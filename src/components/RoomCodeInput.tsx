import { useRef } from "react";
import { CODE_LENGTH, sanitizeCode } from "../lib/room";

type Props = {
  value: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  onComplete?: () => void;
};

export default function RoomCodeInput({
  value,
  invalid = false,
  onChange,
  onComplete,
}: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");

  const focusAt = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))];
    el?.focus();
    el?.select();
  };

  const setAt = (index: number, ch: string) => {
    const next = [...chars];
    next[index] = ch;
    onChange(sanitizeCode(next.join("")));
  };

  const handleChange = (index: number, raw: string) => {
    const clean = sanitizeCode(raw);
    if (!clean) {
      setAt(index, "");
      return;
    }
    if (clean.length > 1) {
      // pasted / multi-char: fill forward from here
      const next = [...chars];
      for (let i = 0; i < clean.length && index + i < CODE_LENGTH; i++) {
        next[index + i] = clean[i];
      }
      const merged = sanitizeCode(next.join(""));
      onChange(merged);
      const landing = Math.min(index + clean.length, CODE_LENGTH - 1);
      focusAt(landing);
      if (merged.length === CODE_LENGTH) onComplete?.();
      return;
    }
    setAt(index, clean);
    if (index < CODE_LENGTH - 1) focusAt(index + 1);
    else if (sanitizeCode([...chars.slice(0, index), clean].join("")).length === CODE_LENGTH) {
      onComplete?.();
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (chars[index]) {
        setAt(index, "");
      } else if (index > 0) {
        setAt(index - 1, "");
        focusAt(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(index + 1);
    } else if (e.key === "Enter") {
      onComplete?.();
    }
  };

  return (
    <div className="flex items-center gap-2 sm:gap-2.5">
      {chars.map((ch, i) => (
        <div key={i} className="contents">
          <input
            id={`code-${i}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={ch}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label={`Room code character ${i + 1}`}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            className={[
              "h-14 w-full min-w-0 rounded-xl border bg-slate-950/70 text-center font-mono text-xl font-bold uppercase text-white caret-cyan-400 outline-none transition",
              "focus:border-cyan-400 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-400/30",
              invalid
                ? "border-rose-500/70"
                : ch
                ? "border-slate-600"
                : "border-slate-800",
            ].join(" ")}
          />
          {i === 2 && (
            <span aria-hidden className="px-0.5 text-lg text-slate-700">
              –
            </span>
          )}
        </div>
      ))}
    </div>
  );
}