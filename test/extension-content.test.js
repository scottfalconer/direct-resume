import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const contentScript = await fs.readFile(new URL("../extension/content.js", import.meta.url), "utf8");

test("content script resolves DrupalCode GitLab work item pages", async () => {
  const { messages } = await runContentScript("https://git.drupalcode.org/project/ai_context/-/work_items/3586150");

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "direct-resume:resolve");
  assert.equal(messages[0].input.url, "https://git.drupalcode.org/project/ai_context/-/work_items/3586150");
});

test("content script ignores unsupported DrupalCode paths", async () => {
  const { messages } = await runContentScript("https://git.drupalcode.org/project/ai_context/-/merge_requests/331");

  assert.equal(messages.length, 0);
});

test("content script extracts Jira issue keys from fragmented issue pages", async () => {
  const { messages } = await runContentScript(
    "https://acquia.atlassian.net/jira/software/projects/PROS/boards/1",
    {
      title: "PROS-370 ticket",
    },
  );

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "direct-resume:resolve");
  assert.equal(messages[0].input.metadata.issue_key, "PROS-370");
});

async function runContentScript(url, options = {}) {
  const messages = [];
  const body = new FakeElement("body");
  const location = new URL(url);
  const context = {
    alert() {},
    chrome: {
      runtime: {
        sendMessage(message, callback) {
          messages.push(message);
          callback({
            ok: true,
            payload: {
              state: "offline",
              startCommand: "npm start",
              setupCommand: "npm run setup",
            },
          });
        },
      },
    },
    console,
    document: {
      title: options.title || "Direct Resume test page",
      createElement(tagName) {
        return new FakeElement(tagName);
      },
      querySelector(selector) {
        if (selector === "body") {
          return body;
        }
        return null;
      },
    },
    navigator: {
      clipboard: {
        async writeText() {},
      },
    },
    prompt() {
      return null;
    },
    window: {
      location,
      setTimeout() {},
    },
  };

  vm.createContext(context);
  vm.runInContext(contentScript, context);
  await Promise.resolve();

  return {
    body,
    messages,
  };
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.classList = {
      add: (...classNames) => {
        this.className = [this.className, ...classNames].filter(Boolean).join(" ");
      },
    };
  }

  addEventListener() {}

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  prepend(child) {
    this.children.unshift(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}
