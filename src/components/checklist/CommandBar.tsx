import { useState } from "react";
import { exec } from "@/lib/checklist/commands";
import { useChecklist } from "@/lib/checklist/useChecklist";

export function CommandBar() {
  const { message } = useChecklist();
  const [value, setValue] = useState("");

  return (
    <form
      className="flex flex-col gap-2 border-t border-line pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        const text = value.trim();
        if (!text) return;
        void Promise.resolve(exec(text));
        setValue("");
      }}
    >
      <label className="flex flex-col gap-2" htmlFor="checklist-command">
        Command
        <input
          id="checklist-command"
          className="field"
          value={value}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="checklist add fire-dept check hydrant map"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="submit" className="min-h-14 rounded-card border border-line bg-surface">
        Run
      </button>
      <p className="min-h-8 text-muted" role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
