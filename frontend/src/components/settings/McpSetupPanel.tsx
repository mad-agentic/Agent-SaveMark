import { useMemo, useState } from "react";
import { Check, Copy, Loader2, PlugZap } from "lucide-react";

type McpTestResult = {
  ok: boolean;
  message: string;
  user_id?: string | null;
  username?: string | null;
  token_name?: string | null;
  role?: string | null;
  all_collections?: boolean | null;
  collection_ids?: string[];
  include_uncollected?: boolean | null;
  allow_deletion?: boolean | null;
  admin_scope?: boolean | null;
  expires_at?: string | null;
  mcp_url?: string | null;
};

type ClientKey = "claude-desktop" | "cursor" | "claude-code" | "raw";

function getMcpUrl(): string {
  if (typeof window === "undefined") return "http://localhost:4040/mcp";
  if (window.location.port === "4041") {
    return `${window.location.protocol}//${window.location.hostname}:4040/mcp`;
  }
  return `${window.location.origin}/mcp`;
}

function mcpConfig(client: ClientKey, token: string | null): string {
  const url = getMcpUrl();
  const tokenValue = token ?? "YOUR_TOKEN_HERE";
  switch (client) {
    case "claude-desktop":
    case "cursor":
      return JSON.stringify(
        {
          mcpServers: {
            "Agent-SaveMark": {
              url,
              headers: { Authorization: `Bearer ${tokenValue}` },
            },
          },
        },
        null,
        2,
      );
    case "claude-code":
      return `claude mcp add --transport http Agent-SaveMark ${url} \\\n  --header "Authorization: Bearer ${tokenValue}"`;
    case "raw":
      return JSON.stringify(
        {
          name: "Agent-SaveMark",
          url,
          headers: { Authorization: `Bearer ${tokenValue}` },
        },
        null,
        2,
      );
  }
}

const CLIENT_LABELS: { key: ClientKey; label: string }[] = [
  { key: "claude-desktop", label: "Claude Desktop" },
  { key: "cursor", label: "Cursor" },
  { key: "claude-code", label: "Claude Code" },
  { key: "raw", label: "Raw JSON" },
];

const PATH_HINTS: Record<ClientKey, string> = {
  "claude-desktop": "Add to ~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%\\Claude\\claude_desktop_config.json (Windows).",
  "cursor": "Add to ~/.cursor/mcp.json or through Cursor → Settings → MCP.",
  "claude-code": "Run this in your terminal. Registers the Agent-SaveMark MCP server for the Claude Code CLI.",
  "raw": "Generic streamable-HTTP MCP server entry. Adapt to any MCP-compatible client.",
};

export function McpSetupPanel({ token }: { token: string | null }) {
  const [active, setActive] = useState<ClientKey>("claude-desktop");
  const [copied, setCopied] = useState(false);
  const [testToken, setTestToken] = useState(token ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<McpTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const config = mcpConfig(active, token);
  const effectiveToken = useMemo(() => testToken.trim(), [testToken]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function testConnection() {
    if (!effectiveToken) {
      setTestError("Paste a plaintext PAT token first.");
      setTestResult(null);
      return;
    }

    setTesting(true);
    setTestError(null);
    try {
      const response = await fetch("/api/v1/auth/tokens/test-mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && typeof payload.detail === "string"
          ? payload.detail
          : `Request failed with ${response.status}`;
        throw new Error(detail);
      }

      setTestResult(payload as McpTestResult);
    } catch (error) {
      setTestResult(null);
      setTestError(error instanceof Error ? error.message : "Unable to test MCP connection.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
        Connect an MCP client
      </div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-2">
        {CLIENT_LABELS.map((c) => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              active === c.key
                ? "border-sky-600 text-sky-600 dark:text-sky-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
        {PATH_HINTS[active]}
      </p>

      <div className="relative">
        <pre className="rounded-lg bg-gray-900 dark:bg-black text-gray-100 text-xs p-3 pr-20 overflow-x-auto font-mono whitespace-pre-wrap break-all">
{config}
        </pre>
        <button
          onClick={copy}
          className={`absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-medium cursor-pointer transition-colors ${
            copied ? "bg-green-600 text-white" : "bg-gray-700 text-gray-100 hover:bg-gray-600"
          }`}
        >
          {copied ? <><Check className="inline h-3 w-3 mr-0.5" /> Copied</> : <><Copy className="inline h-3 w-3 mr-0.5" /> Copy</>}
        </button>
      </div>

      {!token && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
          Replace <code>YOUR_TOKEN_HERE</code> with the token plaintext from the dialog above.
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Test MCP Connection
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Paste a plaintext PAT token and verify that Agent-SaveMark accepts it for MCP access.
        </p>
        <input
          type="password"
          value={testToken}
          onChange={(e) => setTestToken(e.target.value)}
          placeholder="fdp_pat_..."
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
        />
        <button
          type="button"
          onClick={() => void testConnection()}
          disabled={testing || !effectiveToken}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
          {testing ? "Testing..." : "Test MCP Connection"}
        </button>

        {testError && (
          <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {testError}
          </div>
        )}

        {testResult?.ok && (
          <div className="rounded-lg border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-xs text-green-800 dark:text-green-300 space-y-1.5">
            <div className="font-medium">{testResult.message}</div>
            <div>User: {testResult.username || "unknown"}</div>
            <div>Token: {testResult.token_name || "unknown"}</div>
            <div>Role: {testResult.role || "unknown"}</div>
            <div>MCP URL: {testResult.mcp_url || getMcpUrl()}</div>
            <div>Collections: {testResult.all_collections ? "All collections" : `${testResult.collection_ids?.length ?? 0} scoped collections`}</div>
            <div>Include uncollected: {testResult.include_uncollected ? "Yes" : "No"}</div>
            <div>Delete allowed: {testResult.allow_deletion ? "Yes" : "No"}</div>
            <div>Admin scope: {testResult.admin_scope ? "Yes" : "No"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
