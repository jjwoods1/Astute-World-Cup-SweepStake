const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.env.PORT || 8080);
const root = __dirname;
const sheetCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbvGbdDL3Mn9M5YGGvvB9ZuFrA-naqeTDfOUJxFWxblSy6UkZaCoig13As4ufsfmJcrEQ5nVUwandr/pub";

// Live n8n webhooks (running locally). Override with env vars if your n8n
// is on a different host/port.
const sheetReadWebhookUrl = process.env.N8N_SHEET_READ_WEBHOOK_URL || "http://localhost:5678/webhook/wc-sweepstake-read";
const assignmentWebhookUrl = process.env.N8N_ASSIGNMENT_WEBHOOK_URL || "http://localhost:5678/webhook/wc-sweepstake-write";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png"
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(body);
}

async function serveSheet(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const liveUrl = new URL(sheetCsvUrl);
  const gid = requestUrl.searchParams.get("gid");

  if (gid) {
    liveUrl.searchParams.set("gid", gid);
    liveUrl.searchParams.set("single", "true");
  }

  liveUrl.searchParams.set("output", "csv");
  liveUrl.searchParams.set("cacheBust", Date.now());

  const sheetResponse = await fetch(liveUrl, { cache: "no-store" });
  if (!sheetResponse.ok) {
    throw new Error(`Google returned ${sheetResponse.status}`);
  }

  const csv = await sheetResponse.text();
  send(response, 200, csv, {
    "Content-Type": "text/csv; charset=utf-8"
  });
}

async function serveSheetLive(request, response) {
  const readResponse = await fetch(sheetReadWebhookUrl, {
    method: "GET",
    headers: { "Accept": "application/json" },
    cache: "no-store"
  });

  if (!readResponse.ok) {
    throw new Error(`n8n read returned ${readResponse.status}`);
  }

  const body = await readResponse.text();
  send(response, 200, body, {
    "Content-Type": "application/json; charset=utf-8"
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body is too large"));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function serveAssignment(request, response) {
  if (request.method !== "POST") {
    send(response, 405, "Method not allowed", {
      "Allow": "POST",
      "Content-Type": "text/plain; charset=utf-8"
    });
    return;
  }

  const webhookUrl = assignmentWebhookUrl;
  const rawBody = await readRequestBody(request);
  const assignment = JSON.parse(rawBody || "{}");

  if (!webhookUrl) {
    send(response, 501, JSON.stringify({
      ok: false,
      message: "Set N8N_ASSIGNMENT_WEBHOOK_URL to forward assignments.",
      assignment
    }), {
      "Content-Type": "application/json; charset=utf-8"
    });
    return;
  }

  const workflowResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(assignment)
  });

  const workflowBody = await workflowResponse.text();
  send(response, workflowResponse.ok ? 200 : 502, JSON.stringify({
    ok: workflowResponse.ok,
    status: workflowResponse.status,
    body: workflowBody
  }), {
    "Content-Type": "application/json; charset=utf-8"
  });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(root, path.normalize(requestedPath));

  if (!filePath.startsWith(root)) {
    send(response, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const body = await fs.readFile(filePath);
  send(response, 200, body, {
    "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
  });
}

const server = http.createServer((request, response) => {
  if (request.url.startsWith("/api/sheet-live")) {
    serveSheetLive(request, response).catch((error) => {
      console.error(error);
      send(response, 502, "Could not load live sheet from n8n", { "Content-Type": "text/plain; charset=utf-8" });
    });
    return;
  }

  if (request.url.startsWith("/api/sheet")) {
    serveSheet(request, response).catch((error) => {
      console.error(error);
      send(response, 502, "Could not load spreadsheet", { "Content-Type": "text/plain; charset=utf-8" });
    });
    return;
  }

  if (request.url.startsWith("/api/assign")) {
    serveAssignment(request, response).catch((error) => {
      console.error(error);
      send(response, 502, "Could not send assignment", { "Content-Type": "text/plain; charset=utf-8" });
    });
    return;
  }

  serveStatic(request, response).catch(() => {
    send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  });
});

server.listen(port, () => {
  console.log(`Sweepstake page running at http://localhost:${port}`);
});
