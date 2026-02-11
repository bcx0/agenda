"use client";

import { Toaster } from "react-hot-toast";

export function ToastProvider() {
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
          padding: "16px"
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
