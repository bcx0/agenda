"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/login");
    router.prefetch("/book");
    router.prefetch("/manage");
    router.prefetch("/admin");
    router.prefetch("/admin/availability");
  }, [router]);

  return null;
}

