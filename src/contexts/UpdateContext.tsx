import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { getCurrentVersion, type UpdateInfo } from "../lib/updater";
interface UpdateContextValue {
  hasUpdate: boolean;
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  error: string | null;
  isDismissed: boolean;
  dismissUpdate: () => void;
  checkUpdate: () => Promise<boolean>;
  resetDismiss: () => void;
  installUpdate: () => Promise<void>;
  isInstalling: boolean;
  downloadedBytes: number;
  totalBytes: number | null;
  installed: boolean;
}
const UpdateContext = createContext<UpdateContextValue | null>(null);
export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const updateRef = useRef<Update | null>(null);
  const checking = useRef(false);
  const installing = useRef(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [installed, setInstalled] = useState(false);
  const checkUpdate = useCallback(async () => {
    if (checking.current || installing.current) return false;
    checking.current = true;
    setIsChecking(true);
    setError(null);
    try {
      const next = await check({ timeout: 30_000 });
      const currentVersion = await getCurrentVersion();
      await updateRef.current?.close();
      updateRef.current = next;
      setUpdateInfo(next ? { currentVersion, availableVersion: next.version, notes: next.body, pubDate: next.date } : null);
      setIsDismissed(false);
      return next !== null;
    } catch (reason) {
      const detail = String(reason);
      setError(detail.includes("404")
        ? "尚未发布可用的更新包，请稍后再检查。"
        : "无法连接 GitHub 更新源，请稍后重试，或前往发布页下载安装包。");
      return false;
    } finally {
      checking.current = false;
      setIsChecking(false);
    }
  }, []);
  const installUpdate = useCallback(async () => {
    if (!updateRef.current || installing.current || checking.current) return;
    installing.current = true;
    setIsInstalling(true);
    setError(null);
    setDownloadedBytes(0);
    setTotalBytes(null);
    try {
      await updateRef.current.downloadAndInstall((event) => {
        if (event.event === "Started") setTotalBytes(event.data.contentLength ?? null);
        if (event.event === "Progress") setDownloadedBytes((bytes) => bytes + event.data.chunkLength);
      });
      setInstalled(true);
    } catch {
      setError("更新未完成，请重试或前往 GitHub 发布页手动下载安装包。");
    } finally {
      installing.current = false;
      setIsInstalling(false);
    }
  }, []);
  useEffect(() => {
    // Check only. Download/install always requires an explicit user click.
    const timer = window.setTimeout(() => void checkUpdate(), 15_000);
    return () => window.clearTimeout(timer);
  }, [checkUpdate]);
  return (
    <UpdateContext.Provider value={{ hasUpdate: updateInfo !== null && !installed, updateInfo, isChecking, error, isDismissed,
      dismissUpdate: () => setIsDismissed(true), resetDismiss: () => setIsDismissed(false), checkUpdate,
      installUpdate, isInstalling, downloadedBytes, totalBytes, installed }}>
      {children}
    </UpdateContext.Provider>
  );
}
export function useUpdate() {
  const context = useContext(UpdateContext);
  if (!context) throw new Error("useUpdate requires UpdateProvider");
  return context;
}
