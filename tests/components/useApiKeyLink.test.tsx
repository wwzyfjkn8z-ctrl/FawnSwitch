import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useApiKeyLink } from "@/components/providers/forms/hooks/useApiKeyLink";
import { providerPresets } from "@/config/claudeProviderPresets";

describe("cloud provider API key links", () => {
  it("opens the OpenYuzu console rather than its API gateway", () => {
    const preset = providerPresets.find(p => p.name === "OpenYuzu")!;
    const { result } = renderHook(() => useApiKeyLink({
      appId: "claude", category: "cloud_provider", selectedPresetId: "openyuzu",
      presetEntries: [{ id: "openyuzu", preset }], formWebsiteUrl: "",
    }));
    expect(result.current.shouldShowApiKeyLink).toBe(true);
    expect(result.current.websiteUrl).toBe("https://openyuzu.xiaonaofu.com.cn/en/dashboard/api-keys");
  });
});
