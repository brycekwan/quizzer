declare const __PARTY_BUILD_ID__: string;

/** Stable in dev and tests. A production build stamps a new id so old logins die. */
export const APP_BUILD_ID = __PARTY_BUILD_ID__;
