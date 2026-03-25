"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";

function resolveSuccessMessage(successParam: string | null) {
  if (!successParam) return null;
  if (successParam === "1") return "Action effectuée avec succès.";
  if (successParam === "cancelled") return "Rendez-vous annulé.";
  if (successParam === "rescheduled") return "Rendez-vous modifié.";
  return decodeURIComponent(successParam);
}

export function ToastProvider() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!searchParams) return;
    if (!pathname) return;

    const error = searchParams.get("error");
    const success = searchParams.get("success");
    if (!error && !success) return;

    const key = `${pathname}?${searchParams.toString()}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    if (error) {
      toast.error(decodeURIComponent(error));
      return;
    }

    const successMessage = resolveSuccessMessage(success);
    if (successMessage) {
      toast.success(successMessage);
    }
  }, [pathname, searchParams]);

  return (
    <Toaster
      position="top-left"
      toastOptions={{
        duration: 3000,
        style: {
          background: "#f5f7fa",
          color: "#1a1a2e",
          border: "2px solid #1d4567",
          borderRadius: "8px",
          padding: "16px",
          fontSize: "14px"
        },
        success: {
          iconTheme: {
            primary: "#27ae60",
            secondary: "#fff"
          }
        },
        error: {
          iconTheme: {
            primary: "#EF4444",
            secondary: "#fff"
          }
        }
      }}
    />
  );
}
