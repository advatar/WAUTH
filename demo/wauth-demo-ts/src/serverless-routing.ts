const MCP_PATH_ALIASES: Record<string, string> = {
  "/api/mcp-open": "/api/mcp",
  "/api/mcp-noauth": "/api/mcp",
  "/mcp-open": "/mcp",
  "/mcp-noauth": "/mcp"
};

const NORMALIZED_ENV_KEYS = [
  "WAUTH_DEMO_ISSUER",
  "WAUTH_DEMO_HAPP_BASE_URL"
] as const;

export interface PreparedRequestUrl {
  requestPath: string;
  requestUrl: string;
  wasRewritten: boolean;
}

function withFallbackBase(rawUrl: string | undefined): URL {
  return new URL(rawUrl ?? "/", "http://localhost");
}

export function resolveMcpPathAlias(pathname: string): string {
  return MCP_PATH_ALIASES[pathname] ?? pathname;
}

export function prepareRequestUrl(rawUrl: string | undefined): PreparedRequestUrl {
  const parsed = withFallbackBase(rawUrl);
  const rewrittenPath = parsed.searchParams.get("__path");
  const sourcePath = rewrittenPath ?? parsed.pathname;
  const requestPath = resolveMcpPathAlias(sourcePath);

  if (rewrittenPath) {
    parsed.searchParams.delete("__path");
  }

  const query = parsed.searchParams.toString();
  const requestUrl = query.length > 0
    ? `${requestPath}?${query}`
    : requestPath;

  return {
    requestPath,
    requestUrl,
    wasRewritten: requestUrl !== (rawUrl ?? "/")
  };
}

export function normalizeKnownEnvVars(env: NodeJS.ProcessEnv): void {
  for (const key of NORMALIZED_ENV_KEYS) {
    const value = env[key];
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      env[key] = trimmed;
    }
  }
}
