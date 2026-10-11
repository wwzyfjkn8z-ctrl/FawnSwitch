import { invoke } from "@tauri-apps/api/core";
import { AppPageHeader } from "@/components/shell/AppPageHeader";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { isUpdateAvailable } from "@/lib/version";
import { useInstalledApps } from "@/hooks/useInstalledApps";
import { useToolManagement, toolDisplayName } from "./useToolManagement";
import { ToolUpgradeConfirmDialog } from "@/components/settings/ToolUpgradeConfirmDialog";

export function DshPage() {
  const detected = useInstalledApps();
  const tools = useToolManagement();
  const info = tools.toolVersionByName.get("dsh");
  const installed = detected.installedTools.includes("dsh");
  return (
    <>
      <AppPageHeader
        title="DeepSeek Harness"
        icon={
          <ProviderIcon icon="deepseek" name="DeepSeek Harness" size={22} />
        }
      />
      <div id="main-content" className="p-6 text-body">
        {!installed ? (
          <p className="text-fg-2">
            {detected.isPending
              ? "正在检测…"
              : "未检测到 DeepSeek Harness，请在应用页重新检测。"}
          </p>
        ) : (
          <div className="divide-y divide-border rounded-panel border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="font-medium">
                  当前版本：{info?.version || "检测中 / 版本不可用"}
                </div>
                {info?.latest_version && (
                  <p className="text-caption text-fg-2">
                    最新版本：{info.latest_version}
                  </p>
                )}
              </div>
              {isUpdateAvailable(info?.version, info?.latest_version) && (
                <Button
                  variant="neutral"
                  disabled={tools.busyTools.has("dsh")}
                  onClick={() =>
                    void tools.handleRunToolAction(["dsh"], "update")
                  }
                >
                  升级
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="font-medium">原生配置</div>
                <p className="text-caption text-fg-2">
                  保留 DeepSeek Harness 原有配置格式，在原生配置目录管理。
                </p>
              </div>
              <Button
                variant="neutral"
                onClick={() =>
                  void invoke("fawn_open_dsh_config").catch(() =>
                    toast.error("未找到 DeepSeek Harness 配置目录。"),
                  )
                }
              >
                打开配置目录
              </Button>
            </div>
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
