import { useMemo } from "react";
import type { AppId } from "@/lib/api/types";
import { useInstalledApps } from "@/hooks/useInstalledApps";
/** Only installed agents participate in the customer interface. */
export function useVisibleAppIds<T extends AppId>(appIds: readonly T[]): T[] {
  const { visibleApps } = useInstalledApps();
  return useMemo(
    () => appIds.filter((app) => visibleApps[app]),
    [appIds, visibleApps],
  );
}
