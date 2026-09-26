import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection,
  doc,
  deleteDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { auth, db, storage } from "./firebase.js";
import { captureGeotaggedPhoto, nativePluginsAvailable } from "./capture.js";
import { saveNewSite, saveSiteEdit, getPendingCount, flushQueue, watchConnectivity } from "./sync.js";

const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");
const loginStatus = document.getElementById("loginStatus");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const syncStatus = document.getElementById("syncStatus");
const pendingCountEl = document.getElementById("pendingCount");
const syncNowBtn = document.getElementById("syncNowBtn");
const captureBtn = document.getElementById("captureBtn");

const modalOverlay = document.getElementById("modalOverlay");
const modalStatus = document.getElementById("modalStatus");
const modalPhotoPreview = document.getElementById("modalPhotoPreview");
const modalTitle = document.getElementById("modalTitle");
const modalNotes = document.getElementById("modalNotes");
const modalLinksWrap = document.getElementById("modalLinksWrap");
const modalAddLinkBtn = document.getElementById("modalAddLinkBtn");
const modalPublished = document.getElementById("modalPublished");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const modalDeleteBtn = document.getElementById("modalDeleteBtn");
const modalSaveBtn = document.getElementById("modalSaveBtn");

let map;
const markersById = new Map();
let sites = [];
let editingSiteId = null; // null => creating a new site
let pendingCapture = null; // { photoBase64, lat, lng } while creating

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---- Auth ----

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
  } catch (err) {
    loginStatus.textContent = err.message;
    loginStatus.classList.remove("hidden");
    loginStatus.classList.add("err");
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.style.display = "none";
    appScreen.style.display = "flex";
    initMapIfNeeded();
    loadSites();
    refreshPendingCount();
  } else {
    loginScreen.style.display = "block";
    appScreen.style.display = "none";
  }
});

// ---- Map ----

function initMapIfNeeded() {
  if (map) return;
  map = L.map("appMap").setView([39.8283, -98.5795], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  if (nativePluginsAvailable()) {
    navigator.geolocation?.getCurrentPosition?.(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 12),
      () => {}
    );
  }
}

function markerIconFor(site) {
  return L.divIcon({
    className: "",
    html: `<div class="marker-thumb published-${!!site.published}" style="background-image:url('${site.photoUrl}')"></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function renderMarkers() {
  for (const m of markersById.values()) map.removeLayer(m);
  markersById.clear();

  for (const site of sites) {
    const marker = L.marker([site.lat, site.lng], { icon: markerIconFor(site) }).addTo(map);
    marker.on("click", () => openEditModal(site));
    markersById.set(site.id, marker);
  }
}

async function loadSites() {
  const snap = await getDocs(collection(db, "sites"));
  sites = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderMarkers();
}

// ---- Sync status ----

async function refreshPendingCount() {
  const count = await getPendingCount();
  pendingCountEl.textContent = count > 0 ? `${count} pending upload${count === 1 ? "" : "s"}` : "";
}

watchConnectivity((isOnline) => {
  syncStatus.textContent = isOnline ? "Online" : "Offline — captures will queue";
  syncStatus.style.color = isOnline ? "var(--ok)" : "var(--warn)";
  if (isOnline) {
    refreshPendingCount();
    loadSites();
  }
});

syncNowBtn.addEventListener("click", async () => {
  syncNowBtn.disabled = true;
  await flushQueue();
  await refreshPendingCount();
  await loadSites();
  syncNowBtn.disabled = false;
});

// ---- Capture / edit modal ----

function linkRowHtml(link) {
  return `
    <div class="link-row">
      <input type="text" class="link-label" placeholder="Label" value="${escapeHtml(link.label || "")}">
      <input type="text" class="link-url" placeholder="https://pixieset.com/..." value="${escapeHtml(link.url || "")}">
      <button class="big-btn secondary remove-link" type="button">&times;</button>
    </div>
  `;
}

function wireLinkRemoveButtons() {
  modalLinksWrap.querySelectorAll(".remove-link").forEach((btn) => {
    btn.onclick = () => btn.closest(".link-row").remove();
  });
}

modalAddLinkBtn.addEventListener("click", () => {
  modalLinksWrap.insertAdjacentHTML("beforeend", linkRowHtml({ label: "", url: "" }));
  wireLinkRemoveButtons();
});

function clearModalStatus() {
  modalStatus.classList.add("hidden");
  modalStatus.classList.remove("ok", "err");
}

function openModal() {
  modalOverlay.style.display = "flex";
}

function closeModal() {
  modalOverlay.style.display = "none";
  editingSiteId = null;
  pendingCapture = null;
}

function openCreateModal(capture) {
  pendingCapture = capture;
  editingSiteId = null;
  clearModalStatus();
  modalTitle.value = "";
  modalNotes.value = "";
  modalLinksWrap.innerHTML = "";
  modalPublished.checked = true;
  modalPhotoPreview.src = `data:image/jpeg;base64,${capture.photoBase64}`;
  modalPhotoPreview.classList.remove("hidden");
  modalDeleteBtn.classList.add("hidden");
  openModal();
}

function openEditModal(site) {
  pendingCapture = null;
  editingSiteId = site.id;
  clearModalStatus();
  modalTitle.value = site.title || "";
  modalNotes.value = site.notes || "";
  modalLinksWrap.innerHTML = (site.pixiesetLinks || []).map(linkRowHtml).join("");
  wireLinkRemoveButtons();
  modalPublished.checked = !!site.published;
  modalPhotoPreview.src = site.photoUrl;
  modalPhotoPreview.classList.remove("hidden");
  modalDeleteBtn.classList.remove("hidden");
  openModal();
}

captureBtn.addEventListener("click", async () => {
  captureBtn.disabled = true;
  try {
    const capture = await captureGeotaggedPhoto();
    openCreateModal(capture);
  } catch (err) {
    alert(err.message);
  } finally {
    captureBtn.disabled = false;
  }
});

modalCancelBtn.addEventListener("click", closeModal);

modalSaveBtn.addEventListener("click", async () => {
  modalSaveBtn.disabled = true;
  clearModalStatus();
  modalStatus.classList.remove("hidden");
  modalStatus.textContent = "Saving...";

  const title = modalTitle.value.trim();
  const notes = modalNotes.value.trim();
  const published = modalPublished.checked;
  const pixiesetLinks = [...modalLinksWrap.querySelectorAll(".link-row")]
    .map((row) => ({
      label: row.querySelector(".link-label").value.trim(),
      url: row.querySelector(".link-url").value.trim(),
    }))
    .filter((l) => l.url);

  try {
    let result;
    if (editingSiteId) {
      result = await saveSiteEdit({ siteId: editingSiteId, title, notes, pixiesetLinks, published });
    } else {
      result = await saveNewSite({ ...pendingCapture, title, notes, pixiesetLinks, published });
    }

    modalStatus.classList.add("ok");
    modalStatus.textContent = result.queued
      ? "Saved offline — will upload automatically once you're back online."
      : "Saved.";

    await refreshPendingCount();
    await loadSites();
    setTimeout(closeModal, 900);
  } catch (err) {
    modalStatus.classList.add("err");
    modalStatus.textContent = `Failed: ${err.message}`;
  } finally {
    modalSaveBtn.disabled = false;
  }
});

modalDeleteBtn.addEventListener("click", async () => {
  if (!editingSiteId) return;
  if (!confirm("Delete this location? This cannot be undone.")) return;

  modalDeleteBtn.disabled = true;
  try {
    await deleteDoc(doc(db, "sites", editingSiteId));
    await deleteObject(ref(storage, `sites/${editingSiteId}/photo.jpg`)).catch(() => {});
    await loadSites();
    closeModal();
  } catch (err) {
    modalStatus.classList.remove("hidden", "ok");
    modalStatus.classList.add("err");
    modalStatus.textContent = `Failed to delete (are you online?): ${err.message}`;
  } finally {
    modalDeleteBtn.disabled = false;
  }
});
