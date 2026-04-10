const COMPANION_BASE_URLS = [
  "http://127.0.0.1:38551",
  "http://localhost:38551",
];

const OFFLINE_START_COMMAND =
  "cd /Users/scott/dev/direct-resume && npm start";

async function findHealthyCompanion() {
  for (const baseUrl of COMPANION_BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        return { baseUrl, health: payload };
      }
    }
    catch {
      // Ignore the failed endpoint and try the next one.
    }
  }

  return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );

  return true;
});

async function handleMessage(message) {
  if (message.type === "issue-companion:get-context") {
    const issueId = String(message.issueId || "");
    const companion = await findHealthyCompanion();

    if (!companion) {
      return {
        state: "offline",
        issueId,
        startCommand: OFFLINE_START_COMMAND,
      };
    }

    const response = await fetch(`${companion.baseUrl}/api/issues/${issueId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Companion lookup failed with status ${response.status}.`);
    }

    return {
      state: "ready",
      baseUrl: companion.baseUrl,
      health: companion.health,
      context: await response.json(),
    };
  }

  if (message.type === "issue-companion:get-dashboard-beads") {
    const companion = await findHealthyCompanion();

    if (!companion) {
      return {
        state: "offline",
        startCommand: OFFLINE_START_COMMAND,
      };
    }

    const response = await fetch(`${companion.baseUrl}/api/dashboard/beads`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Dashboard lookup failed with status ${response.status}.`);
    }

    return {
      state: "ready",
      baseUrl: companion.baseUrl,
      health: companion.health,
      dashboard: await response.json(),
    };
  }

  if (message.type === "issue-companion:open-action") {
    const companion = await findHealthyCompanion();
    if (!companion) {
      throw new Error("The local companion is not running.");
    }

    const response = await fetch(`${companion.baseUrl}/api/issues/${message.issueId}/open`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message.action),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Launch request failed with status ${response.status}.`);
    }

    return payload;
  }

  throw new Error("Unsupported message type.");
}
