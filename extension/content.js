(function () {
  const issueId = extractIssueIdFromPage();
  const isDashboardPage = isDrupalDashboardPage();
  if (!issueId && !isDashboardPage) {
    return;
  }

  const mountPoint = findMountPoint();
  if (!mountPoint) {
    return;
  }

  if (issueId) {
    const panel = createElement("section", {
      className: "issue-companion",
      attributes: { "data-issue-id": issueId },
    });
    panel.appendChild(renderHeader(issueId));
    panel.appendChild(renderStatus("Loading local issue context…"));
    mountPoint.prepend(panel);

    chrome.runtime.sendMessage(
      { type: "issue-companion:get-context", issueId },
      (response) => {
        panel.replaceChildren(renderHeader(issueId));

        if (!response?.ok) {
          panel.appendChild(renderError(response?.error || "The extension could not read local issue context."));
          return;
        }

        if (response.payload.state === "offline") {
          panel.appendChild(renderOfflineState(response.payload.startCommand));
          return;
        }

        panel.appendChild(renderContext(response.payload.context));
      },
    );
    return;
  }

  const dashboardPanel = createElement("section", {
    className: "issue-companion issue-companion--dashboard",
    attributes: { "data-dashboard-block": "beads" },
  });
  dashboardPanel.appendChild(renderDashboardHeader());
  dashboardPanel.appendChild(renderStatus("Loading tracked Beads…"));
  mountPoint.prepend(dashboardPanel);

  chrome.runtime.sendMessage(
    { type: "issue-companion:get-dashboard-beads" },
    (response) => {
      dashboardPanel.replaceChildren(renderDashboardHeader());

      if (!response?.ok) {
        dashboardPanel.appendChild(renderError(response?.error || "The extension could not load your tracked issues."));
        return;
      }

      if (response.payload.state === "offline") {
        dashboardPanel.appendChild(renderOfflineState(response.payload.startCommand));
        return;
      }

      dashboardPanel.appendChild(renderDashboard(response.payload.dashboard));
    },
  );

  function renderContext(context) {
    const wrapper = createElement("div", { className: "issue-companion__body" });
    const summary = createElement("div", { className: "issue-companion__summary" });

    summary.appendChild(renderIdentity(context.primary));
    summary.appendChild(renderFacts(context.primary));
    wrapper.appendChild(summary);

    if (context.primary.nextStep) {
      wrapper.appendChild(renderParagraphSection("Next step", context.primary.nextStep));
    }
    if (context.primary.testPlan) {
      wrapper.appendChild(renderParagraphSection("Test plan", context.primary.testPlan));
    }
    if (context.primary.conversationSummary) {
      wrapper.appendChild(renderParagraphSection("Chat summary", context.primary.conversationSummary));
    }
    if (context.primary.lastThreadComment) {
      wrapper.appendChild(renderParagraphSection("Last thread comment", context.primary.lastThreadComment));
    }

    wrapper.appendChild(renderCommandSection(context));

    if (context.sessions.length) {
      wrapper.appendChild(renderSessions(context));
    }
    if (context.beads.length) {
      wrapper.appendChild(renderBeads(context.beads));
    }
    if (context.artifacts.length) {
      wrapper.appendChild(renderArtifacts(context.artifacts));
    }

    return wrapper;
  }

  function renderDashboard(dashboard) {
    const wrapper = createElement("div", { className: "issue-companion__body" });
    const items = Array.isArray(dashboard.items) ? dashboard.items : [];
    const openItems = items.filter((item) => !item.isClosed);
    const closedItems = items.filter((item) => item.isClosed);

    if (!items.length) {
      wrapper.appendChild(
        createElement("p", {
          text: "No actionable Beads are ready right now.",
        }),
      );
      return wrapper;
    }

    if (openItems.length) {
      wrapper.appendChild(renderDashboardList(openItems, dashboard));
    }
    else {
      wrapper.appendChild(
        createElement("p", {
          text: "All currently tracked Beads appear to be closed upstream.",
        }),
      );
    }

    if (closedItems.length) {
      const details = createElement("details", { className: "issue-companion__details" });
      details.appendChild(
        createElement("summary", {
          text: `Upstream closed (${closedItems.length})`,
        }),
      );
      details.appendChild(
        createElement("div", {
          className: "issue-companion__artifact-note",
          text: "These stay hidden from the main list. The companion checks for upstream-closed issues periodically and closes stale local Beads automatically; run `npm run sync:closed-beads` if you want to force a manual sync now.",
        }),
      );
      details.appendChild(renderDashboardList(closedItems, dashboard));
      wrapper.appendChild(details);
    }

    return wrapper;
  }

  function renderDashboardList(items, dashboard) {
    const list = createElement("div", { className: "issue-companion__dashboard-list" });
    items.forEach((item) => {
      const row = createElement("article", { className: "issue-companion__dashboard-item" });
      const titleRow = createElement("div", { className: "issue-companion__dashboard-title-row" });
      const titleLink = createLink(item.title, item.issueUrl);
      titleLink.classList.add("issue-companion__dashboard-title");
      titleRow.appendChild(titleLink);

      const badges = createElement("div", { className: "issue-companion__meta-row" });
      if (item.upstreamStatus) {
        badges.appendChild(createBadge(item.upstreamStatus, "status"));
      }
      if (item.localStatus) {
        badges.appendChild(createPill(`Beads: ${item.localStatus}`));
      }
      titleRow.appendChild(badges);
      row.appendChild(titleRow);

      row.appendChild(
        createElement("div", {
          className: "issue-companion__list-meta",
          text: `#${item.issueId}${item.upstreamUpdatedAt ? ` • upstream updated ${formatDate(item.upstreamUpdatedAt)}` : ""}`,
        }),
      );

      if (item.conversationSummary) {
        row.appendChild(
          createElement("p", {
            className: "issue-companion__dashboard-summary",
            text: item.conversationSummary,
          }),
        );
      }

      if (item.nextStep) {
        row.appendChild(
          createElement("div", {
            className: "issue-companion__artifact-note",
            text: `Next step: ${item.nextStep}`,
          }),
        );
      }

      if (item.latestComment?.body) {
        row.appendChild(
          createElement("div", {
            className: "issue-companion__comment",
            text: `Last comment${item.latestComment.author ? ` · ${item.latestComment.author}` : ""}: ${item.latestComment.body}`,
          }),
        );
      }

      if (item.suggestedCommand) {
        const actions = createElement("div", { className: "issue-companion__actions" });
        actions.appendChild(
          createButton("Copy resume", async () => {
            await navigator.clipboard.writeText(item.suggestedCommand);
          }),
        );
        if (item.suggestedAction && dashboard.capabilities?.canLaunchITerm) {
          actions.appendChild(
            createButton("Open in iTerm", async () => {
              await sendRuntimeMessage({
                type: "issue-companion:open-action",
                issueId: item.issueId,
                action: item.suggestedAction,
              });
            }),
          );
        }
        row.appendChild(actions);
      }

      list.appendChild(row);
    });
    return list;
  }

  function renderIdentity(primary) {
    const block = createElement("div", { className: "issue-companion__identity" });
    block.appendChild(createElement("h3", { text: primary.title }));

    const meta = createElement("div", { className: "issue-companion__meta-row" });
    if (primary.status) {
      meta.appendChild(createBadge(primary.status));
    }
    if (primary.issueType) {
      meta.appendChild(createPill(primary.issueType));
    }
    if (primary.updatedAt) {
      meta.appendChild(createPill(`Updated ${formatDate(primary.updatedAt)}`));
    }
    block.appendChild(meta);

    const links = createElement("div", { className: "issue-companion__links" });
    links.appendChild(createLink("Issue", primary.issueUrl));
    if (primary.mrUrl) {
      links.appendChild(createLink("MR", primary.mrUrl));
    }
    block.appendChild(links);

    return block;
  }

  function renderFacts(primary) {
    const facts = createElement("dl", { className: "issue-companion__facts" });
    if (primary.intent) {
      facts.appendChild(createElement("dt", { text: "Intent" }));
      facts.appendChild(createElement("dd", { text: primary.intent }));
    }
    facts.appendChild(createElement("dt", { text: "Suggested command" }));
    facts.appendChild(
      createElement("dd", {
        text: primary.suggestedCommand || "No resume command found yet.",
      }),
    );
    return facts;
  }

  function renderParagraphSection(label, text) {
    const section = createElement("section", { className: "issue-companion__section" });
    section.appendChild(createElement("h4", { text: label }));
    section.appendChild(createElement("p", { text }));
    return section;
  }

  function renderCommandSection(context) {
    const section = createElement("section", { className: "issue-companion__section" });
    section.appendChild(createElement("h4", { text: "Resume" }));

    const command = context.primary.suggestedCommand;
    if (command) {
      section.appendChild(renderCommandCard(command, context.primary.suggestedAction, context));
    }
    else {
      section.appendChild(
        createElement("p", {
          text: "No launcher script or Codex session matched this issue yet.",
        }),
      );
    }

    return section;
  }

  function renderCommandCard(command, action, context) {
    const card = createElement("div", { className: "issue-companion__command-card" });
    card.appendChild(createElement("code", { className: "issue-companion__command", text: command }));

    const actions = createElement("div", { className: "issue-companion__actions" });
    actions.appendChild(
      createButton("Copy", async () => {
        await navigator.clipboard.writeText(command);
      }),
    );

    if (action && context.capabilities.canLaunchITerm) {
      actions.appendChild(
        createButton("Open in iTerm", async () => {
          await sendRuntimeMessage({
            type: "issue-companion:open-action",
            issueId: context.issueId,
            action,
          });
        }),
      );
    }

    card.appendChild(actions);
    return card;
  }

  function renderSessions(context) {
    const details = createElement("details", {
      className: "issue-companion__details",
      attributes: { open: "open" },
    });
    details.appendChild(
      createElement("summary", {
        text: `Related Codex sessions (${context.sessions.length})`,
      }),
    );

    const list = createElement("div", { className: "issue-companion__stack" });
    context.sessions.forEach((session) => {
      const row = createElement("div", { className: "issue-companion__list-card" });
      row.appendChild(createElement("div", { className: "issue-companion__list-title", text: session.sessionId }));
      row.appendChild(
        createElement("div", {
          className: "issue-companion__list-meta",
          text: `${session.mentionCount} prompts • last mentioned ${formatDate(session.lastMentionedAt)}`,
        }),
      );
      row.appendChild(
        createElement("div", {
          className: "issue-companion__artifact-note",
          text: `Chat summary: ${session.firstPrompt}`,
        }),
      );
      if (session.lastPrompt && session.lastPrompt !== session.firstPrompt) {
        row.appendChild(
          createElement("div", {
            className: "issue-companion__comment",
            text: `Last prompt: ${session.lastPrompt}`,
          }),
        );
      }
      row.appendChild(renderCommandCard(session.command, {
        type: "codex-session",
        label: "Resume session",
        sessionId: session.sessionId,
      }, context));
      list.appendChild(row);
    });
    details.appendChild(list);

    return details;
  }

  function renderBeads(beads) {
    const details = createElement("details", { className: "issue-companion__details" });
    details.appendChild(createElement("summary", { text: `Beads notes (${beads.length})` }));

    const list = createElement("div", { className: "issue-companion__stack" });
    beads.forEach((bead) => {
      const row = createElement("div", { className: "issue-companion__list-card" });
      row.appendChild(createElement("div", { className: "issue-companion__list-title", text: bead.title }));
      row.appendChild(
        createElement("div", {
          className: "issue-companion__list-meta",
          text: `${bead.beadId} • ${bead.status || "unknown status"} • ${bead.updatedAt ? formatDate(bead.updatedAt) : "unknown date"}`,
        }),
      );
      if (bead.conversationSummary) {
        row.appendChild(
          createElement("div", {
            className: "issue-companion__artifact-note",
            text: `Chat summary: ${bead.conversationSummary}`,
          }),
        );
      }
      if (bead.lastThreadComment) {
        row.appendChild(
          createElement("div", {
            className: "issue-companion__comment",
            text: `Last thread comment: ${bead.lastThreadComment}`,
          }),
        );
      }
      if (bead.descriptionFields.nextStep) {
        row.appendChild(createElement("p", { text: bead.descriptionFields.nextStep }));
      }
      bead.comments
        .filter((comment) => comment.text !== bead.lastThreadComment)
        .forEach((comment) => {
        row.appendChild(
          createElement("div", {
            className: "issue-companion__comment",
            text: `${comment.createdAt ? formatDate(comment.createdAt) : "Unknown date"}: ${comment.text}`,
          }),
        );
        });
      list.appendChild(row);
    });
    details.appendChild(list);

    return details;
  }

  function renderArtifacts(artifacts) {
    const details = createElement("details", { className: "issue-companion__details" });
    details.appendChild(createElement("summary", { text: `Local artifacts (${artifacts.length})` }));

    const list = createElement("div", { className: "issue-companion__stack" });
    artifacts.forEach((artifact) => {
      const row = createElement("div", { className: "issue-companion__list-card" });
      row.appendChild(createElement("div", { className: "issue-companion__list-title", text: artifact.slug }));
      row.appendChild(
        createElement("div", {
          className: "issue-companion__list-meta",
          text: `${artifact.workflow.workflowMode || "workflow unknown"} • ${formatDate(artifact.updatedAt)}`,
        }),
      );
      if (artifact.workflow.mrUrls.length) {
        const links = createElement("div", { className: "issue-companion__links" });
        artifact.workflow.mrUrls.forEach((url, index) => {
          links.appendChild(createLink(`MR ${index + 1}`, url));
        });
        row.appendChild(links);
      }
      if (artifact.reportPreview) {
        row.appendChild(createElement("p", { text: artifact.reportPreview }));
      }
      if (artifact.issueCommentPreview) {
      row.appendChild(
        createElement("div", {
          className: "issue-companion__artifact-note",
          text: `Comment draft: ${artifact.issueCommentPreview}`,
          }),
        );
      }
      if (artifact.diffFiles.length || artifact.patchFiles.length) {
        row.appendChild(
          createElement("div", {
            className: "issue-companion__artifact-note",
            text: `Diffs: ${artifact.diffFiles.join(", ") || "none"} • Patches: ${artifact.patchFiles.join(", ") || "none"}`,
          }),
        );
      }
      row.appendChild(
        createElement("code", {
          className: "issue-companion__path",
          text: artifact.path,
        }),
      );
      list.appendChild(row);
    });
    details.appendChild(list);

    return details;
  }

  function renderOfflineState(startCommand) {
    const section = createElement("section", { className: "issue-companion__offline" });
    section.appendChild(createElement("h3", { text: "Local companion required" }));
    section.appendChild(
      createElement("p", {
        text: "When working in /Users/scott/dev/drupal-contrib, keep the companion running so Drupal.org issues show local Beads, artifact, and Codex session context.",
      }),
    );
    section.appendChild(
      createElement("p", {
        text: "Start it in the project below, then reload this issue page.",
      }),
    );
    const card = createElement("div", { className: "issue-companion__command-card" });
    card.appendChild(createElement("code", { className: "issue-companion__command", text: startCommand }));
    const actions = createElement("div", { className: "issue-companion__actions" });
    actions.appendChild(
      createButton("Copy", async () => {
        await navigator.clipboard.writeText(startCommand);
      }),
    );
    card.appendChild(actions);
    section.appendChild(card);
    return section;
  }

  function renderError(message) {
    return createElement("div", {
      className: "issue-companion__error",
      text: message,
    });
  }

  function renderHeader(currentIssueId) {
    const header = createElement("div", { className: "issue-companion__header" });
    header.appendChild(createElement("h2", { text: "Local Issue Context" }));
    header.appendChild(createElement("span", { className: "issue-companion__issue-id", text: `#${currentIssueId}` }));
    return header;
  }

  function renderDashboardHeader() {
    const header = createElement("div", { className: "issue-companion__header" });
    header.appendChild(createElement("h2", { text: "My Beads" }));
    header.appendChild(createElement("span", { className: "issue-companion__issue-id", text: "Tracked issues" }));
    return header;
  }

  function renderStatus(message) {
    return createElement("div", { className: "issue-companion__status", text: message });
  }
})();

function extractIssueIdFromPage() {
  const pathMatch = window.location.pathname.match(/^\/project\/[^/]+\/issues\/(\d+)/);
  return pathMatch ? pathMatch[1] : null;
}

function isDrupalDashboardPage() {
  return window.location.pathname === "/dashboard";
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
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }

  return null;
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

function createBadge(text, variant = "default") {
  const badge = createElement("span", {
    className: "issue-companion__badge",
    text,
  });
  if (variant === "status") {
    badge.classList.add("issue-companion__badge--status");
    badge.classList.add(`issue-companion__badge--${slugifyStatus(text)}`);
  }
  return badge;
}

function createPill(text) {
  return createElement("span", {
    className: "issue-companion__pill",
    text,
  });
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
      button.textContent = label === "Copy" ? "Copied" : "Opened";
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
    }
    finally {
      window.setTimeout(() => {
        button.disabled = false;
      }, 250);
    }
  });
  return button;
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

function slugifyStatus(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
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
