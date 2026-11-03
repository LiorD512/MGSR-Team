// Feature flags used to disable UI/features without deleting implementation.
export const WEB_TASKS_ENABLED = false;

// Men platform only: disables roster-analysis UI blocks (matching requests, teammates, etc.).
export const MEN_ROSTER_ANALYSIS_ENABLED = false;

// Transfer Radar (men web only): navigation + pages. The pages show a clear 'not connected' state until TURSO_URL/TURSO_TOKEN are set on the server.
export const TRANSFER_RADAR_ENABLED = true;
// The Radar Sources admin screen is hidden for now (route redirects to /transfer-radar, no menu entry). The code and API stay in place.
export const TRANSFER_RADAR_SOURCES_VISIBLE = false;

/** Level & Focus tiering in the men dashboard's Roster intelligence module (roster only, v1). */
export const LEVEL_FOCUS_ENABLED = true;
