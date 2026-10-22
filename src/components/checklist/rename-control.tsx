import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";

/** Tap the name, type, then Enter or tap away to save. Escape or Cancel puts the old name back. */
export function RenameControl({
  value,
  disabled = false,
  onCommit,
  className = "",
}: {
  value: string;
  disabled?: boolean;
  onCommit: (next: string) => string | null | void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const closing = useRef<"commit" | "cancel" | null>(null);
  const editing = draft !== null;

  useEffect(() => {
    setDraft(null);
    setError("");
  }, [value]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function commit() {
    if (closing.current === "cancel" || draft === null) return;
    const next = draft.trim();
    if (!next || next === value) {
      closing.current = "commit";
      setDraft(null);
      setError("");
      return;
    }
    const result = onCommit(next);
    if (typeof result === "string" && result) {
      setError(result);
      closing.current = null;
      return;
    }
    closing.current = "commit";
    setDraft(null);
    setError("");
  }

  function cancel() {
    closing.current = "cancel";
    setDraft(null);
    setError("");
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (closing.current) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    commit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  }

  function keepFocus(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  if (disabled) {
    return <p className={className}>{value}</p>;
  }

  if (!editing) {
    return (
      <button type="button" className={className} aria-label={`Rename ${value}`} onClick={() => {
        closing.current = null;
        setError("");
        setDraft(value);
      }}>
        {value}
      </button>
    );
  }

  return (
    <div className="flex min-w-0 basis-full flex-col gap-2" onBlur={onBlur} onKeyDown={onKeyDown}>
      <div className="flex min-w-0 items-center gap-2">
        <input
          ref={inputRef}
          className="field min-h-14 flex-1 text-lg"
          aria-label={`Rename ${value}`}
          value={draft ?? ""}
          maxLength={200}
          enterKeyHint="done"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" className="tap shrink-0 rounded-card border border-line px-3" onPointerDown={keepFocus} onClick={cancel}>
          Cancel
        </button>
      </div>
      {error ? (
        <p className="text-muted" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
