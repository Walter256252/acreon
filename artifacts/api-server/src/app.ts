import { LoanInputError } from "./lib/loan";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── Trust proxy ────────────────────────────────────────────────────────────
// Replit's deployment sits behind a reverse proxy that sets X-Forwarded-For.
// Without this, express-rate-limit throws a ValidationError on every request
// and the IP-based rate limiting uses the wrong address.
app.set("trust proxy", 1);

// ── Security headers ───────────────────────────────────────────────────────
app.use(
  helmet({
    // CSP disabled here — frontend is served separately; API only returns JSON
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// ── CORS — only allow requests from the app's own origin ───────────────────
// In the Replit proxy architecture the frontend and API share the same
// hostname, so legitimate browser requests are same-origin and don't even
// send an Origin header. We still configure CORS defensively so that any
// future cross-origin caller must be explicitly allowed.
const allowedOrigins = new Set<string>(
  [
    process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
    process.env.ALLOWED_ORIGIN ?? null,
  ].filter(Boolean) as string[],
);

// Only explicitly configured origins are trusted.
function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.has(origin);
}

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Same-origin requests (no Origin header) and requests from explicitly
      // allowed origins are permitted. Everything else is rejected.
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
  }),
);

// ── Rate limiting ──────────────────────────────────────────────────────────
// General limit: 200 requests per IP per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please try again later." },
  skip: (req) => req.path === "/api/health" || req.path === "/api/healthz",
});

// Stricter limit for AI and email sync endpoints: 30 per 15 minutes
const heavyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to this endpoint — please try again later." },
});

app.use(generalLimiter);
app.use("/api/openai", heavyLimiter);
app.use("/api/email/sync", heavyLimiter);
app.use("/api/user/digest", heavyLimiter);

// ── Logging ────────────────────────────────────────────────────────────────
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

// Clerk proxy must come before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// ── Global error handler ───────────────────────────────────────────────────
// Must be defined last — catches any error thrown by routes or middleware.
// Never sends stack traces or internal error details to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, "Unhandled error");

  if (err instanceof LoanInputError || err.name === "ZodError") {
    res.status(400).json({ error: err instanceof LoanInputError ? err.message : "Invalid request input" });
    return;
  }

  // CORS errors get a 403 rather than 500
  if (err.message?.startsWith("CORS:")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!res.headersSent) {
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

export default app;
