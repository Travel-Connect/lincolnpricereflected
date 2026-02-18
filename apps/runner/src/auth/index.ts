/**
 * Auth module — login, 2FA, session persistence, facility switch.
 */

export { login, type LoginResult } from "./login.js";
export { waitFor2FA } from "./two-factor.js";
export { switchFacility } from "./facility-switch.js";
export {
  getSessionPath,
  hasSavedSession,
  saveSession,
  clearSession,
} from "./session.js";
