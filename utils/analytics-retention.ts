// The retention policy of native analytics, stated once. Pageview event detail is kept for 90 days;
// sessions and daily summaries are kept for about two years (740 days). Business outcomes and
// interactions are not expired by the current policy. Summaries outlive pageview detail, so they
// answer session and daily questions, not multidimensional event history.
export const PAGEVIEW_DETAIL_RETENTION_DAYS = 90
export const SESSION_AND_SUMMARY_RETENTION_DAYS = 740
