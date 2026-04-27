const sheetCsvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRbvGbdDL3Mn9M5YGGvvB9ZuFrA-naqeTDfOUJxFWxblSy6UkZaCoig13As4ufsfmJcrEQ5nVUwandr/pub?output=csv";

module.exports = async function handler(request, response) {
  const liveUrl = new URL(sheetCsvUrl);
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
