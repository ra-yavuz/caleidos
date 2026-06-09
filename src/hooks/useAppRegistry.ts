"use client";

import useSWR from "swr";
import type { AppMeta } from "@/types/app-registry";

const fetcher = (url: string): Promise<AppMeta[]> =>
  fetch(url).then((r) => r.json());

// Polls the on-disk app registry. Poll fast while a build is active so new
// windows appear within ~1.5s of the agent writing the file; idle slowly
// otherwise so manual edits still surface.
export function useAppRegistry(buildActive: boolean) {
  const { data, error, isLoading } = useSWR<AppMeta[]>(
    "/api/apps/registry",
    fetcher,
    {
      refreshInterval: buildActive ? 1500 : 10000,
      revalidateOnFocus: true,
      dedupingInterval: 500,
    },
  );

  return { apps: data ?? [], error, isLoading };
}
