import { describe, it, expect } from "vitest";
import { isFawnPreset } from "@/config/fawnProviderCatalog";
import { providerPresets } from "@/config/claudeProviderPresets";
import { DEFAULT_VISIBLE_APPS } from "@/config/appConfig";
describe("Fawn defaults", () => {
  it("shows only Claude Code by default", () => {
    expect(Object.entries(DEFAULT_VISIBLE_APPS).filter(([, shown]) => shown).map(([id]) => id)).toEqual(["claude"]);
  });
  it("curates vendors and cloud without modifying the full catalog", () => {
    const visible = providerPresets.filter(isFawnPreset);
    expect(visible.filter(p => p.category === "cloud_provider").map(p => p.name)).toEqual(["OpenYuzu"]);
    expect(visible.some(p => p.name === "DeepSeek")).toBe(true);
    expect(visible.some(p => p.family === "kimi")).toBe(true);
    expect(visible.some(p => p.family === "zhipu")).toBe(true);
    expect(isFawnPreset({ name: "MiniMax", category: "cn_official" })).toBe(false);
    expect(isFawnPreset({ name: "Custom", isCustomTemplate: true })).toBe(true);
    expect(visible.filter(p => p.category === "cn_official").every(p => p.name === "DeepSeek" || ["kimi", "zhipu"].includes(p.family ?? ""))).toBe(true);
  });
  it("provides OpenYuzu branding and a direct API key console link", () => {
    expect(providerPresets.find(p => p.name === "OpenYuzu")).toMatchObject({
      icon: "openyuzu",
      apiKeyUrl: "https://openyuzu.xiaonaofu.com.cn/en/dashboard/api-keys",
    });
  });
  it("ships OpenYuzu without customer credentials", () => {
    expect(providerPresets.find(p => p.name === "OpenYuzu")?.settingsConfig).toMatchObject({ env: {
      ANTHROPIC_AUTH_TOKEN: "",
      ANTHROPIC_BASE_URL: "https://openyuzuapi.xiaonaofu.com.cn",
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-6",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
    } });
  });
});
