import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const backgroundScript = await fs.readFile(new URL("../extension/background.js", import.meta.url), "utf8");

test("background reports offline companion with repo-local commands", async () => {
  const { sendMessage } = runBackground({
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });

  const response = await sendMessage({
    type: "direct-resume:resolve",
    input: {
      url: "https://www.drupal.org/project/canvas/issues/3558241",
    },
  });

  assert.equal(response.ok, true);
  assert.equal(response.payload.state, "offline");
  assert.equal(response.payload.startCommand, "npm start");
  assert.equal(response.payload.setupCommand, "npm run setup");
});

test("background pairs and stores the local API token", async () => {
  const { sendMessage, storage } = runBackground({
    fetchImpl: async (url, options = {}) => {
      if (url.endsWith("/health")) {
        return jsonResponse({ ok: true, service: "direct-resume" });
      }

      assert.equal(url, "http://127.0.0.1:38551/api/pair");
      assert.deepEqual(JSON.parse(options.body), {
        protocol_version: 1,
        pairing_token: "pair-token-1",
      });
      return jsonResponse({
        ok: true,
        api_token: "api-token-1",
        machine_id: "machine-1",
      });
    },
  });

  const response = await sendMessage({
    type: "direct-resume:pair",
    pairingToken: "pair-token-1",
  });

  assert.equal(response.ok, true);
  assert.equal(response.payload.state, "paired");
  assert.equal(storage.direct_resume_api_token, "api-token-1");
});

test("background sends authenticated resolve requests with protocol version", async () => {
  const { sendMessage } = runBackground({
    storage: {
      direct_resume_api_token: "api-token-1",
    },
    fetchImpl: async (url, options = {}) => {
      if (url.endsWith("/health")) {
        return jsonResponse({ ok: true, service: "direct-resume" });
      }

      assert.equal(url, "http://127.0.0.1:38551/api/resolve");
      assert.equal(options.headers.Authorization, "Bearer api-token-1");
      assert.deepEqual(JSON.parse(options.body), {
        protocol_version: 1,
        url: "https://acquia.atlassian.net/browse/PROS-370",
      });
      return jsonResponse({
        ok: true,
        protocol_version: 1,
        state: "no_match",
        candidates: [],
      });
    },
  });

  const response = await sendMessage({
    type: "direct-resume:resolve",
    input: {
      url: "https://acquia.atlassian.net/browse/PROS-370",
    },
  });

  assert.equal(response.ok, true);
  assert.equal(response.payload.state, "ready");
  assert.equal(response.payload.result.state, "no_match");
});

function runBackground({ fetchImpl, storage = {} }) {
  let listener = null;
  const context = {
    console,
    fetch: fetchImpl,
    chrome: {
      runtime: {
        onMessage: {
          addListener(callback) {
            listener = callback;
          },
        },
      },
      storage: {
        local: {
          get(keys, callback) {
            const requested = Array.isArray(keys) ? keys : [keys];
            callback(Object.fromEntries(requested.map((key) => [key, storage[key]])));
          },
          set(values, callback) {
            Object.assign(storage, values);
            callback();
          },
        },
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(backgroundScript, context);
  assert.equal(typeof listener, "function");

  return {
    storage,
    sendMessage(message) {
      return new Promise((resolve) => {
        listener(message, {}, resolve);
      });
    },
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}
