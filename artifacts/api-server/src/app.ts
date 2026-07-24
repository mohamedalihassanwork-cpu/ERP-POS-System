import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Behind the Replit reverse proxy — trust it so req.ip reflects the real client.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.use("/api", router);

// 404 for unmatched API routes.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "المسار غير موجود" });
});

// ─── Desktop mode: serve built Vite SPA statically ────────────────────────
//
// When SERVE_STATIC=true (set by Electron main.js), Express also serves the
// React POS frontend from dist/pos-dist/ so that both the API and the SPA
// share the same origin (http://localhost:5001).
//
// This eliminates cross-origin cookie issues — the HttpOnly refresh token
// cookie is set on localhost:5001 and all subsequent requests (from the same
// origin) automatically include it.
//
// The pos-dist/ directory is populated by artifacts/desktop/build-all.mjs
// which copies artifacts/pos/dist/public/ → artifacts/api-server/dist/pos-dist/
// before packaging.
//
// This block has zero effect in web-only deployments (SERVE_STATIC is never
// set in that environment).
// ──────────────────────────────────────────────────────────────────────────
if (process.env["SERVE_STATIC"] === "true") {
  // __dirname is injected by esbuild banner (globalThis.__dirname)
  const distDir =
    typeof __dirname !== "undefined"
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));

  const staticDir = path.join(distDir, "pos-dist");

  logger.info({ staticDir }, "Desktop mode: serving SPA from static directory");

  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(staticDir));

  // SPA fallback — serve index.html for all non-API routes so that
  // client-side routing (Wouter) works correctly on hard refresh.
  app.get(/(.*)/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

// Centralized error handler — logs and returns a generic message.
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    req.log.error({ err }, "Unhandled error");
    if (res.headersSent) return;
    const errorMessage = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
    res.status(500).json({ error: "حدث خطأ غير متوقع", details: errorMessage });
  },
);

export default app;
