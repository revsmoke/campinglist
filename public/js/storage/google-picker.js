// google-picker.js — lazy loader for the Google Picker (used only to choose a Drive folder).
import { CONFIG } from "../config.js";

let pickerPromise = null;

export function loadPicker() {
  if (pickerPromise) return pickerPromise;
  pickerPromise = new Promise((resolve, reject) => {
    const ready = () => {
      if (window.google?.picker) {
        resolve(window.google.picker);
        return;
      }
      window.gapi.load("picker", {
        callback: () => resolve(window.google.picker),
        onerror: () => reject(new Error("The Google Picker could not be loaded.")),
        timeout: 15000,
        ontimeout: () => reject(new Error("Timed out loading the Google Picker.")),
      });
    };
    if (window.gapi?.load) {
      ready();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = ready;
    script.onerror = () =>
      reject(new Error("The Google API loader could not be loaded."));
    document.head.appendChild(script);
  });
  pickerPromise.catch(() => {
    pickerPromise = null;
  });
  return pickerPromise;
}

/**
 * Opens a folder picker. Resolves with { id, name, url } or null when cancelled.
 * Requires an OAuth token that carries the drive.file scope.
 */
export async function pickDriveFolder(accessToken) {
  const picker = await loadPicker();
  return new Promise((resolve, reject) => {
    try {
      const view = new picker.DocsView(picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes("application/vnd.google-apps.folder");
      const builder = new picker.PickerBuilder()
        .setTitle("Choose a folder for your CampList files")
        .setOAuthToken(accessToken)
        .setDeveloperKey(CONFIG.google.mapsApiKey)
        .setAppId(CONFIG.google.appId)
        .addView(view)
        .setCallback((data) => {
          const action = data[picker.Response.ACTION];
          if (action === picker.Action.PICKED) {
            const doc = data[picker.Response.DOCUMENTS]?.[0];
            resolve(
              doc
                ? {
                    id: doc[picker.Document.ID],
                    name: doc[picker.Document.NAME],
                    url: doc[picker.Document.URL],
                  }
                : null
            );
          } else if (action === picker.Action.CANCEL) {
            resolve(null);
          }
        });
      builder.build().setVisible(true);
    } catch (error) {
      reject(error);
    }
  });
}
