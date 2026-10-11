import { useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { useUpdate } from "@/contexts/UpdateContext";
import { settingsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
export const FAWN_RELEASES_URL = "https://github.com/wwzyfjkn8z-ctrl/FawnSwitch/releases";
export function SoftwareUpdate() {
  const update = useUpdate();
  const [checked, setChecked] = useState(false);
  const [restartError, setRestartError] = useState(false);
  const progress = update.totalBytes ? `${Math.min(100, Math.round(update.downloadedBytes / update.totalBytes * 100))}%` : `${(update.downloadedBytes / 1024 / 1024).toFixed(1)} MB`;
  return <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <div><h3 className="font-medium">软件更新</h3><p className="text-caption text-fg-2">通过 FawnSwitch 的 GitHub Releases 获取更新，安装前验证签名。</p></div>
    <div className="flex flex-wrap gap-2">
      <Button variant="quiet" size="compact" onClick={() => void settingsApi.openExternal(FAWN_RELEASES_URL)}>GitHub 发布页</Button>
      {!update.installed && <Button variant="neutral" size="compact" disabled={update.isChecking || update.isInstalling} onClick={() => { setChecked(true); void update.checkUpdate(); }}>{update.isChecking ? "检查中…" : "检查更新"}</Button>}
      {update.hasUpdate && <Button variant="solid" size="compact" disabled={update.isInstalling || update.isChecking} onClick={() => void update.installUpdate()}>{update.isInstalling ? `正在更新 ${progress}` : `下载并安装 v${update.updateInfo?.availableVersion}`}</Button>}
      {update.installed && <Button variant="neutral" size="compact" onClick={() => void relaunch().catch(() => setRestartError(true))}>重启 Fawn Switch</Button>}
    </div>
    {update.error && <p role="alert" className="w-full text-caption text-fg-2">{update.error}</p>}
    {restartError && <p role="alert" className="w-full text-caption text-fg-2">请手动退出并重新打开 Fawn Switch。</p>}
    {update.installed && <p role="status" className="w-full text-caption text-fg-2">更新已安装，重启后生效。重启前请保存正在编辑的配置。</p>}
    {checked && !update.isChecking && !update.error && !update.hasUpdate && !update.installed && <p role="status" className="w-full text-caption text-fg-2">当前已是最新版本。</p>}
  </div>;
}
