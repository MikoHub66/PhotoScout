// Copy this file to firebase-config.js (same folder) and fill in the values
// from Firebase Console -> Project settings -> General -> Your apps -> Web app
// -> SDK setup and configuration -> Config. Not a secret -- gets committed
// as-is, see README's "Session fee payment" section for why.

export const firebaseConfig = {
  apiKey: "PASTE_ME",
  authDomain: "PASTE_ME.firebaseapp.com",
  projectId: "PASTE_ME",
  storageBucket: "PASTE_ME.appspot.com",
  messagingSenderId: "PASTE_ME",
  appId: "PASTE_ME",
};

// Where "Pay & Schedule My Shoot" sends the booking summary. On a phone it
// texts SCHEDULE_REQUEST_PHONE (E.164 format); on desktop, with no SMS app
// to hand off to, it emails SCHEDULE_REQUEST_EMAIL instead. Both are plain
// constants -- safe to change any time, no rebuild needed for the web map.
export const SCHEDULE_REQUEST_PHONE = "+15555555555";
export const SCHEDULE_REQUEST_EMAIL = "you@example.com";

// Your Venmo username (no @), e.g. the "Matt-McGurk-1" in venmo.com/u/Matt-McGurk-1.
// Opens a pre-filled Venmo payment request in a new tab when the client
// clicks the schedule button -- they still have to hit Pay themselves.
export const VENMO_USERNAME = "REPLACE_ME";

// The session fee amount (plain number, no "$") used to pre-fill the Venmo
// payment, and its display text for the button label.
export const SESSION_FEE_AMOUNT = 195;
export const SESSION_FEE_LABEL = "$195";
