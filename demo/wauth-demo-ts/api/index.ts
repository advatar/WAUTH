import { normalizeKnownEnvVars, prepareRequestUrl } from "../src/serverless-routing.js";

type RequestHandler = (req: any, res: any) => unknown;

let appPromise: Promise<RequestHandler> | undefined;

async function getApp(): Promise<RequestHandler> {
  if (!appPromise) {
    appPromise = (async () => {
      normalizeKnownEnvVars(process.env);
      const { buildMcpExpressApp } = await import("../src/mcp-server.js");
      return buildMcpExpressApp() as unknown as RequestHandler;
    })();
  }

  return appPromise;
}

export default async function handler(req: any, res: any) {
  const prepared = prepareRequestUrl(req.url);
  if (prepared.wasRewritten) {
    req.url = prepared.requestUrl;
  }

  const app = await getApp();
  return app(req, res);
}
