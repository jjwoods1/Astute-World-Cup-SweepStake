const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.env.PORT || 8080);
const root = __dirname;
const sheetCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbvGbdDL3Mn9M5YGGvvB9ZuFrA-naqeTDfOUJxFWxblSy6UkZaCoig13As4ufsfmJcrEQ5nVUwandr/pub?output=csv";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(body);
}

async function serveSheet(response) {
  const liveUrl = new URL(sheetCsvUrl);
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
  if (request.url.startsWith("/api/sheet")) {
    serveSheet(response).catch((error) => {
      console.error(error);
      send(response, 502, "Could not load spreadsheet", { "Content-Type": "text/plain; charset=utf-8" });
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
