import http from "node:http";
import process from "node:process";
import { randomUUID } from "node:crypto";

const port = Number(process.env.PORT || 3000);
const host = "0.0.0.0";
const startedAt = new Date().toISOString();

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const requestId = req.headers["x-request-id"] || randomUUID();
  res.setHeader("x-request-id", requestId);

  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, {
      status: "ok",
      service: "mkton-mcp-runtime",
      started_at: startedAt,
    });
  }

  if (req.method === "GET" && req.url === "/ready") {
    return json(res, 200, {
      status: "ready",
      service: "mkton-mcp-runtime",
    });
  }

  if (req.method === "GET" && req.url === "/") {
    return json(res, 200, {
      service: "mkton-mcp-runtime",
      status: "online",
      purpose: "MktOn Telegram MCP infrastructure runtime",
    });
  }

  return json(res, 404, {
    error: "not_found",
    request_id: requestId,
  });
});

server.listen(port, host, () => {
  console.log(JSON.stringify({
    level: "info",
    event: "server_started",
    service: "mkton-mcp-runtime",
    port,
    started_at: startedAt,
  }));
});

function shutdown(signal) {
  console.log(JSON.stringify({
    level: "info",
    event: "shutdown_requested",
    service: "mkton-mcp-runtime",
    signal,
  }));

  server.close((error) => {
    if (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "shutdown_failed",
        service: "mkton-mcp-runtime",
        message: error.message,
      }));
      process.exit(1);
    }

    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
