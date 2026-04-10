import { codexAdapter } from "./codex.js";
import { claudeAdapter } from "./claude.js";

export const defaultAdapters = [
  codexAdapter,
  claudeAdapter,
];

export function findAdapter(agent, adapters = defaultAdapters) {
  return adapters.find((adapter) => adapter.agent === agent) || null;
}
