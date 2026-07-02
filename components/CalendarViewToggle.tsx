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
    <div className="view-toggle inline-flex rounded-full shadow-sm">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2 text-sm font-semibold transition ${
              active ? "view-toggle-btn-active" : "view-toggle-btn"
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
