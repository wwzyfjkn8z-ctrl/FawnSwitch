import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AgentScanStatus({ pending, failed, onRetry }: {
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  if (!pending && !failed) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-app p-8">
      <div className="max-w-sm text-center" role={failed ? "alert" : "status"} aria-live="polite" aria-busy={pending}>
        {pending && <Loader2 aria-hidden="true" className="mx-auto mb-4 h-8 w-8 animate-spin text-action motion-reduce:animate-none" />}
        <h2 className="text-lg font-medium">{pending ? "正在检测已安装的 Agent…" : "Agent 检测未完成"}</h2>
        <p className="mt-2 text-body text-fg-2">{pending ? "首次检测可能需要一点时间，请稍候。检测完成后会显示可用应用。" : "暂时无法读取本机的 Agent 信息，请重新检测。"}</p>
        {failed && !pending && <Button className="mt-4" variant="neutral" onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />重新检测</Button>}
      </div>
    </div>
  );
}
