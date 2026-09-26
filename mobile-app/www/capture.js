// Thin wrapper around the native Camera/Geolocation plugins. These are only
// available once the app is actually running inside the Capacitor Android
// shell -- window.Capacitor.Plugins is undefined in a plain browser preview.

const { Camera, Geolocation } = window.Capacitor?.Plugins ?? {};

export function nativePluginsAvailable() {
  return Boolean(Camera && Geolocation);
}

/**
 * Opens the camera, then reads the device's current GPS position.
 * Returns { photoBase64, lat, lng } or throws if the user cancels or a
 * permission is denied.
 */
export async function captureGeotaggedPhoto() {
  if (!nativePluginsAvailable()) {
    throw new Error("Camera/Geolocation are only available in the installed Android app, not this preview.");
  }

  const photo = await Camera.getPhoto({
    resultType: "base64",
    quality: 80,
    source: "CAMERA",
    saveToGallery: false,
  });

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 15000,
  });

  return {
    photoBase64: photo.base64String,
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
}
