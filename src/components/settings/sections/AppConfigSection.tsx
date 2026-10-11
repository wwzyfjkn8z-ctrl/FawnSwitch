import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/lib/toast";
import { useInstalledApps } from "@/hooks/useInstalledApps";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type {
  ResolvedDirectories,
  SettingsFormState,
} from "@/hooks/useSettings";
import type { Settings } from "@/types";
import { Button } from "@/components/ui/button";
import {
  DirectoryInput,
  type DirectoryAppId,
} from "@/components/settings/DirectorySettings";
import { CodexAuthSettings } from "@/components/settings/CodexAuthSettings";
import { APP_DISPLAY_NAME, AppGlyph } from "@/components/shell/AppGlyph";
import {
  SettingsBlock,
  SettingsCard,
  SettingsRow,
  SettingsSwitchRow,
} from "@/components/settings/SettingsLayout";

const DIRECTORY_FIELD: Record<DirectoryAppId, keyof Settings> = {
  claude: "claudeConfigDir",
  codex: "codexConfigDir",
  gemini: "geminiConfigDir",
  grokbuild: "grokConfigDir",
  opencode: "opencodeConfigDir",
  openclaw: "openclawConfigDir",
  hermes: "hermesConfigDir",
  pi: "piConfigDir",
};

const DIRECTORY_PLACEHOLDER: Record<DirectoryAppId, string> = {
  claude: "settings.browsePlaceholderClaude",
  codex: "settings.browsePlaceholderCodex",
  gemini: "settings.browsePlaceholderGemini",
  grokbuild: "settings.browsePlaceholderGrok",
  opencode: "settings.browsePlaceholderOpencode",
  openclaw: "settings.browsePlaceholderOpenclaw",
  hermes: "settings.browsePlaceholderHermes",
  pi: "settings.browsePlaceholderPi",
};

const DIRECTORY_APPS: DirectoryAppId[] = [
  "claude",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
  "pi",
];

const normalizeDir = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

interface AppConfigSectionProps {
  settings: SettingsFormState;
  savedSettings?: Settings;
  resolvedDirs: ResolvedDirectories;
  isSaving: boolean;
  onAutoSave: (updates: Partial<SettingsFormState>) => Promise<boolean>;
  onDirectoryChange: (app: DirectoryAppId, value?: string) => void;
  onBrowseDirectory: (app: DirectoryAppId) => Promise<void>;
  onResetDirectory: (app: DirectoryAppId) => Promise<void>;
  onSaveDirectories: () => Promise<void>;
}

/**
 * 设置 → 应用配置：每个应用一节，放只属于它的开关和配置目录。
 * 目录改动要点「保存」才写入（各节自己的保存按钮，保存时一并写入所有改过的目录）。
 */
export function AppConfigSection({
  settings,
  savedSettings,
  resolvedDirs,
  isSaving,
  onAutoSave,
  onDirectoryChange,
  onBrowseDirectory,
  onResetDirectory,
  onSaveDirectories,
}: AppConfigSectionProps) {
  const { t } = useTranslation();
  const { visibleApps, installedTools, isPending, isError } =
    useInstalledApps();

  const isDirty = (app: DirectoryAppId) => {
    const field = DIRECTORY_FIELD[app];
    return (
      normalizeDir(settings[field as keyof SettingsFormState]) !==
      normalizeDir(savedSettings?.[field])
    );
  };

  const directoryRow = (app: DirectoryAppId) => (
    <SettingsRow
      label={t("settings.appConfig.configDir")}
      help={{
        title: t("settings.appConfig.configDir"),
        body: t("settings.configDirectoryDescription"),
      }}
    >
      <DirectoryInput
        label=""
        value={
          settings[DIRECTORY_FIELD[app] as keyof SettingsFormState] as
            | string
            | undefined
        }
        resolvedValue={resolvedDirs[app]}
        placeholder={t(DIRECTORY_PLACEHOLDER[app])}
        onChange={(value) => onDirectoryChange(app, value)}
        onBrowse={() => onBrowseDirectory(app)}
        onReset={() => onResetDirectory(app)}
      />
    </SettingsRow>
  );

  const saveButton = (app: DirectoryAppId) =>
    isDirty(app) ? (
      <Button
        variant="solid"
        size="compact"
        disabled={isSaving}
        onClick={() => void onSaveDirectories()}
      >
        {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {t("common.save")}
      </Button>
    ) : null;

  const blockTitle = (app: DirectoryAppId) => (
    <span className="flex items-center gap-2">
      <AppGlyph app={app} size={16} badgeClassName="bg-app" />
      {APP_DISPLAY_NAME[app]}
    </span>
  );

  return (
    <>
      {installedTools.includes("dsh") && (
        <SettingsBlock title="DeepSeek Harness">
          <SettingsCard>
            <SettingsRow
              label="原生配置目录"
              help={{
                title: "DeepSeek Harness",
                body: "使用 DeepSeek Harness 自己的配置格式，避免写入其他 Agent 的配置。",
              }}
              control={
                <Button
                  variant="neutral"
                  size="compact"
                  onClick={() =>
                    void invoke("fawn_open_dsh_config").catch(() =>
                      toast.error("未找到 DeepSeek Harness 配置目录。"),
                    )
                  }
                >
                  打开配置目录
                </Button>
              }
            />
          </SettingsCard>
        </SettingsBlock>
      )}
      {installedTools.length === 0 && (
        <p className="text-body text-fg-2">
          {isPending
            ? "正在检测已安装的 Agent…"
            : isError
              ? "检测失败，请在应用页重试。"
              : "未检测到已安装的 Agent，安装后会显示相关配置。"}
        </p>
      )}
      {DIRECTORY_APPS.filter((app) => visibleApps[app]).map((app) => (
        <SettingsBlock
          key={app}
          id={`app-config-${app}`}
          className="rounded-panel"
          title={blockTitle(app)}
          actions={saveButton(app)}
        >
          <SettingsCard>
            {app === "claude" && (
              <>
                <SettingsSwitchRow
                  label={t("settings.enableClaudePluginIntegration")}
                  help={{
                    title: t("settings.enableClaudePluginIntegration"),
                    body: t(
                      "settings.enableClaudePluginIntegrationDescription",
                    ),
                  }}
                  checked={!!settings.enableClaudePluginIntegration}
                  onCheckedChange={(value) =>
                    void onAutoSave({ enableClaudePluginIntegration: value })
                  }
                />
                <SettingsSwitchRow
                  label={t("settings.skipClaudeOnboarding")}
                  help={{
                    title: t("settings.skipClaudeOnboarding"),
                    body: t("settings.skipClaudeOnboardingDescription"),
                  }}
                  checked={!!settings.skipClaudeOnboarding}
                  onCheckedChange={(value) =>
                    void onAutoSave({ skipClaudeOnboarding: value })
                  }
                />
              </>
            )}
            {app === "codex" && (
              <CodexAuthSettings
                settings={settings}
                onChange={onAutoSave}
                codexConfigDir={savedSettings?.codexConfigDir}
              />
            )}
            {directoryRow(app)}
          </SettingsCard>
        </SettingsBlock>
      ))}
    </>
  );
}
