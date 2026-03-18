import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./routes/auth";
import { orgRoutes } from "./routes/organizations";
import { formRoutes } from "./routes/forms";
import { responseRoutes } from "./routes/responses";
import { kioskRoutes } from "./routes/kiosk";
import { webhookRoutes } from "./routes/webhooks";
import { fieldGroupRoutes } from "./routes/field-groups";
import { userRoutes } from "./routes/users";
import { exportRoutes } from "./routes/export";
import { fileRoutes } from "./routes/files";

export type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  MAILCHANNELS_API_KEY: string;
  FROM_EMAIL: string;
  ALLOWED_ORIGINS: string;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS
app.use("*", async (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS
    ? c.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : ["*"];

  const origin = c.req.header("Origin") ?? "";
  const isAllowed =
    allowedOrigins.includes("*") || allowedOrigins.includes(origin);

  return cors({
    origin: isAllowed ? origin || "*" : allowedOrigins[0] ?? "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
    maxAge: 86400,
  })(c, next);
});

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// Routes
app.route("/api/auth", authRoutes);
app.route("/api/orgs", orgRoutes);
app.route("/api/forms", formRoutes);
app.route("/api/responses", responseRoutes);
app.route("/api/kiosk", kioskRoutes);
app.route("/api/webhooks", webhookRoutes);
app.route("/api/field-groups", fieldGroupRoutes);
app.route("/api/users", userRoutes);
app.route("/api/export", exportRoutes);
app.route("/api/files", fileRoutes);

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "Internal server error",
      message:
        c.env.ENVIRONMENT === "development" ? err.message : "An unexpected error occurred",
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found", path: c.req.path }, 404);
});

export default app;
