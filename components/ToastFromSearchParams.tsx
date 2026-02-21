"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

const DEFAULT_SUCCESS = "Action réalisée avec succès.";

function normalizeMessage(value: string | null) {
  if (!value) return null;
  if (value === "1") return DEFAULT_SUCCESS;
  return value;
}

export function ToastFromSearchParams() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!params) return;
    if (!pathname) return;

    const successRaw = params.get("success");
    const errorRaw = params.get("error");
    const success = normalizeMessage(successRaw);
    const error = normalizeMessage(errorRaw);

    if (!success && !error) return;

    if (success) toast.success(success);
    if (error) toast.error(error);

    const next = new URLSearchParams(params.toString());
    next.delete("success");
    next.delete("error");
    const nextUrl = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    router.replace(nextUrl);
  }, [params, pathname, router]);

  return null;
}
