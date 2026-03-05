import { buildMcpExpressApp } from "../src/mcp-server.js";

const app = buildMcpExpressApp();

export default function handler(req: any, res: any) {
  const parsed = new URL(req.url ?? "/", "http://localhost");
  const rewrittenPath = parsed.searchParams.get("__path");

  if (rewrittenPath) {
    parsed.searchParams.delete("__path");
    const queryString = parsed.searchParams.toString();
    req.url = queryString.length > 0
      ? `${rewrittenPath}?${queryString}`
      : rewrittenPath;
  }

  return app(req, res);
}
