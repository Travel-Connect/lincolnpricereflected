/** Lincoln base URL — used by all steps */
export const LINCOLN_BASE = "https://www.tl-lincoln.net/accomodation/";

/** Top page URL for session check and facility display */
export const TOP_PAGE_URL = LINCOLN_BASE + "Ascsc1010InitAction.do";

/** Default timeouts (ms) */
export const TIMEOUT = {
  navigation: 30000,
  networkIdle: 15000,
  dialog: 60000,
  selector: 10000,
  download: 60000,
} as const;

/** Max facility switch retries */
export const MAX_SWITCH_ATTEMPTS = 3;
