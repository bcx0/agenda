"use client";

import { useFormStatus } from "react-dom";

type Props = {
  label: string;
  loadingLabel?: string;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

export default function LoadingButton({
  label,
  loadingLabel = "Chargement...",
  className = "",
  type = "submit",
  disabled = false
}: Props) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {loadingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}
