const PROD_API_BASE = "https://opc-lab-production.up.railway.app";
const LOCAL_API_BASE = "http://localhost:8000";

export function getApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_BASE ?? "").trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "development") return LOCAL_API_BASE;
  return PROD_API_BASE;
}

