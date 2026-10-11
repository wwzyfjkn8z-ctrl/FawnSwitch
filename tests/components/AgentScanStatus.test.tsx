import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AgentScanStatus } from "@/components/apps/AgentScanStatus";

describe("global Agent scan status", () => {
  it("announces initial detection and disappears when completed", () => {
    const { rerender } = render(<AgentScanStatus pending failed={false} onRetry={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在检测已安装的 Agent");
    rerender(<AgentScanStatus pending={false} failed={false} onRetry={vi.fn()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("offers a retry on failure and shows progress while retrying", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<AgentScanStatus pending={false} failed onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "重新检测" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<AgentScanStatus pending failed onRetry={onRetry} />);
    expect(screen.getByText("正在检测已安装的 Agent…")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
