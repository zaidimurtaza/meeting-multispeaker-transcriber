import { serve } from "@hono/node-server";
import { env } from "@my-better-t-app/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { recordingRoutes } from "./recording/routes";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/", (c) => {
  return c.text("OK");
});

app.route("/api/recordings", recordingRoutes);

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });

export default app;
