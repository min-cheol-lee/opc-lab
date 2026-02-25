import { SimRequest } from "./types";

export type SavedScenario = {
  id: string;
  name: string;
  createdAt: string;
  request: SimRequest;
};

const SCENARIO_STORAGE_KEY = "opc_lab_saved_scenarios_v1";

export function loadScenarios(): SavedScenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedScenario[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => !!s?.id && !!s?.name && !!s?.request);
  } catch {
    return [];
  }
}

export function saveScenarios(scenarios: SavedScenario[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenarios));
  } catch {
    // Best-effort persistence only.
  }
}

