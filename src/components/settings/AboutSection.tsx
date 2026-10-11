import { SoftwareUpdate } from "./SoftwareUpdate";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import appIcon from "@/assets/icons/fawn-stash.png";

export function AboutSection({ isPortable }: { isPortable: boolean }) {
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion("未知"));
  }, []);
  async function importDelivery(command = "fawn_import") {
    setBusy(true);
    setMessage("");
    try {
      const result = await invoke<{ imported: number; skipped: number }>(
        command,
      );
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      setMessage(
        `已导入 ${result.imported} 个方案，保留 ${result.skipped} 个已有方案。导入不会自动切换模型。`,
      );
    } catch (error) {
      setMessage(typeof error === "string" ? error : "导入失败，未修改已有配置，请检查来源文件与权限。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="divide-y divide-border rounded-panel border border-border bg-surface text-body">
      <div className="flex items-center gap-3 px-4 py-3">
        <img src={appIcon} alt="" className="h-8 w-8" />
        <div>
          <h2 className="text-strong font-semibold">Fawn Switch</h2>
          <p className="text-caption text-fg-2">
            v{version || "…"}
            {isPortable ? " · 便携模式" : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h3 className="font-medium">交付方案</h3>
          <p className="text-caption text-fg-2">
            导入本机交付方案，统一保存在 Fawn Switch 中，已有方案不覆盖。
          </p>
        </div>
        <Button
          variant="neutral"
          size="compact"
          disabled={busy}
          onClick={() => void importDelivery()}
        >
          {busy ? "导入中…" : "导入方案"}
        </Button>
        {message && (
          <p role="status" className="w-full text-caption text-fg-2">
            {message}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div><h3 className="font-medium">从 CC Switch 导入</h3><p className="text-caption text-fg-2">先退出 CC Switch，再导入本机供应商、MCP、提示词和 Skills 仓库。已有项保留，导入项不自动启用；Skills 文件需单独迁移。</p></div>
        <Button variant="neutral" size="compact" disabled={busy} onClick={() => void importDelivery("fawn_import_cc_switch")}>{busy ? "导入中…" : "导入 CC Switch 配置"}</Button>
      </div>
      <SoftwareUpdate />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-caption text-fg-2">
          基于 CC Switch · MIT License · 保留原作者版权声明
        </p>
        <Button
          variant="quiet"
          size="compact"
          onClick={() =>
            settingsApi.openExternal("https://github.com/farion1231/cc-switch")
          }
        >
          上游项目与许可
        </Button>
      </div>
    </div>
  );
}
