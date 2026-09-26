import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import {
  firebaseConfig,
  SCHEDULE_REQUEST_PHONE,
  VENMO_USERNAME,
  SESSION_FEE_AMOUNT,
  SESSION_FEE_LABEL,
} from "./shared/firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const loadStatus = document.getElementById("loadStatus");
const siteListEl = document.getElementById("siteList");
const selectionCountEl = document.getElementById("selectionCount");
const scheduleBtn = document.getElementById("scheduleBtn");
const clientNameInput = document.getElementById("clientName");
const clientPhoneInput = document.getElementById("clientPhone");
const dateInput = document.getElementById("shootDate");
const timeInput = document.getElementById("shootTime");

// Don't let clients pick a shoot day before today.
{
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  dateInput.min = `${y}-${m}-${d}`;
}
const sunsetNoteEl = document.getElementById("sunsetNote");
const timeWarningEl = document.getElementById("timeWarning");

const suggestLocationBtn = document.getElementById("suggestLocationBtn");
const suggestHintEl = document.getElementById("suggestHint");
const suggestModalOverlay = document.getElementById("suggestModalOverlay");
const suggestStatusEl = document.getElementById("suggestStatus");
const suggestCoordsEl = document.getElementById("suggestCoords");
const suggestTitleInput = document.getElementById("suggestTitle");
const suggestNotesInput = document.getElementById("suggestNotes");
const suggestNameInput = document.getElementById("suggestName");
const suggestContactInput = document.getElementById("suggestContact");
const suggestPhotoInput = document.getElementById("suggestPhoto");
const suggestCancelBtn = document.getElementById("suggestCancelBtn");
const suggestSubmitBtn = document.getElementById("suggestSubmitBtn");

const map = L.map("map").setView([39.8283, -98.5795], 4); // default: continental US

const satelliteLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics" }
).addTo(map);

const streetsLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
});

L.control.layers({ Satellite: satelliteLayer, Streets: streetsLayer }).addTo(map);

const selected = new Set(); // siteId set
const markersById = new Map();
let sites = [];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function markerIconFor(site) {
  return L.divIcon({
    className: "",
    html: `<div class="marker-thumb" style="background-image:url('${site.photoUrl}')"></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -21],
  });
}

function popupHtmlFor(site) {
  const links = (site.pixiesetLinks || [])
    .map(
      (l) =>
        `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label || l.url)}</a>`
    )
    .join("");
  return `
    <div>
      <img class="popup-photo" src="${site.photoUrl}" alt="${escapeHtml(site.title)}">
      <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(site.title)}</div>
      ${site.notes ? `<div style="font-size:12px;color:#555;margin-bottom:6px;">${escapeHtml(site.notes)}</div>` : ""}
      ${links ? `<div class="popup-links">${links}</div>` : ""}
    </div>
  `;
}

function updateSelectionUi() {
  selectionCountEl.textContent = `${selected.size} location${selected.size === 1 ? "" : "s"} selected`;
  const ready =
    selected.size > 0 &&
    clientNameInput.value.trim() &&
    clientPhoneInput.value.trim() &&
    dateInput.value;
  scheduleBtn.disabled = !ready;
}

let timeManuallyEdited = false;
timeInput.addEventListener("input", () => {
  timeManuallyEdited = true;
});

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatClock(dt) {
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Returns { sunset } for the average position of the currently-selected
// locations on the chosen day, or null if there's not enough info yet.
// Assumes the viewer's device timezone matches the shoot location's
// timezone, which holds for local clients.
function getSunsetForSelection() {
  const chosen = sites.filter((s) => selected.has(s.id));
  const dateVal = dateInput.value;

  if (!dateVal || chosen.length === 0 || typeof SunCalc === "undefined") {
    return null;
  }

  const avgLat = chosen.reduce((sum, s) => sum + s.lat, 0) / chosen.length;
  const avgLng = chosen.reduce((sum, s) => sum + s.lng, 0) / chosen.length;
  const [y, m, d] = dateVal.split("-").map(Number);
  const noonLocal = new Date(y, m - 1, d, 12);
  const { sunset } = SunCalc.getTimes(noonLocal, avgLat, avgLng);
  return { sunset, chosenCount: chosen.length, y, m, d };
}

// Suggests a shoot time of 1 hour before sunset.
function updateSuggestedTime() {
  const info = getSunsetForSelection();
  if (!info) {
    sunsetNoteEl.textContent = "";
    return;
  }
  const { sunset, chosenCount } = info;
  const suggested = new Date(sunset.getTime() - 60 * 60 * 1000);

  if (!timeManuallyEdited) {
    timeInput.value = `${pad2(suggested.getHours())}:${pad2(suggested.getMinutes())}`;
  }

  sunsetNoteEl.textContent = `Sunset at the selected location${chosenCount > 1 ? "s (avg.)" : ""} on this day is ~${formatClock(sunset)} — suggested time is 1 hr prior: ${formatClock(suggested)}. Feel free to adjust.`;
}

// Warns if the currently-picked time is cutting it close to (or is after)
// sunset at the selected location(s).
function updateTimeWarning() {
  const info = getSunsetForSelection();
  timeWarningEl.classList.add("hidden");
  timeWarningEl.classList.remove("warn", "err");

  if (!info || !timeInput.value) return;

  const { sunset, y, m, d } = info;
  const [hh, mm] = timeInput.value.split(":").map(Number);
  const chosenDt = new Date(y, m - 1, d, hh, mm);
  const oneHourMs = 60 * 60 * 1000;

  if (chosenDt.getTime() >= sunset.getTime()) {
    timeWarningEl.textContent = "Warning: this shoot is after dark! Still doable, but sites are restricted and lighting is required.";
    timeWarningEl.classList.add("err");
    timeWarningEl.classList.remove("hidden");
  } else if (chosenDt.getTime() > sunset.getTime() - oneHourMs) {
    timeWarningEl.textContent = "Warning: less than an hour to complete this shoot before dark.";
    timeWarningEl.classList.add("warn");
    timeWarningEl.classList.remove("hidden");
  }
}

function updateSunsetInfo() {
  updateSuggestedTime();
  updateTimeWarning();
}

dateInput.addEventListener("change", updateSunsetInfo);
timeInput.addEventListener("input", updateTimeWarning);
clientNameInput.addEventListener("input", updateSelectionUi);
clientPhoneInput.addEventListener("input", updateSelectionUi);
dateInput.addEventListener("input", updateSelectionUi);

function toggleSite(siteId, checked) {
  if (checked) selected.add(siteId);
  else selected.delete(siteId);

  const card = siteListEl.querySelector(`[data-site-id="${siteId}"]`);
  if (card) card.querySelector("input[type=checkbox]").checked = checked;

  updateSelectionUi();
  updateSunsetInfo();
}

function renderSidebar() {
  siteListEl.innerHTML = "";
  for (const site of sites) {
    const card = document.createElement("div");
    card.className = "site-card";
    card.dataset.siteId = site.id;
    card.innerHTML = `
      <img class="thumb" src="${site.photoUrl}" alt="">
      <div class="body">
        <div class="title">${escapeHtml(site.title)}</div>
        <div class="notes">${escapeHtml(site.notes || "")}</div>
        <label class="pick">
          <input type="checkbox">
          I want a photo here
        </label>
      </div>
    `;
    const checkbox = card.querySelector("input[type=checkbox]");
    checkbox.addEventListener("change", (e) => toggleSite(site.id, e.target.checked));
    card.querySelector(".thumb").addEventListener("click", () => {
      map.setView([site.lat, site.lng], 15);
      markersById.get(site.id)?.openPopup();
    });
    siteListEl.appendChild(card);
  }
}

function renderMarkers() {
  for (const site of sites) {
    const marker = L.marker([site.lat, site.lng], { icon: markerIconFor(site) })
      .addTo(map)
      .bindPopup(popupHtmlFor(site));
    markersById.set(site.id, marker);
  }
}

function buildSmsLink() {
  const name = clientNameInput.value.trim();
  const phone = clientPhoneInput.value.trim();
  const date = dateInput.value || "(date not specified)";
  const time = timeInput.value || "(time not specified)";
  const chosen = sites.filter((s) => selected.has(s.id));

  const lines = chosen.map((s, i) => {
    const mapsUrl = `https://www.google.com/maps?q=${s.lat},${s.lng}`;
    return `${i + 1}. ${s.title} - ${mapsUrl}`;
  });

  const body = [
    `New shoot booked (session fee paid):`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Date: ${date}`,
    `Time: ${time} (suggested 1 hr before sunset; may be adjusted)`,
    "Locations:",
    ...lines,
  ].join("\n");

  return `sms:${SCHEDULE_REQUEST_PHONE}?body=${encodeURIComponent(body)}`;
}

function buildVenmoLink() {
  const name = clientNameInput.value.trim();
  const chosen = sites.filter((s) => selected.has(s.id));
  const note = `PhotoScout session fee - ${name || "client"} - ${chosen.length} location${chosen.length === 1 ? "" : "s"} - ${dateInput.value}`;
  const params = new URLSearchParams({
    txn: "pay",
    amount: String(SESSION_FEE_AMOUNT),
    note,
    audience: "private",
  });
  return `https://venmo.com/u/${encodeURIComponent(VENMO_USERNAME)}?${params.toString()}`;
}

scheduleBtn.textContent = `Pay ${SESSION_FEE_LABEL} Session Fee and Schedule My Shoot`;

scheduleBtn.addEventListener("click", () => {
  window.open(buildVenmoLink(), "_blank", "noopener");
  window.location.href = buildSmsLink();
});

// --- Public "suggest a location" flow ---
// Anyone can drop a pin and submit a suggestion with a photo; it's saved as
// published:false and only shows up on the admin page for review. It never
// appears on this public map unless/until an admin approves it.

let pinDropMode = false;
let suggestLatLng = null;
let suggestMarker = null;

suggestLocationBtn.addEventListener("click", () => {
  pinDropMode = true;
  suggestHintEl.textContent = "Click anywhere on the map to drop your pin.";
  suggestLocationBtn.disabled = true;
});

map.on("click", (e) => {
  if (!pinDropMode) return;
  pinDropMode = false;
  suggestLocationBtn.disabled = false;
  suggestHintEl.textContent = "";
  suggestLatLng = e.latlng;

  if (suggestMarker) map.removeLayer(suggestMarker);
  suggestMarker = L.marker(e.latlng, { opacity: 0.8 }).addTo(map);

  openSuggestModal();
});

function openSuggestModal() {
  suggestStatusEl.classList.add("hidden");
  suggestStatusEl.classList.remove("ok", "err");
  suggestCoordsEl.textContent = `${suggestLatLng.lat.toFixed(5)}, ${suggestLatLng.lng.toFixed(5)}`;
  suggestTitleInput.value = "";
  suggestNotesInput.value = "";
  suggestNameInput.value = "";
  suggestContactInput.value = "";
  suggestPhotoInput.value = "";
  validateSuggestForm();
  suggestModalOverlay.classList.remove("hidden");
}

function closeSuggestModal() {
  suggestModalOverlay.classList.add("hidden");
  if (suggestMarker) {
    map.removeLayer(suggestMarker);
    suggestMarker = null;
  }
  suggestLatLng = null;
}

function validateSuggestForm() {
  suggestSubmitBtn.disabled = !(suggestTitleInput.value.trim() && suggestPhotoInput.files[0]);
}
suggestTitleInput.addEventListener("input", validateSuggestForm);
suggestPhotoInput.addEventListener("change", validateSuggestForm);

suggestCancelBtn.addEventListener("click", closeSuggestModal);

suggestSubmitBtn.addEventListener("click", async () => {
  suggestSubmitBtn.disabled = true;
  suggestStatusEl.classList.remove("hidden", "ok", "err");
  suggestStatusEl.textContent = "Submitting...";

  try {
    const siteRef = doc(collection(db, "sites"));
    const file = suggestPhotoInput.files[0];
    const storageRef = ref(storage, `sites/${siteRef.id}/photo.jpg`);
    await uploadBytes(storageRef, file);
    const photoUrl = await getDownloadURL(storageRef);

    await setDoc(siteRef, {
      title: suggestTitleInput.value.trim(),
      notes: suggestNotesInput.value.trim(),
      lat: suggestLatLng.lat,
      lng: suggestLatLng.lng,
      pixiesetLinks: [],
      photoUrl,
      published: false,
      submittedByPublic: true,
      submitterName: suggestNameInput.value.trim(),
      submitterContact: suggestContactInput.value.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    suggestStatusEl.textContent = "Thanks! Your suggestion has been submitted for review.";
    suggestStatusEl.classList.add("ok");
    setTimeout(closeSuggestModal, 1400);
  } catch (err) {
    console.error(err);
    suggestStatusEl.textContent = `Failed to submit: ${err.message}`;
    suggestStatusEl.classList.add("err");
    suggestSubmitBtn.disabled = false;
  }
});

async function loadSites() {
  try {
    const q = query(collection(db, "sites"), where("published", "==", true));
    const snap = await getDocs(q);
    sites = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (sites.length === 0) {
      loadStatus.textContent = "No locations published yet.";
      return;
    }

    renderMarkers();
    renderSidebar();
    map.fitBounds(sites.map((s) => [s.lat, s.lng]), { padding: [40, 40], maxZoom: 14 });
    loadStatus.textContent = `${sites.length} location${sites.length === 1 ? "" : "s"} loaded`;
  } catch (err) {
    console.error(err);
    loadStatus.textContent = "Failed to load locations. Check your connection and try again.";
  }
}

updateSelectionUi();
loadSites();
