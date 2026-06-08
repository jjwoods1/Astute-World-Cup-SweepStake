module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).send("Method not allowed");
    return;
  }

  const webhookUrl = process.env.N8N_ASSIGNMENT_WEBHOOK_URL;
  const assignment = typeof request.body === "string"
    ? JSON.parse(request.body || "{}")
    : request.body || {};

  if (!webhookUrl) {
    response.status(501).json({
      ok: false,
      message: "Set N8N_ASSIGNMENT_WEBHOOK_URL to forward assignments.",
      assignment
    });
    return;
  }

  try {
    const workflowResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(assignment)
    });
    const body = await workflowResponse.text();

    response.status(workflowResponse.ok ? 200 : 502).json({
      ok: workflowResponse.ok,
      status: workflowResponse.status,
      body
    });
  } catch (error) {
    console.error(error);
    response.status(502).json({
      ok: false,
      message: "Could not send assignment"
    });
  }
};
