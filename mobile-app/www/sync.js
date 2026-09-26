// Offline-first save/sync for captured sites.
//
// Firestore document writes have built-in offline persistence, but a photo
// binary going to Cloud Storage does not -- if there's no connection when a
// photo is captured, the photo + form data are written to a local pending
// queue (via Filesystem + Preferences) and re-uploaded automatically the
// next time the device comes back online.

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import { auth, db, storage } from "./firebase.js";

const { Filesystem, Directory } = window.Capacitor?.Plugins ?? {};
const { Preferences } = window.Capacitor?.Plugins ?? {};
const { Network } = window.Capacitor?.Plugins ?? {};

const QUEUE_KEY = "photoscout_pending_queue";
const PENDING_DIR = "photoscout-pending";

async function readQueue() {
  const { value } = await Preferences.get({ key: QUEUE_KEY });
  return value ? JSON.parse(value) : [];
}

async function writeQueue(queue) {
  await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(queue) });
}

function base64ToBlob(base64, contentType = "image/jpeg") {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
}

async function uploadCreate(entry) {
  const siteRef = doc(collection(db, "sites"));
  const fileBase64 = entry.photoBase64 ?? (await Filesystem.readFile({ path: entry.photoFilePath })).data;
  const blob = base64ToBlob(fileBase64);
  const storageRef = ref(storage, `sites/${siteRef.id}/photo.jpg`);
  await uploadBytes(storageRef, blob);
  const photoUrl = await getDownloadURL(storageRef);

  await setDoc(siteRef, {
    title: entry.title,
    notes: entry.notes,
    lat: entry.lat,
    lng: entry.lng,
    pixiesetLinks: entry.pixiesetLinks || [],
    photoUrl,
    published: entry.published,
    createdBy: auth.currentUser?.uid ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function uploadUpdate(entry) {
  await updateDoc(doc(db, "sites", entry.siteId), {
    title: entry.title,
    notes: entry.notes,
    pixiesetLinks: entry.pixiesetLinks || [],
    published: entry.published,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Save a newly captured site (with a photo). Tries to upload immediately;
 * falls back to the local pending queue on any failure (offline or not).
 */
export async function saveNewSite({ title, notes, pixiesetLinks, published, lat, lng, photoBase64 }) {
  const entry = {
    kind: "create",
    localId: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    title,
    notes,
    pixiesetLinks,
    published,
    lat,
    lng,
    photoBase64,
    queuedAt: new Date().toISOString(),
  };

  try {
    await uploadCreate(entry);
    return { queued: false };
  } catch (err) {
    console.warn("Direct upload failed, queuing for later sync:", err);
    await enqueue(entry);
    return { queued: true };
  }
}

/**
 * Save edits to an existing site (no new photo). Tries immediately; queues
 * on failure.
 */
export async function saveSiteEdit({ siteId, title, notes, pixiesetLinks, published }) {
  const entry = {
    kind: "update",
    localId: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    siteId,
    title,
    notes,
    pixiesetLinks,
    published,
    queuedAt: new Date().toISOString(),
  };

  try {
    await uploadUpdate(entry);
    return { queued: false };
  } catch (err) {
    console.warn("Direct update failed, queuing for later sync:", err);
    await enqueue(entry);
    return { queued: true };
  }
}

async function enqueue(entry) {
  const toStore = { ...entry };

  if (entry.kind === "create" && Filesystem) {
    // Move the base64 payload out of Preferences (small storage quota) and
    // into a real file, since photos can be a few MB.
    const path = `${PENDING_DIR}/${entry.localId}.jpg`;
    await Filesystem.writeFile({
      path,
      data: entry.photoBase64,
      directory: Directory.Data,
      recursive: true,
    });
    delete toStore.photoBase64;
    toStore.photoFilePath = path;
  }

  const queue = await readQueue();
  queue.push(toStore);
  await writeQueue(queue);
}

export async function getPendingCount() {
  if (!Preferences) return 0;
  const queue = await readQueue();
  return queue.length;
}

/**
 * Attempt to upload every queued entry. Entries that still fail (still
 * offline) are left in the queue for the next attempt.
 */
export async function flushQueue() {
  if (!Preferences) return { uploaded: 0, remaining: 0 };
  const queue = await readQueue();
  const remaining = [];
  let uploaded = 0;

  for (const entry of queue) {
    try {
      if (entry.kind === "create") {
        await uploadCreate(entry);
        if (Filesystem && entry.photoFilePath) {
          await Filesystem.deleteFile({ path: entry.photoFilePath, directory: Directory.Data }).catch(() => {});
        }
      } else if (entry.kind === "update") {
        await uploadUpdate(entry);
      }
      uploaded += 1;
    } catch (err) {
      console.warn("Still can't sync queued entry, will retry later:", err);
      remaining.push(entry);
    }
  }

  await writeQueue(remaining);
  return { uploaded, remaining: remaining.length };
}

/**
 * Calls onChange(isOnline) whenever connectivity changes, and immediately
 * with the current status. Also auto-flushes the queue when coming back
 * online. Returns nothing meaningful to unsubscribe with in this MVP since
 * the app only ever has one screen alive at a time.
 */
export function watchConnectivity(onChange) {
  if (!Network) {
    onChange(true);
    return;
  }

  Network.getStatus().then((s) => onChange(s.connected));

  Network.addListener("networkStatusChange", async (status) => {
    onChange(status.connected);
    if (status.connected) {
      await flushQueue();
    }
  });
}
