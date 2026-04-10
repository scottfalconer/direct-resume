const COMPANION_BASE_URLS = [
  "http://127.0.0.1:38551",
  "http://localhost:38551",
];

const STORAGE_TOKEN_KEY = "direct_resume_api_token";
const OFFLINE_START_COMMAND = "cd /Users/scott/dev/direct-resume && npm start";
const SETUP_COMMAND = "cd /Users/scott/dev/direct-resume && npm run setup";

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
  if (message.type === "direct-resume:pair") {
    return pairExtension(message.pairingToken);
  }

  if (message.type === "direct-resume:resolve") {
    return companionPost("/api/resolve", message.input);
  }

  if (message.type === "direct-resume:link") {
    return companionPost("/api/link", message.input);
  }

  if (message.type === "direct-resume:resume") {
    return companionPost("/api/resume", {
      candidate_ref: message.candidateRef,
      mode: message.mode || "copy",
    });
  }

  throw new Error("Unsupported message type.");
}

async function pairExtension(pairingToken) {
  const companion = await findHealthyCompanion();
  if (!companion) {
    return offlineState();
  }

  const response = await fetch(`${companion.baseUrl}/api/pair`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      protocol_version: 1,
      pairing_token: String(pairingToken || "").trim(),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      state: "pair_failed",
      error: payload.error?.message || `Pairing failed with status ${response.status}.`,
      setupCommand: SETUP_COMMAND,
    };
  }

  await chromeStorageSet({ [STORAGE_TOKEN_KEY]: payload.api_token });
  return {
    state: "paired",
    baseUrl: companion.baseUrl,
    health: companion.health,
  };
}

async function companionPost(path, body) {
  const companion = await findHealthyCompanion();
  if (!companion) {
    return offlineState();
  }

  const token = await getApiToken();
  if (!token) {
    return {
      state: "unpaired",
      baseUrl: companion.baseUrl,
      health: companion.health,
      setupCommand: SETUP_COMMAND,
    };
  }

  const response = await fetch(`${companion.baseUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      protocol_version: 1,
      ...body,
    }),
  });
  const payload = await response.json();

  if (response.status === 401) {
    await chromeStorageSet({ [STORAGE_TOKEN_KEY]: null });
    return {
      state: "unpaired",
      error: payload.error?.message || "Pair the extension with the local companion.",
      setupCommand: SETUP_COMMAND,
    };
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || `Companion request failed with status ${response.status}.`);
  }

  return {
    state: "ready",
    baseUrl: companion.baseUrl,
    health: companion.health,
    result: payload,
  };
}

async function getApiToken() {
  const values = await chromeStorageGet(STORAGE_TOKEN_KEY);
  return values[STORAGE_TOKEN_KEY] || null;
}

function offlineState() {
  return {
    state: "offline",
    startCommand: OFFLINE_START_COMMAND,
    setupCommand: SETUP_COMMAND,
  };
}

function chromeStorageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function chromeStorageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}
