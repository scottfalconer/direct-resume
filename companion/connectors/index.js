import { drupalConnector } from "./drupal.js";
import { jiraConnector } from "./jira.js";

export const defaultConnectors = [
  drupalConnector,
  jiraConnector,
];

export function resolveWorkObject(input, connectors = defaultConnectors) {
  for (const connector of connectors) {
    if (!connector.match(input)) {
      continue;
    }

    return {
      connector,
      workObject: connector.canonicalize(input),
    };
  }

  return null;
}
