"use client";

type ViewMode = "month" | "week" | "list";

type Props = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
};

const options: { label: string; value: ViewMode }[] = [
  { label: "Mois", value: "month" },
  { label: "Semaine", value: "week" },
  { label: "Liste", value: "list" }
];

export function CalendarViewToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-full border border-border bg-background-elevated shadow-sm">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2 text-sm font-semibold transition ${
              active
                ? "bg-black text-white"
                : "text-white hover:bg-background-elevated/5"
            } first:rounded-l-full last:rounded-r-full`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export type { ViewMode };

