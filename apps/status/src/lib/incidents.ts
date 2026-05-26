import data from "../../data/incidents.json";
export type Status = "operational" | "degraded" | "read-only" | "outage" | "maintenance" | "resolved";
export type Incident = { id: string; title: string; status: Status; started_at: string; updated_at: string; summary: string; updates: { at: string; status: Status; message: string }[] };
export function getFeed(): { current_status: Status; incidents: Incident[] } { return data as { current_status: Status; incidents: Incident[] }; }
export function getIncident(id: string): Incident | undefined { return getFeed().incidents.find((incident) => incident.id === id); }
