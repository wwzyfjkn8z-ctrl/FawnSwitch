/** Curate new presets only. Saved providers and preset IDs remain intact. */
export function isFawnPreset(preset: {
  name: string;
  category?: string;
  family?: string;
  requiresOAuth?: boolean;
  providerType?: string;
  isCustomTemplate?: boolean;
}): boolean {
  return preset.category === "official" || ["codex_oauth", "github_copilot"].includes(preset.providerType ?? "") || preset.requiresOAuth === true ||
    preset.isCustomTemplate === true || preset.name === "OpenYuzu" ||
    /^(deepseek|kimi|zhipu|glm|智谱)/i.test(preset.name) ||
    ["kimi", "zhipu"].includes(preset.family ?? "");
}
