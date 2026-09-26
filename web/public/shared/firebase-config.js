// Real values for the photoscout-c54e7 Firebase project. This file is
// committed as-is (not a secret -- see README's "Session fee payment" and
// project-setup sections for why).

export const firebaseConfig = {
  apiKey: "AIzaSyDwLmH0ff-nW4hD5S6nWam9ULUea6svq2c",
  authDomain: "photoscout-c54e7.firebaseapp.com",
  projectId: "photoscout-c54e7",
  storageBucket: "photoscout-c54e7.firebasestorage.app",
  messagingSenderId: "897168049468",
  appId: "1:897168049468:web:40470a15b142c214f40a39",
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
