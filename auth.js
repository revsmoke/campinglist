import { data, meta, loadAllState } from "./state.js";
import { renderList, renderMeta, showToast, calculateAndDisplayWeights, calculateAndDisplayCosts, updatePermitInfo, updatePermitRequiredItems } from "./ui.js";

// --- Configuration ---
// IMPORTANT: Replace with your actual Client ID and API Key
// You should ideally load these from a secure config file or environment variables
const CLIENT_ID = "YOUR_GOOGLE_CLOUD_OAUTH_CLIENT_ID"; // Replace!
const API_KEY = "YOUR_GOOGLE_CLOUD_API_KEY"; // Replace!
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file'; // Scope for creating/accessing files created by this app

let tokenClient;
let gapiInited = false;
let gisInited = false;
let googleApiLoaded = false;
let googleUser = null; // To store user profile info

const googleSignInBtn = document.getElementById('btnGoogleSignIn');
const googleSignOutBtn = document.getElementById('btnGoogleSignOut');
const exportGoogleDriveBtn = document.getElementById('btnExportGoogleDrive');
const importGoogleDriveBtn = document.getElementById('btnImportGoogleDrive');

// --- Initialization ---

/**
 * Initializes the Google API client library.
 */
function initializeGapiClient() {
    gapi.load('client:picker', async () => {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: DISCOVERY_DOCS,
        });
        gapiInited = true;
        maybeEnableButtons();
        console.log("GAPI client initialized.");
    });
}

/**
 * Initializes the Google Identity Services client.
 */
function initializeGisClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: handleTokenResponse, // Function to handle the token response
        error_callback: handleGisError,
    });
    gisInited = true;
    maybeEnableButtons();
    console.log("GIS client initialized.");
}

/**
 * Handles errors from GIS initialization or token request.
 * @param {object} err The error object.
 */
function handleGisError(err) {
    console.error("GIS Error:", err);
    showToast(`Google Sign-In Error: ${err.type || 'Unknown error'}. Please try again.`);
    updateUiWithSignInStatus(false); // Ensure UI reflects sign-out state on error
}


/**
 * Callback after the GAPI library script has loaded.
 */
window.gapiLoaded = () => {
    console.log("GAPI script loaded.");
    googleApiLoaded = true; // Mark GAPI as loaded
    initializeGapiClient();
};

/**
 * Callback after the GIS library script has loaded.
 */
window.gisLoaded = () => {
    console.log("GIS script loaded.");
    initializeGisClient();
};

// --- Authentication ---

/**
 * Handles the response from the Google Sign-In token client.
 * @param {object} tokenResponse The token response object.
 */
async function handleTokenResponse(tokenResponse) {
    if (tokenResponse && tokenResponse.access_token) {
        console.log("Access Token received:", tokenResponse);
        gapi.client.setToken(tokenResponse);
        showToast("Signed in to Google successfully.");
        await fetchUserProfile(); // Fetch user profile after successful sign-in
        updateUiWithSignInStatus(true);
        maybeEnableButtons(); // Enable Drive buttons now
    } else {
        console.error("Invalid token response:", tokenResponse);
        showToast("Failed to get access token from Google.");
        updateUiWithSignInStatus(false);
    }
}

/**
 * Fetches the user's profile information using the People API.
 */
async function fetchUserProfile() {
    try {
        // Load the People API if not already loaded
        await gapi.client.load('https://people.googleapis.com/$discovery/rest?version=v1');

        // Request profile information
        const response = await gapi.client.people.people.get({
            resourceName: 'people/me',
            personFields: 'names,emailAddresses,photos',
        });

        console.log("User Profile Response:", response);
        googleUser = response.result; // Store user profile

        // Update UI with user info (optional)
        const userName = googleUser?.names?.[0]?.displayName || 'User';
        const userPhoto = googleUser?.photos?.[0]?.url;
        // Example: Update a UI element with the user's name
        // const userInfoElement = document.getElementById('userInfo');
        // if (userInfoElement) {
        //    userInfoElement.textContent = `Welcome, ${userName}!`;
        //    if(userPhoto) {
        //        const img = document.createElement('img');
        //        img.src = userPhoto;
        //        img.alt = "Profile photo";
        //        img.style.width = '30px';
        //        img.style.borderRadius = '50%';
        //        userInfoElement.prepend(img);
        //    }
        // }
        googleSignInBtn.textContent = `Hi, ${userName.split(' ')[0]}`; // Update sign-in button text

    } catch (err) {
        console.error('Error fetching user profile:', err);
        // Handle error appropriately, maybe show a message to the user
    }
}


/**
 * Initiates the Google Sign-In flow.
 */
function handleAuthClick() {
    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        // Skip display of account chooser and consent dialog for an existing session.
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

/**
 * Signs the user out.
 */
function handleSignOutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            googleUser = null; // Clear user profile
            updateUiWithSignInStatus(false);
            showToast("Signed out from Google.");
            console.log('Access token revoked.');
        });
    } else {
        updateUiWithSignInStatus(false); // Ensure UI is updated even if no token existed
    }
}

/**
 * Updates the visibility of buttons based on sign-in status.
 * @param {boolean} isSignedIn Whether the user is currently signed in.
 */
function updateUiWithSignInStatus(isSignedIn) {
    if (isSignedIn) {
        googleSignInBtn.style.display = 'none'; // Hide Sign In button
        googleSignOutBtn.style.display = 'inline-block';
        exportGoogleDriveBtn.style.display = 'inline-block';
        importGoogleDriveBtn.style.display = 'inline-block';
        if (googleUser) {
             const userName = googleUser?.names?.[0]?.displayName || 'User';
             googleSignOutBtn.textContent = `Sign Out (${userName.split(' ')[0]})`;
        } else {
             googleSignOutBtn.textContent = 'Sign Out';
        }

    } else {
        googleSignInBtn.style.display = 'inline-block';
        googleSignInBtn.textContent = 'Sign in with Google'; // Reset button text
        googleSignOutBtn.style.display = 'none';
        exportGoogleDriveBtn.style.display = 'none';
        importGoogleDriveBtn.style.display = 'none';
    }
}

/**
 * Enables buttons if both GAPI and GIS are initialized.
 */
function maybeEnableButtons() {
    // Check if user is already signed in (e.g., page refresh)
    const token = gapi.client.getToken();
    const isSignedIn = token !== null;

    if (gapiInited && gisInited) {
        googleSignInBtn.disabled = false;
        googleSignOutBtn.disabled = false; // Enable sign out regardless of initial state
        updateUiWithSignInStatus(isSignedIn); // Update UI based on current token status
        if (isSignedIn) {
            exportGoogleDriveBtn.disabled = false;
            importGoogleDriveBtn.disabled = false;
            if (!googleUser) fetchUserProfile(); // Fetch profile if signed in but no user data yet
        } else {
            exportGoogleDriveBtn.disabled = true;
            importGoogleDriveBtn.disabled = true;
        }
    } else {
        // Keep buttons disabled until everything is ready
        googleSignInBtn.disabled = true;
        googleSignOutBtn.disabled = true;
        exportGoogleDriveBtn.disabled = true;
        importGoogleDriveBtn.disabled = true;
    }
}


// --- Google Drive Interaction ---

const DRIVE_FILENAME = 'campinglist_data.json';
const DRIVE_MIMETYPE = 'application/json';

/**
 * Finds the specific file in Google Drive.
 * Returns the file ID if found, otherwise null.
 */
async function findFileInDrive() {
    try {
        const response = await gapi.client.drive.files.list({
            q: `name='${DRIVE_FILENAME}' and mimeType='${DRIVE_MIMETYPE}' and trashed=false and 'appDataFolder' in parents`, // Search in appDataFolder first
            fields: 'files(id, name)',
            spaces: 'appDataFolder', // Prioritize appDataFolder
        });

        if (response.result.files && response.result.files.length > 0) {
            console.log("File found in appDataFolder:", response.result.files[0].id);
            return response.result.files[0].id;
        }

        // If not in appDataFolder, search in regular Drive space
        const responseDrive = await gapi.client.drive.files.list({
             q: `name='${DRIVE_FILENAME}' and mimeType='${DRIVE_MIMETYPE}' and trashed=false`, // Search regular drive
             fields: 'files(id, name)',
             spaces: 'drive'
        });

        if (responseDrive.result.files && responseDrive.result.files.length > 0) {
             console.log("File found in Drive:", responseDrive.result.files[0].id);
             return responseDrive.result.files[0].id; // Return the first match found
        }


        console.log("File not found in Drive.");
        return null;
    } catch (err) {
        console.error("Error searching for file in Drive:", err);
        showToast(`Error searching Drive: ${err.result?.error?.message || err.message || 'Unknown error'}`);
        return null;
    }
}

/**
 * Exports the current list and meta data to Google Drive.
 * Overwrites the existing file if found, otherwise creates a new one.
 */
async function exportToGoogleDrive() {
    if (!gapi.client.getToken()) {
        showToast("Please sign in to Google first.");
        handleAuthClick(); // Prompt sign-in
        return;
    }

    showToast("Exporting to Google Drive...");
    exportGoogleDriveBtn.disabled = true; // Disable button during operation

    const listData = data; // Get current data from state.js
    const metaData = meta; // Get current meta from state.js
    const combinedData = JSON.stringify({ meta: metaData, data: listData }, null, 2);
    const blob = new Blob([combinedData], { type: DRIVE_MIMETYPE });

    const fileMetadata = {
        name: DRIVE_FILENAME,
        mimeType: DRIVE_MIMETYPE,
        // Store in appDataFolder for hidden storage, or remove 'parents' for user-visible file
         parents: ['appDataFolder'] // Recommended for app-specific data
    };

    const fileId = await findFileInDrive();
    const media = {
        mimeType: DRIVE_MIMETYPE,
        body: blob,
    };

    try {
        let request;
        if (fileId) {
            // File exists, update it
            console.log(`Updating existing file (ID: ${fileId}) in Drive...`);
            request = gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: blob
            });
            // Note: PATCH metadata separately if needed: gapi.client.drive.files.update({ fileId: fileId, resource: { name: DRIVE_FILENAME } });

        } else {
            // File doesn't exist, create it
            console.log("Creating new file in Drive...");
             // Use multipart upload for creating with metadata and content simultaneously
             const form = new FormData();
             form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
             form.append('file', blob);

             request = gapi.client.request({
                 path: '/upload/drive/v3/files',
                 method: 'POST',
                 params: { uploadType: 'multipart' },
                 headers: { 'Content-Type': 'multipart/related; boundary=foo_bar_baz' }, // Boundary will be set by the library
                 body: form // Let the library handle FormData construction
             });
        }

        const response = await request;
        console.log("Drive API Response (Export):", response);
        showToast("Successfully exported data to Google Drive.");

    } catch (err) {
        console.error("Error exporting to Google Drive:", err);
        const errorDetails = err.result?.error;
        if (errorDetails?.message.includes("insufficient permissions")) {
             showToast("Error: Insufficient permissions. Please ensure the app has Drive access.");
        } else {
             showToast(`Error exporting to Drive: ${errorDetails?.message || err.message || 'Unknown error'}`);
        }
    } finally {
        exportGoogleDriveBtn.disabled = false; // Re-enable button
    }
}


/**
 * Imports data from Google Drive using the Google Picker API.
 */
function importFromGoogleDrive() {
     if (!gapi.client.getToken()) {
         showToast("Please sign in to Google first.");
         handleAuthClick(); // Prompt sign-in
         return;
     }

     showToast("Opening Google Drive file picker...");
     importGoogleDriveBtn.disabled = true; // Disable button

     const view = new google.picker.View(google.picker.ViewId.DOCS);
     view.setMimeTypes(DRIVE_MIMETYPE); // Show only JSON files
     // Optional: Set a starting folder, e.g., appDataFolder
     // view.setParent('appDataFolder');

     const picker = new google.picker.PickerBuilder()
         .enableFeature(google.picker.Feature.NAV_HIDDEN) // Optional: Hide navigation
         .setAppId(CLIENT_ID.split('-')[0]) // Use the numeric part of the client ID as App ID
         .setOAuthToken(gapi.client.getToken().access_token)
         .addView(view)
         // .addView(new google.picker.DocsUploadView()) // Optional: Allow upload
         .setDeveloperKey(API_KEY)
         .setCallback(pickerCallback)
         .build();
     picker.setVisible(true);

     // Re-enable button slightly after picker opens, in case user cancels
     setTimeout(() => {
         importGoogleDriveBtn.disabled = false;
     }, 1000);
 }

 /**
  * Callback function for the Google Picker.
  * @param {object} data The data returned by the Picker.
  */
 async function pickerCallback(data) {
     importGoogleDriveBtn.disabled = false; // Ensure button is enabled
     if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
         const file = data[google.picker.Response.DOCUMENTS][0];
         const fileId = file[google.picker.Document.ID];
         const fileName = file[google.picker.Document.NAME];
         console.log(`User picked file: ${fileName} (ID: ${fileId})`);
         showToast(`Importing ${fileName} from Google Drive...`);

         try {
             const response = await gapi.client.drive.files.get({
                 fileId: fileId,
                 alt: 'media'
             });

             console.log("Drive API Response (Import):", response);

             // Assuming response.body is the JSON string
             const importedJson = response.body;
             const parsedData = JSON.parse(importedJson);

             if (parsedData && parsedData.meta && parsedData.data) {
                 // --- Replace local data ---
                 // Clear existing state (important!)
                 localStorage.removeItem('campChecklist_data');
                 localStorage.removeItem('campChecklist_meta');
                 localStorage.removeItem('campChecklist_collapsedSections');
                 // Load the new data into the application state
                 await loadAllState(parsedData); // Pass the parsed data directly

                 // --- Re-render UI ---
                 renderMeta();
                 renderList();
                 calculateAndDisplayWeights();
                 calculateAndDisplayCosts();
                 updatePermitInfo();
                 updatePermitRequiredItems();

                 showToast("Successfully imported data from Google Drive.");
                 console.log("Data imported and UI updated.");
             } else {
                 throw new Error("Invalid JSON format in the imported file.");
             }

         } catch (err) {
             console.error("Error importing from Google Drive:", err);
             const errorDetails = err.result?.error;
              if (errorDetails?.message.includes("insufficient permissions")) {
                  showToast("Error: Insufficient permissions to read the file.");
              } else if (err instanceof SyntaxError) {
                  showToast("Error: Could not parse the file. Is it valid JSON?");
              }
              else {
                  showToast(`Error importing from Drive: ${errorDetails?.message || err.message || 'Unknown error'}`);
              }
         }
     } else if (data[google.picker.Response.ACTION] == google.picker.Action.CANCEL) {
         console.log("Google Picker cancelled by user.");
         showToast("Import cancelled.");
     }
 }


// --- Event Listeners ---
function setupAuthEventListeners() {
    googleSignInBtn.addEventListener('click', handleAuthClick);
    googleSignOutBtn.addEventListener('click', handleSignOutClick);
    exportGoogleDriveBtn.addEventListener('click', exportToGoogleDrive);
    importGoogleDriveBtn.addEventListener('click', importFromGoogleDrive);

    // Initial button state setup
    maybeEnableButtons();
}

// --- Exported Functions ---
// Export functions needed by other modules (like camplist.js)
export { initializeGapiClient, initializeGisClient, setupAuthEventListeners, gapiLoaded, gisLoaded };