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
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: "#0F0F0F",
          color: "#fff",
          border: "2px solid #C8A060",
          borderRadius: "8px",
          padding: "16px",
          fontSize: "14px"
        },
        success: {
          iconTheme: {
            primary: "#C8A060",
            secondary: "#000"
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
