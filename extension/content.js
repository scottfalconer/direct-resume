(function () {
  const pageInput = detectWorkObjectPage();
  if (!pageInput) {
    return;
  }

  const mountPoint = findMountPoint();
  if (!mountPoint) {
    return;
  }

  const panel = createElement("section", {
    className: "issue-companion",
    attributes: { "data-direct-resume": "panel" },
  });
  mountPoint.prepend(panel);

  renderLoading();
  void resolveCurrentPage();

  async function resolveCurrentPage() {
    panel.replaceChildren(renderHeader("Direct Resume", "Checking local sessions"));
    panel.appendChild(renderStatus("Looking for linked Codex or Claude sessions..."));

    const response = await sendRuntimeMessage({
      type: "direct-resume:resolve",
      input: pageInput,
    });

    if (response.state === "offline") {
      renderOfflineState(response);
      return;
    }

    if (response.state === "unpaired") {
      renderPairingState(response);
      return;
    }

    renderResolveResult(response.result, response.health);
  }

  function renderLoading() {
    panel.replaceChildren(renderHeader("Direct Resume", "Loading"));
    panel.appendChild(renderStatus("Loading local companion state..."));
  }

  function renderResolveResult(result, health) {
    const workObject = result.work_object;
    const candidates = Array.isArray(result.candidates) ? result.candidates : [];
    panel.replaceChildren(renderHeader("Direct Resume", stateLabel(result.state)));

    const body = createElement("div", { className: "issue-companion__body" });
    body.appendChild(renderWorkObject(workObject));

    if (result.state === "unsupported") {
      body.appendChild(renderParagraphSection("Unsupported page", "This page is not a supported Drupal.org or Jira issue URL."));
      panel.appendChild(body);
      return;
    }

    if (!candidates.length) {
      body.appendChild(renderParagraphSection("No linked session", "Link the current Codex or Claude session once, then this page becomes a direct resume point."));
    }
    else {
      const section = createElement("section", { className: "issue-companion__section" });
      section.appendChild(createElement("h4", { text: candidates.length === 1 ? "Best match" : "Resume candidates" }));
      const stack = createElement("div", { className: "issue-companion__stack" });
      candidates.forEach((candidate) => {
        stack.appendChild(renderCandidate(candidate, health));
      });
      section.appendChild(stack);
      body.appendChild(section);
    }

    const actions = createElement("div", { className: "issue-companion__actions" });
    actions.appendChild(createButton("Link current session", () => linkCurrentSession()));
    actions.appendChild(createButton("Refresh", () => resolveCurrentPage()));
    body.appendChild(actions);
    panel.appendChild(body);
  }

  function renderWorkObject(workObject) {
    const section = createElement("section", { className: "issue-companion__summary" });
    const identity = createElement("div", { className: "issue-companion__identity" });
    identity.appendChild(createElement("h3", { text: workObject?.display_title || document.title || "Current work object" }));

    const links = createElement("div", { className: "issue-companion__links" });
    if (workObject?.canonical_url) {
      links.appendChild(createLink("Canonical issue", workObject.canonical_url));
    }
    identity.appendChild(links);
    section.appendChild(identity);

    const facts = createElement("dl", { className: "issue-companion__facts" });
    facts.appendChild(createElement("dt", { text: "Anchor" }));
    facts.appendChild(createElement("dd", { text: workObject?.canonical_id || "Not supported" }));
    facts.appendChild(createElement("dt", { text: "Source" }));
    facts.appendChild(createElement("dd", { text: workObject?.source || "unknown" }));
    section.appendChild(facts);
    return section;
  }

  function renderCandidate(candidate, health) {
    const card = createElement("article", { className: "issue-companion__list-card" });
    card.appendChild(createElement("div", {
      className: "issue-companion__list-title",
      text: `${agentLabel(candidate.agent)}: ${candidate.label}`,
    }));
    card.appendChild(createElement("div", {
      className: "issue-companion__list-meta",
      text: `${candidate.match_type} match • confidence ${Math.round(candidate.confidence * 100)}%${candidate.last_seen_at ? ` • ${formatDate(candidate.last_seen_at)}` : ""}`,
    }));

    if (candidate.summary) {
      card.appendChild(createElement("p", { text: candidate.summary }));
    }
    if (candidate.workspace_path) {
      card.appendChild(createElement("code", {
        className: "issue-companion__path",
        text: candidate.workspace_path,
      }));
    }

    const actions = createElement("div", { className: "issue-companion__actions" });
    actions.appendChild(createButton("Copy resume", () => resumeCandidate(candidate, "copy")));
    if (health?.capabilities?.can_exec) {
      actions.appendChild(createButton("Open terminal", () => resumeCandidate(candidate, "exec")));
    }
    card.appendChild(actions);
    return card;
  }

  async function resumeCandidate(candidate, mode) {
    const response = await sendRuntimeMessage({
      type: "direct-resume:resume",
      candidateRef: candidate.candidate_ref,
      mode,
    });

    if (response.state !== "ready") {
      throw new Error(response.error || `Companion returned ${response.state}.`);
    }

    const action = response.result.action;
    if (action.type === "copy_command") {
      await navigator.clipboard.writeText(action.command);
    }
  }

  async function linkCurrentSession() {
    const agent = prompt("Agent to link: codex or claude", "codex");
    if (!agent) {
      return;
    }

    const resumeText = prompt("Paste the session id or resume command");
    if (!resumeText) {
      return;
    }

    const workspacePath = prompt("Local workspace path for this session");
    if (!workspacePath) {
      return;
    }

    const response = await sendRuntimeMessage({
      type: "direct-resume:link",
      input: {
        ...pageInput,
        agent: agent.trim().toLowerCase(),
        resume_text: resumeText.trim(),
        workspace_path: workspacePath.trim(),
      },
    });

    if (response.state !== "ready") {
      throw new Error(response.error || `Link failed with state ${response.state}.`);
    }

    renderResolveResult(response.result.resolved, response.health);
  }

  function renderPairingState(response) {
    panel.replaceChildren(renderHeader("Direct Resume", "Pair extension"));
    const body = createElement("section", { className: "issue-companion__offline" });
    body.appendChild(createElement("h3", { text: "Pair with the local companion" }));
    body.appendChild(createElement("p", {
      text: "Run setup locally, paste the one-time token here, then reload this page.",
    }));
    body.appendChild(renderCommandCard(response.setupCommand || "npm run setup"));
    body.appendChild(createButton("Enter pairing token", async () => {
      const token = prompt("Pairing token from `npm run setup`");
      if (!token) {
        return;
      }
      const pairResponse = await sendRuntimeMessage({
        type: "direct-resume:pair",
        pairingToken: token,
      });
      if (pairResponse.state !== "paired") {
        throw new Error(pairResponse.error || "Pairing failed.");
      }
      await resolveCurrentPage();
    }));
    panel.appendChild(body);
  }

  function renderOfflineState(response) {
    panel.replaceChildren(renderHeader("Direct Resume", "Companion offline"));
    const body = createElement("section", { className: "issue-companion__offline" });
    body.appendChild(createElement("h3", { text: "Start the local companion" }));
    body.appendChild(createElement("p", {
      text: "Direct Resume runs local-first. Start the companion, then reload this page.",
    }));
    body.appendChild(renderCommandCard(response.startCommand || "npm start"));
    body.appendChild(createElement("p", {
      text: "If this is your first run, use setup first so the extension can pair with the companion.",
    }));
    body.appendChild(renderCommandCard(response.setupCommand || "npm run setup"));
    panel.appendChild(body);
  }

  function renderCommandCard(command) {
    const card = createElement("div", { className: "issue-companion__command-card" });
    card.appendChild(createElement("code", { className: "issue-companion__command", text: command }));
    const actions = createElement("div", { className: "issue-companion__actions" });
    actions.appendChild(createButton("Copy", () => navigator.clipboard.writeText(command)));
    card.appendChild(actions);
    return card;
  }
})();

function detectWorkObjectPage() {
  const metadata = pageMetadata();
  const href = window.location.href;

  if (
    window.location.hostname === "www.drupal.org" &&
    (
      /^\/project\/[^/]+\/issues\/\d+/.test(window.location.pathname) ||
      /^\/node\/\d+/.test(window.location.pathname)
    )
  ) {
    return {
      url: href,
      page_title: document.title,
      metadata,
    };
  }

  if (window.location.hostname.endsWith(".atlassian.net")) {
    const issueKey = extractJiraIssueKey();
    if (/^\/browse\/[A-Za-z][A-Za-z0-9]+-\d+/.test(window.location.pathname) || issueKey) {
      return {
        url: href,
        page_title: document.title,
        metadata: {
          ...metadata,
          issue_key: issueKey,
        },
      };
    }
  }

  return null;
}

function pageMetadata() {
  return {
    canonical_url: document.querySelector('link[rel="canonical"]')?.href || null,
    og_url: document.querySelector('meta[property="og:url"]')?.content || null,
    title: document.title || null,
  };
}

function extractJiraIssueKey() {
  const pathMatch = window.location.pathname.match(/\/browse\/([A-Za-z][A-Za-z0-9]+-\d+)/);
  if (pathMatch) {
    return pathMatch[1].toUpperCase();
  }

  const selectors = [
    "[data-issue-key]",
    "[data-testid='issue.views.issue-base.foundation.breadcrumbs.current-issue.item']",
    "meta[name='ajs-issue-key']",
  ];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const value = element?.getAttribute("data-issue-key") || element?.getAttribute("content") || element?.textContent;
    const match = String(value || "").match(/\b([A-Za-z][A-Za-z0-9]+-\d+)\b/);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  const titleMatch = document.title.match(/\b([A-Za-z][A-Za-z0-9]+-\d+)\b/);
  return titleMatch ? titleMatch[1].toUpperCase() : null;
}

function findMountPoint() {
  const selectors = [
    "#content-inner .region-content",
    "#block-system-main .content",
    "#content-inner",
    ".region-content",
    "main .layout__region--content",
    "main",
    "#content",
    "#main",
    ".dialog-off-canvas-main-canvas",
    "body",
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }

  return null;
}

function renderHeader(title, state) {
  const header = createElement("div", { className: "issue-companion__header" });
  header.appendChild(createElement("h2", { text: title }));
  header.appendChild(createElement("span", { className: "issue-companion__issue-id", text: state }));
  return header;
}

function renderParagraphSection(label, text) {
  const section = createElement("section", { className: "issue-companion__section" });
  section.appendChild(createElement("h4", { text: label }));
  section.appendChild(createElement("p", { text }));
  return section;
}

function renderStatus(message) {
  return createElement("div", { className: "issue-companion__status", text: message });
}

function createElement(tagName, options = {}) {
  const element = document.createElement(tagName);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text) {
    element.textContent = options.text;
  }
  if (options.attributes) {
    Object.entries(options.attributes).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });
  }
  return element;
}

function createLink(label, href) {
  const link = createElement("a", { text: label });
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function createButton(label, handler) {
  const button = createElement("button", {
    className: "issue-companion__button",
    text: label,
  });
  button.type = "button";
  button.addEventListener("click", async () => {
    button.disabled = true;
    const originalText = button.textContent;

    try {
      await handler();
      button.textContent = label.startsWith("Copy") ? "Copied" : "Done";
      window.setTimeout(() => {
        button.textContent = originalText;
      }, 1200);
    }
    catch (error) {
      button.textContent = "Failed";
      window.setTimeout(() => {
        button.textContent = originalText;
      }, 1600);
      console.error(error);
      alert(error instanceof Error ? error.message : String(error));
    }
    finally {
      window.setTimeout(() => {
        button.disabled = false;
      }, 250);
    }
  });
  return button;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (!response?.ok) {
        reject(new Error(response?.error || "The companion request failed."));
        return;
      }
      resolve(response.payload);
    });
  });
}

function stateLabel(state) {
  if (state === "one_match") {
    return "Ready";
  }
  if (state === "multiple_matches") {
    return "Choose session";
  }
  if (state === "no_match") {
    return "No match";
  }
  return "Unsupported";
}

function agentLabel(agent) {
  return agent === "claude" ? "Claude Code" : "Codex";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
