import { ProviderIcon } from "@/components/ProviderIcon";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowUpCircle,
  ChevronDown,
  Download,
  LayoutGrid,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { AppId } from "@/lib/api";
import type { ToolInstallationReport } from "@/lib/api/settings";
import { useInstalledApps } from "@/hooks/useInstalledApps";
import { isUpdateAvailable } from "@/lib/version";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppPageHeader } from "@/components/shell/AppPageHeader";
import { AppGlyph } from "@/components/shell/AppGlyph";
import { ToolUpgradeConfirmDialog } from "@/components/settings/ToolUpgradeConfirmDialog";
import { ToolInstallRow } from "@/components/settings/ToolInstallRow";
import { ToolErrorMessage } from "@/components/settings/ToolErrorMessage";
import {
  ENV_BADGE_CONFIG,
  TOOL_APP_IDS,
  TOOL_NAMES,
  toolDisplayName,
  useToolManagement,
  WSL_SHELL_FLAG_OPTIONS,
  WSL_SHELL_OPTIONS,
  type ToolLifecycleAction,
  type ToolName,
} from "./useToolManagement";

/** 安装来源的显示名：只标认得出的，认不出（system）就不标，免得标错。 */
const SOURCE_LABEL: Record<string, string> = {
  homebrew: "Homebrew",
  nvm: "npm",
  volta: "npm",
  fnm: "npm",
  mise: "npm",
  bun: "bun",
  pnpm: "pnpm",
  scoop: "Scoop",
  pip: "pip",
};

export function AppsPage() {
  const { t } = useTranslation();
  const tools = useToolManagement();
  const detected = useInstalledApps();
  const [expanded, setExpanded] = useState<Partial<Record<ToolName, boolean>>>(
    {},
  );
  const installed = TOOL_NAMES.filter((tool) =>
    detected.installedTools.includes(tool),
  );
  const upgrades = tools.updatableToolNames.filter((tool) =>
    installed.includes(tool),
  );
  return (
    <>
      <AppPageHeader
        icon={<LayoutGrid className="h-5 w-5" />}
        title={t("nav.apps")}
        actions={
          <>
            {(upgrades.length > 0 || tools.batchAction) && (
              <Button
                variant="neutral"
                disabled={Boolean(tools.batchAction)}
                aria-busy={Boolean(tools.batchAction)}
                onClick={() =>
                  void tools.handleRunToolAction(upgrades, "update", {
                    fromBatchEntry: true,
                  })
                }
              >
                {t("settings.updateAllTools", { count: upgrades.length })}
              </Button>
            )}
            <Button
              variant="neutral"
              disabled={
                tools.isLoadingTools || detected.isFetching || tools.isAnyBusy
              }
              onClick={() => {
                void detected.refetch();
                void tools.checkForUpdates();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("appsPage.checkUpdates")}
            </Button>
          </>
        }
      />
      <div
        id="main-content"
        className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
      >
        <p className="mb-4 text-caption text-fg-2">
          仅显示本机已安装的
          Agent。安装由交付人员完成，你可以在这里查看版本和升级。
        </p>
        {detected.isPending ? (
          <p role="status">正在检测已安装的 Agent…</p>
        ) : detected.isError ? (
          <p role="alert">检测失败，请重新检测。</p>
        ) : installed.length === 0 ? (
          <p>未检测到已安装的 Agent，请联系交付人员。</p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
            {installed.map((tool) => (
              <ToolRow
                key={tool}
                tool={tool}
                tools={tools}
                expanded={expanded[tool] ?? false}
                onToggleExpanded={() =>
                  setExpanded((prev) => ({ ...prev, [tool]: !prev[tool] }))
                }
                visibility={null}
              />
            ))}
          </div>
        )}
      </div>
      <ToolUpgradeConfirmDialog
        isOpen={tools.pendingUpgrade !== null}
        plans={tools.pendingUpgrade?.plans ?? []}
        displayName={toolDisplayName}
        onConfirm={tools.handleConfirmUpgrade}
        onCancel={tools.handleCancelUpgrade}
      />
    </>
  );
}

function AppRow({
  app,
  name,
  meta,
  version,
  action,
  visibility,
  footer,
}: {
  app?: AppId;
  name: React.ReactNode;
  meta?: React.ReactNode;
  version?: React.ReactNode;
  action?: React.ReactNode;
  visibility: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div data-tool-row className="px-4 py-3">
      <div className="flex items-center gap-4">
        {app ? (
          <AppGlyph app={app} size={20} badgeClassName="bg-surface" />
        ) : (
          <ProviderIcon icon="deepseek" name="DeepSeek Harness" size={20} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-strong text-fg-1">
            {name}
          </div>
          {meta && (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-caption text-fg-2">
              {meta}
            </div>
          )}
        </div>
        <div className="w-[168px] shrink-0 text-end">{version}</div>
        <div className="flex w-[104px] shrink-0 justify-end">{action}</div>
        {visibility && (
          <div className="flex w-[56px] shrink-0 justify-end">{visibility}</div>
        )}
      </div>
      {footer && <div className="ms-9 mt-2">{footer}</div>}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[18px] shrink-0 items-center rounded-full border border-border-strong px-1.5 text-badge text-fg-2">
      {children}
    </span>
  );
}

function ToolRow({
  tool,
  tools,
  expanded,
  onToggleExpanded,
  visibility,
}: {
  tool: ToolName;
  tools: ReturnType<typeof useToolManagement>;
  expanded: boolean;
  onToggleExpanded: () => void;
  visibility: React.ReactNode;
}) {
  const { t } = useTranslation();
  const info = tools.toolVersionByName.get(tool);
  const report: ToolInstallationReport | undefined =
    tools.installReports?.[tool];
  const defaultInstall =
    report?.installs.find((install) => install.is_path_default) ??
    report?.installs[0];
  const otherInstalls = (report?.installs.length ?? 0) - 1;
  // 「诊断安装冲突」的结果优先（升级后会重新诊断），否则用打开页面时探测到的安装分布
  const installs = tools.toolDiagnostics[tool] ?? report?.installs;

  const isVersionLoading =
    Boolean(tools.loadingTools[tool]) ||
    (tools.isLoadingTools && !tools.toolVersionByName.has(tool));
  const isOutdated = isUpdateAvailable(info?.version, info?.latest_version);
  const broken = Boolean(info?.installed_but_broken);
  const isBusy = tools.busyTools.has(tool);
  const action: ToolLifecycleAction | null =
    tools.busyTools.get(tool) ??
    (isVersionLoading || broken
      ? null
      : !info?.version
        ? null
        : isOutdated
          ? "update"
          : null);
  const sourceLabel = defaultInstall
    ? SOURCE_LABEL[defaultInstall.source]
    : undefined;
  const envBadge =
    info?.env_type === "wsl" && ENV_BADGE_CONFIG.wsl
      ? `${t(ENV_BADGE_CONFIG.wsl.labelKey)}${info.wsl_distro ? ` · ${info.wsl_distro}` : ""}`
      : null;

  const version = isVersionLoading ? (
    <span
      role="status"
      aria-label={t("common.loading")}
      className="inline-flex justify-end"
    >
      <Loader2 className="h-4 w-4 animate-spin text-fg-3" />
    </span>
  ) : info?.version ? (
    <div>
      <div className="font-mono text-body font-medium tabular-nums text-fg-1">
        {info.version}
      </div>
      {isOutdated && info.latest_version && (
        <div className="text-caption text-fg-2">
          {t("appsPage.newVersion", { version: info.latest_version })}
        </div>
      )}
    </div>
  ) : broken ? (
    <span className="inline-flex items-center gap-1 text-caption font-medium text-warning-text">
      <AlertTriangle className="h-3.5 w-3.5" />
      {t("appsPage.notRunnable")}
    </span>
  ) : (
    <span className="text-caption text-fg-2">{t("common.notInstalled")}</span>
  );

  const actionButton = action ? (
    <Button
      variant="neutral"
      size="compact"
      onClick={() => void tools.handleRunToolAction([tool], action)}
      disabled={isVersionLoading || isBusy}
      aria-busy={isBusy}
    >
      {isBusy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : action === "install" ? (
        <Download className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpCircle className="h-3.5 w-3.5" />
      )}
      {action === "install"
        ? t("settings.toolInstall")
        : t("settings.toolUpdate")}
    </Button>
  ) : null;

  const meta = defaultInstall ? (
    <>
      <span className="min-w-0 truncate font-mono" title={defaultInstall.path}>
        {defaultInstall.path}
      </span>
      {otherInstalls > 0 && (
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="inline-flex shrink-0 items-center gap-0.5 font-medium text-warning-text hover:underline"
        >
          {t("appsPage.otherInstalls", { count: otherInstalls })}
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
      )}
    </>
  ) : null;

  const wslControls =
    info?.env_type === "wsl" ? (
      <div className="flex items-center gap-2 text-caption text-fg-2">
        <span>Shell</span>
        <Select
          value={tools.wslShellByTool[tool]?.wslShell || "auto"}
          onValueChange={(value) =>
            void tools.handleToolShellChange(tool, value)
          }
          disabled={isVersionLoading || isBusy}
        >
          <SelectTrigger className="h-7 w-[82px] text-caption">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("common.auto")}</SelectItem>
            {WSL_SHELL_OPTIONS.map((shell) => (
              <SelectItem key={shell} value={shell}>
                {shell}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>{t("appsPage.wslFlag")}</span>
        <Select
          value={tools.wslShellByTool[tool]?.wslShellFlag || "auto"}
          onValueChange={(value) =>
            void tools.handleToolShellFlagChange(tool, value)
          }
          disabled={isVersionLoading || isBusy}
        >
          <SelectTrigger className="h-7 w-[82px] text-caption">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("common.auto")}</SelectItem>
            {WSL_SHELL_FLAG_OPTIONS.map((flag) => (
              <SelectItem key={flag} value={flag}>
                {flag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  const errorLine =
    !isVersionLoading && !info?.version && info?.error ? (
      <ToolErrorMessage message={info.error} />
    ) : null;

  const conflictList =
    expanded && installs && installs.length > 1 ? (
      <div className="space-y-1.5 rounded-control bg-warning-soft p-2.5">
        <div className="text-caption font-medium text-warning-text">
          {t("appsPage.installsFound", { count: installs.length })}
        </div>
        <ul className="space-y-1">
          {installs.map((install) => (
            <li key={install.path}>
              <ToolInstallRow inst={install} />
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const footer =
    wslControls || errorLine || conflictList ? (
      <div className="space-y-2">
        {errorLine}
        {wslControls}
        {conflictList}
      </div>
    ) : undefined;

  return (
    <AppRow
      app={tool === "dsh" ? undefined : TOOL_APP_IDS[tool]}
      name={
        <>
          <span className="truncate">{toolDisplayName(tool)}</span>
          {sourceLabel && <Pill>{sourceLabel}</Pill>}
          {envBadge && <Pill>{envBadge}</Pill>}
        </>
      }
      meta={meta}
      version={version}
      action={actionButton}
      visibility={visibility}
      footer={footer}
    />
  );
}
