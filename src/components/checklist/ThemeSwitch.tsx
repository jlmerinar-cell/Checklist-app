import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { changeTheme, setDailyEnabled } from "@/lib/checklist/actions";
import { useChecklist } from "@/lib/checklist/useChecklist";
import type { Theme } from "@/lib/checklist/types";

const OPTIONS: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "contrast", label: "Contrast" },
  { id: "pink", label: "Pink" },
  { id: "rugged", label: "Rugged" },
];

export function ThemePicker() {
  const { theme, dailyEnabled } = useChecklist();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open ? (
        <button type="button" className="theme-scrim" aria-label="Close themes" onClick={() => setOpen(false)} />
      ) : null}
      {open ? (
        <div className="theme-pop" role="dialog" aria-label="Themes and settings">
          <div role="radiogroup" aria-label="Theme" className="flex flex-col gap-2">
            {OPTIONS.map((option) => {
              const selected = theme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={
                    "flex min-h-12 items-center gap-3 rounded-card border px-3 " +
                    (selected ? "border-accent bg-surface" : "border-line bg-canvas")
                  }
                  onClick={() => {
                    changeTheme(option.id);
                    setOpen(false);
                  }}
                >
                  <span className={`swatch swatch-${option.id}`} aria-hidden />
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={dailyEnabled}
            className="mt-3 flex min-h-12 w-full items-center justify-between rounded-card border border-line bg-canvas px-3"
            onClick={() => setDailyEnabled(!dailyEnabled)}
          >
            <span>Morning daily</span>
            <span className={dailyEnabled ? "text-accent" : "text-muted"}>{dailyEnabled ? "On" : "Off"}</span>
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="theme-launcher"
        aria-label="Themes"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Palette aria-hidden className="size-6" strokeWidth={2.5} />
      </button>
    </>
  );
}
