"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/book");
    router.prefetch("/admin");
    router.prefetch("/admin/availability");
  }, [router]);

  return null;
}

