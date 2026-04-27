const sheetCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbvGbdDL3Mn9M5YGGvvB9ZuFrA-naqeTDfOUJxFWxblSy6UkZaCoig13As4ufsfmJcrEQ5nVUwandr/pub";

module.exports = async function handler(request, response) {
  const liveUrl = new URL(sheetCsvUrl);
  const requestUrl = new URL(request.url, "http://localhost");
  const gid = requestUrl.searchParams.get("gid");

  if (gid) {
    liveUrl.searchParams.set("gid", gid);
    liveUrl.searchParams.set("single", "true");
  }

  liveUrl.searchParams.set("output", "csv");
  liveUrl.searchParams.set("cacheBust", Date.now());

  try {
    const sheetResponse = await fetch(liveUrl, { cache: "no-store" });

    if (!sheetResponse.ok) {
      response.status(502).send(`Google returned ${sheetResponse.status}`);
      return;
    }

    const csv = await sheetResponse.text();

    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.status(200).send(csv);
  } catch (error) {
    console.error(error);
    response.status(502).send("Could not load spreadsheet");
  }
};
