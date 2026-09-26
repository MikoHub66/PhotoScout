// Copy this file to firebase-config.js (same folder) and fill in the values
// from Firebase Console -> Project settings -> General -> Your apps -> Web app
// -> SDK setup and configuration -> Config.
//
// firebase-config.js is gitignored on purpose -- these are project-specific
// values, not something to keep committed to source control by default.

export const firebaseConfig = {
  apiKey: "PASTE_ME",
  authDomain: "PASTE_ME.firebaseapp.com",
  projectId: "PASTE_ME",
  storageBucket: "PASTE_ME.appspot.com",
  messagingSenderId: "PASTE_ME",
  appId: "PASTE_ME",
};

// The phone number that "Pay & Schedule My Shoot" texts the shoot request
// to, in E.164 format (+1 followed by the 10-digit US number, no spaces or
// dashes). Safe to change any time -- takes effect immediately, no rebuild
// needed for the web map.
export const SCHEDULE_REQUEST_PHONE = "+15555555555";

// Your Venmo username (no @), e.g. the "Matt-McGurk-1" in venmo.com/u/Matt-McGurk-1.
// Opens a pre-filled Venmo payment request in a new tab when the client
// clicks the schedule button -- they still have to hit Pay themselves.
export const VENMO_USERNAME = "REPLACE_ME";

// The session fee amount (plain number, no "$") used to pre-fill the Venmo
// payment, and its display text for the button label.
export const SESSION_FEE_AMOUNT = 195;
export const SESSION_FEE_LABEL = "$195";
