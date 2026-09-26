import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { firebaseConfig } from "../shared/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const loginScreen = document.getElementById("loginScreen");
const adminApp = document.getElementById("adminApp");
const loginStatus = document.getElementById("loginStatus");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const siteEditList = document.getElementById("siteEditList");
const pendingSection = document.getElementById("pendingSection");
const pendingHeading = document.getElementById("pendingHeading");
const pendingList = document.getElementById("pendingList");
const newTitle = document.getElementById("newTitle");
const newNotes = document.getElementById("newNotes");
const newPhoto = document.getElementById("newPhoto");
const addSiteBtn = document.getElementById("addSiteBtn");
const newSiteStatus = document.getElementById("newSiteStatus");

let adminMap;
let pendingLatLng = null;
let pendingMarker = null;
const markersById = new Map();
let sites = [];

function showLoginError(msg) {
  loginStatus.textContent = msg;
  loginStatus.classList.remove("hidden", "ok");
  loginStatus.classList.add("err");
}

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
  } catch (err) {
    showLoginError(err.message);
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.style.display = "none";
    adminApp.style.display = "flex";
    initMapIfNeeded();
    loadSites();
  } else {
    loginScreen.style.display = "block";
    adminApp.style.display = "none";
  }
});

function initMapIfNeeded() {
  if (adminMap) return;
  adminMap = L.map("adminMap").setView([39.8283, -98.5795], 4);

  const satelliteLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics" }
  ).addTo(adminMap);

  const streetsLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  });

  L.control.layers({ Satellite: satelliteLayer, Streets: streetsLayer }).addTo(adminMap);

  adminMap.on("click", (e) => {
    pendingLatLng = e.latlng;
    if (pendingMarker) adminMap.removeLayer(pendingMarker);
    pendingMarker = L.marker(e.latlng, { opacity: 0.75 }).addTo(adminMap);
    validateNewSiteForm();
  });
}

function validateNewSiteForm() {
  addSiteBtn.disabled = !(pendingLatLng && newTitle.value.trim() && newPhoto.files[0]);
}
newTitle.addEventListener("input", validateNewSiteForm);
newPhoto.addEventListener("change", validateNewSiteForm);

addSiteBtn.addEventListener("click", async () => {
  addSiteBtn.disabled = true;
  newSiteStatus.textContent = "Uploading photo...";
  try {
    const siteRef = doc(collection(db, "sites"));
    const file = newPhoto.files[0];
    const storageRef = ref(storage, `sites/${siteRef.id}/photo.jpg`);
    await uploadBytes(storageRef, file);
    const photoUrl = await getDownloadURL(storageRef);

    await setDoc(siteRef, {
      title: newTitle.value.trim(),
      notes: newNotes.value.trim(),
      lat: pendingLatLng.lat,
      lng: pendingLatLng.lng,
      pixiesetLinks: [],
      photoUrl,
      published: true,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    newTitle.value = "";
    newNotes.value = "";
    newPhoto.value = "";
    pendingLatLng = null;
    if (pendingMarker) {
      adminMap.removeLayer(pendingMarker);
      pendingMarker = null;
    }
    newSiteStatus.textContent = "Added.";
    loadSites();
  } catch (err) {
    console.error(err);
    newSiteStatus.textContent = `Failed: ${err.message}`;
  } finally {
    validateNewSiteForm();
  }
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function renderMarkers() {
  for (const m of markersById.values()) adminMap.removeLayer(m);
  markersById.clear();
  for (const site of sites) {
    const marker = L.marker([site.lat, site.lng]).addTo(adminMap).bindPopup(escapeHtml(site.title));
    markersById.set(site.id, marker);
  }
}

function linkRowHtml(link, idx) {
  return `
    <div class="link-row" data-idx="${idx}">
      <input type="text" class="link-label" placeholder="Label" value="${escapeHtml(link.label || "")}">
      <input type="text" class="link-url" placeholder="https://pixieset.com/..." value="${escapeHtml(link.url || "")}">
      <button class="big-btn secondary remove-link" title="Remove">&times;</button>
    </div>
  `;
}

function cardHtmlFor(site) {
  const links = (site.pixiesetLinks || []).map((l, i) => linkRowHtml(l, i)).join("");
  return `
    <div class="admin-card" data-site-id="${site.id}">
      <img class="thumb" src="${site.photoUrl}" alt="">
      <input type="text" class="site-title" value="${escapeHtml(site.title)}" placeholder="Title">
      <textarea class="site-notes" placeholder="Notes">${escapeHtml(site.notes || "")}</textarea>
      <div class="links-wrap">${links}</div>
      <button class="big-btn secondary add-link" style="margin-top:6px;">+ Add Pixieset link</button>
      <div class="row">
        <label class="publish-toggle">
          <input type="checkbox" class="site-published" ${site.published ? "checked" : ""}>
          Published (visible on client map)
        </label>
      </div>
      <div class="row">
        <button class="big-btn save-site">Save</button>
        <button class="big-btn danger delete-site">Delete</button>
      </div>
      <div class="row">
        <button class="big-btn secondary edit-location-btn">Edit Location</button>
      </div>
      <div class="location-edit-controls hidden">
        <div class="status-line" style="margin-top:6px;">Drag the pin on the map to reposition it, then Save or Undo.</div>
        <div class="row">
          <button class="big-btn save-location-btn">Save Location</button>
          <button class="big-btn secondary undo-location-btn">Undo</button>
        </div>
      </div>
      <div class="save-status" style="font-size:11px;color:var(--muted);margin-top:4px;"></div>
    </div>
  `;
}

function renderSidebar() {
  siteEditList.innerHTML = sites.map(cardHtmlFor).join("");

  siteEditList.querySelectorAll(".admin-card").forEach((card) => {
    const siteId = card.dataset.siteId;

    card.querySelector(".add-link").addEventListener("click", () => {
      const wrap = card.querySelector(".links-wrap");
      const idx = wrap.children.length;
      wrap.insertAdjacentHTML("beforeend", linkRowHtml({ label: "", url: "" }, idx));
      wireLinkRemoveButtons(card);
    });
    wireLinkRemoveButtons(card);

    card.querySelector(".save-site").addEventListener("click", () => saveSite(card, siteId));
    card.querySelector(".delete-site").addEventListener("click", () => deleteSite(card, siteId));

    const editLocationBtn = card.querySelector(".edit-location-btn");
    const locationControls = card.querySelector(".location-edit-controls");
    editLocationBtn.addEventListener("click", () => startEditLocation(siteId, editLocationBtn, locationControls));
    card.querySelector(".save-location-btn").addEventListener("click", () =>
      saveEditLocation(siteId, editLocationBtn, locationControls, card.querySelector(".save-status"))
    );
    card.querySelector(".undo-location-btn").addEventListener("click", () =>
      cancelEditLocation(siteId, editLocationBtn, locationControls)
    );
  });
}

// --- Drag-to-reposition a pin ---
// Only one location edit can be active at a time (keeps drag state simple
// and unambiguous). The marker itself is dragged live; Save writes the
// marker's current position to Firestore, Undo snaps it back.
let editingLocationSiteId = null;
let editingOriginalLatLng = null;

function setOtherEditLocationButtonsDisabled(disabled) {
  siteEditList.querySelectorAll(".edit-location-btn").forEach((b) => {
    b.disabled = disabled;
  });
}

function startEditLocation(siteId, btn, controls) {
  if (editingLocationSiteId) return;
  const marker = markersById.get(siteId);
  if (!marker) return;

  editingLocationSiteId = siteId;
  editingOriginalLatLng = marker.getLatLng();
  marker.dragging.enable();
  adminMap.panTo(marker.getLatLng());

  btn.classList.add("hidden");
  controls.classList.remove("hidden");
  setOtherEditLocationButtonsDisabled(true);
}

function exitEditLocationUi(btn, controls) {
  editingLocationSiteId = null;
  editingOriginalLatLng = null;
  controls.classList.add("hidden");
  btn.classList.remove("hidden");
  setOtherEditLocationButtonsDisabled(false);
}

async function saveEditLocation(siteId, btn, controls, statusEl) {
  const marker = markersById.get(siteId);
  if (!marker) return;
  const latlng = marker.getLatLng();
  statusEl.textContent = "Saving location...";
  try {
    await updateDoc(doc(db, "sites", siteId), {
      lat: latlng.lat,
      lng: latlng.lng,
      updatedAt: serverTimestamp(),
    });
    marker.dragging.disable();
    exitEditLocationUi(btn, controls);
    statusEl.textContent = "Location saved.";
    const site = sites.find((s) => s.id === siteId);
    if (site) {
      site.lat = latlng.lat;
      site.lng = latlng.lng;
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Failed: ${err.message}`;
  }
}

function cancelEditLocation(siteId, btn, controls) {
  const marker = markersById.get(siteId);
  if (marker) {
    if (editingOriginalLatLng) marker.setLatLng(editingOriginalLatLng);
    marker.dragging.disable();
  }
  exitEditLocationUi(btn, controls);
}

function wireLinkRemoveButtons(card) {
  card.querySelectorAll(".remove-link").forEach((btn) => {
    btn.onclick = () => btn.closest(".link-row").remove();
  });
}

async function saveSite(card, siteId) {
  const statusEl = card.querySelector(".save-status");
  statusEl.textContent = "Saving...";
  try {
    const title = card.querySelector(".site-title").value.trim();
    const notes = card.querySelector(".site-notes").value.trim();
    const published = card.querySelector(".site-published").checked;
    const pixiesetLinks = [...card.querySelectorAll(".link-row")]
      .map((row) => ({
        label: row.querySelector(".link-label").value.trim(),
        url: row.querySelector(".link-url").value.trim(),
      }))
      .filter((l) => l.url);

    await updateDoc(doc(db, "sites", siteId), {
      title,
      notes,
      published,
      pixiesetLinks,
      updatedAt: serverTimestamp(),
    });
    statusEl.textContent = "Saved.";
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Failed: ${err.message}`;
  }
}

async function deleteSite(card, siteId) {
  if (!confirm("Delete this location? This cannot be undone.")) return;
  const statusEl = card.querySelector(".save-status");
  statusEl.textContent = "Deleting...";
  try {
    await deleteDoc(doc(db, "sites", siteId));
    try {
      await deleteObject(ref(storage, `sites/${siteId}/photo.jpg`));
    } catch (storageErr) {
      console.warn("Photo cleanup failed (non-fatal):", storageErr);
    }
    loadSites();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Failed: ${err.message}`;
  }
}

function pendingCardHtmlFor(site) {
  const submitter = site.submitterName || site.submitterContact
    ? `Suggested by ${escapeHtml(site.submitterName || "anonymous")}${site.submitterContact ? ` &mdash; ${escapeHtml(site.submitterContact)}` : ""}`
    : "Suggested anonymously";
  return `
    <div class="pending-card" data-site-id="${site.id}">
      <img class="thumb" src="${site.photoUrl}" alt="">
      <div style="font-weight:700;">${escapeHtml(site.title)}</div>
      <div class="submitter">${submitter}</div>
      ${site.notes ? `<div style="font-size:12px;color:#555;margin-bottom:6px;">${escapeHtml(site.notes)}</div>` : ""}
      <div style="font-size:11px;color:var(--muted);">${site.lat.toFixed(5)}, ${site.lng.toFixed(5)}</div>
      <div class="row">
        <button class="big-btn approve-suggestion">Approve &amp; Publish</button>
        <button class="big-btn danger reject-suggestion">Reject</button>
      </div>
      <div class="save-status" style="font-size:11px;color:var(--muted);margin-top:4px;"></div>
    </div>
  `;
}

function renderPending(pending) {
  pendingSection.classList.toggle("hidden", pending.length === 0);
  pendingHeading.textContent = `Pending Suggestions (${pending.length})`;
  pendingList.innerHTML = pending.map(pendingCardHtmlFor).join("");

  pendingList.querySelectorAll(".pending-card").forEach((card) => {
    const siteId = card.dataset.siteId;
    card.querySelector(".approve-suggestion").addEventListener("click", () => approveSuggestion(card, siteId));
    card.querySelector(".reject-suggestion").addEventListener("click", () => rejectSuggestion(card, siteId));
  });
}

async function approveSuggestion(card, siteId) {
  const statusEl = card.querySelector(".save-status");
  statusEl.textContent = "Publishing...";
  try {
    await updateDoc(doc(db, "sites", siteId), {
      published: true,
      updatedAt: serverTimestamp(),
    });
    loadSites();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Failed: ${err.message}`;
  }
}

async function rejectSuggestion(card, siteId) {
  if (!confirm("Reject and delete this suggestion? This cannot be undone.")) return;
  const statusEl = card.querySelector(".save-status");
  statusEl.textContent = "Deleting...";
  try {
    await deleteDoc(doc(db, "sites", siteId));
    try {
      await deleteObject(ref(storage, `sites/${siteId}/photo.jpg`));
    } catch (storageErr) {
      console.warn("Photo cleanup failed (non-fatal):", storageErr);
    }
    loadSites();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Failed: ${err.message}`;
  }
}

async function loadSites() {
  const snap = await getDocs(collection(db, "sites"));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const pending = all.filter((s) => s.submittedByPublic && !s.published);
  sites = all.filter((s) => !(s.submittedByPublic && !s.published));

  renderMarkers();
  renderSidebar();
  renderPending(pending);
}
