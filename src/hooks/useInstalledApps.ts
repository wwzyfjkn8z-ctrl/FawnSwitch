import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import type { VisibleApps } from "@/types";
import { TOOL_NAMES, TOOL_APP_IDS } from "@/components/apps/useToolManagement";
import { APP_IDS } from "@/config/appConfig";

export const INSTALLED_APPS_QUERY_KEY = ["fawn-installed-agents"];
export function useInstalledApps() {
  const query = useQuery({
    queryKey: INSTALLED_APPS_QUERY_KEY,
    queryFn: () => settingsApi.listToolInstallations([...TOOL_NAMES]),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const detected = useMemo(() => {
    const visibleApps = Object.fromEntries(
      APP_IDS.map((app) => [app, false]),
    ) as unknown as VisibleApps;
    const installedTools: string[] = [];
    for (const report of query.data ?? []) {
      if (report.installs.length === 0) continue;
      installedTools.push(report.tool);
      const app = TOOL_APP_IDS[report.tool as keyof typeof TOOL_APP_IDS];
      if (app) visibleApps[app] = true;
    }
    return { visibleApps, installedTools };
  }, [query.data]);
  return { ...query, ...detected };
}
