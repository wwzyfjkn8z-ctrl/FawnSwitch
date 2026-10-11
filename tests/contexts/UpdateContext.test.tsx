import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { UpdateProvider, useUpdate } from "@/contexts/UpdateContext";
const mocks = vi.hoisted(() => ({ check: vi.fn(), getCurrentVersion: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@/lib/updater", () => ({ getCurrentVersion: mocks.getCurrentVersion }));
beforeEach(() => { vi.clearAllMocks(); mocks.getCurrentVersion.mockResolvedValue("0.2.8"); });
afterEach(cleanup);
describe("FawnSwitch signed updates", () => {
  it("checks without installing, installs only on request, and reports progress", async () => {
    const downloadAndInstall = vi.fn(async (progress) => {
      progress({ event: "Started", data: { contentLength: 100 } });
      progress({ event: "Progress", data: { chunkLength: 100 } });
    });
    mocks.check.mockResolvedValue({ version: "0.2.9", body: "release", date: "2026-10-11", close: vi.fn(), downloadAndInstall });
    const { result } = renderHook(useUpdate, { wrapper: UpdateProvider });
    await act(async () => { await result.current.checkUpdate(); });
    expect(result.current.updateInfo?.availableVersion).toBe("0.2.9");
    expect(downloadAndInstall).not.toHaveBeenCalled();
    await act(async () => { await result.current.installUpdate(); });
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(result.current.installed).toBe(true);
    expect(result.current.downloadedBytes).toBe(100);
    expect(result.current.hasUpdate).toBe(false);
  });
  it("reports no update without starting an install", async () => {
    mocks.check.mockResolvedValue(null);
    const { result } = renderHook(useUpdate, { wrapper: UpdateProvider });
    await act(async () => { await result.current.checkUpdate(); await result.current.installUpdate(); });
    expect(result.current.hasUpdate).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.installed).toBe(false);
  });
  it("handles an unpublished release without claiming the app is current", async () => {
    mocks.check.mockRejectedValue(new Error("404"));
    const { result } = renderHook(useUpdate, { wrapper: UpdateProvider });
    await act(async () => { await result.current.checkUpdate(); });
    expect(result.current.error).toContain("尚未发布");
    expect(result.current.isChecking).toBe(false);
  });
  it("prevents concurrent installs and does not mark a rejected signature as installed", async () => {
    let reject!: (reason: Error) => void;
    const downloadAndInstall = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    mocks.check.mockResolvedValue({ version: "0.2.9", close: vi.fn(), downloadAndInstall });
    const { result } = renderHook(useUpdate, { wrapper: UpdateProvider });
    await act(async () => { await result.current.checkUpdate(); });
    let pending!: Promise<void>;
    act(() => { pending = result.current.installUpdate(); });
    await act(async () => { await result.current.installUpdate(); });
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    await act(async () => { reject(new Error("invalid signature")); await pending; });
    await waitFor(() => expect(result.current.isInstalling).toBe(false));
    expect(result.current.installed).toBe(false);
    expect(result.current.error).toContain("更新未完成");
  });
});
