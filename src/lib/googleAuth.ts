// Google OAuth and Drive API integration
// This handles authentication and syncing progress to Google Drive

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const DRIVE_API_ENDPOINT = 'https://www.googleapis.com/drive/v3';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3';
const BIBLE_TRACKER_FILENAME = 'bible-tracker-progress.json';

export interface GoogleUser {
    email: string;
    name: string;
    picture: string;
}

export interface BibleTrackerData {
    startDate: string | null;
    completed: string[];
    language: 'en' | 'ru';
    lastSynced: string;
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let accessToken: string | null = null;
type TokenClientWithPromptOverride = google.accounts.oauth2.TokenClient & {
    requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

// Check if Google OAuth is configured
export const isGoogleConfigured = (): boolean => {
    return GOOGLE_CLIENT_ID !== '';
};

// Initialize Google Identity Services
export const initGoogleAuth = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            reject(new Error('Google Auth can only be initialized in browser'));
            return;
        }

        if (!isGoogleConfigured()) {
            reject(new Error('Google Client ID not configured'));
            return;
        }

        // Load the Google Identity Services script
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
                callback: () => { }, // Will be overridden per request
            });
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(script);
    });
};

// Request access token
export const requestAccessToken = (interactive = true): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!tokenClient) {
            reject(new Error('Google Auth not initialized'));
            return;
        }

        tokenClient.callback = (response: google.accounts.oauth2.TokenResponse) => {
            if (response.error) {
                reject(new Error(response.error));
                return;
            }
            accessToken = response.access_token;
            // Store token with expiry
            const expiresAt = Date.now() + (response.expires_in * 1000);
            localStorage.setItem('google_access_token', accessToken);
            localStorage.setItem('google_token_expires', expiresAt.toString());
            resolve(accessToken);
        };

        const client = tokenClient as TokenClientWithPromptOverride;
        client.requestAccessToken(interactive ? {} : { prompt: '' });
    });
};

// Get current access token (from memory or localStorage)
export const getAccessToken = async (): Promise<string | null> => {
    if (accessToken) return accessToken;

    const stored = localStorage.getItem('google_access_token');
    const expires = localStorage.getItem('google_token_expires');

    if (stored && expires && Date.now() < parseInt(expires) - 60_000) {
        accessToken = stored;
        return accessToken;
    }

    // Try silent token refresh for previously authorized users.
    // This is needed when the app is opened on another device/session.
    if (tokenClient) {
        try {
            return await requestAccessToken(false);
        } catch {
            return null;
        }
    }

    return null;
};

// Sign in with Google
export const signInWithGoogle = async (): Promise<GoogleUser> => {
    const token = await requestAccessToken(true);

    // Get user info
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
        throw new Error('Failed to get user info');
    }

    const userInfo = await response.json();
    const user: GoogleUser = {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
    };

    localStorage.setItem('google_user', JSON.stringify(user));
    return user;
};

// Sign out
export const signOut = () => {
    accessToken = null;
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_expires');
    localStorage.removeItem('google_user');
    localStorage.removeItem('drive_file_id');
};

// Get stored user info
export const getStoredUser = (): GoogleUser | null => {
    const stored = localStorage.getItem('google_user');
    return stored ? JSON.parse(stored) : null;
};

// Find the Bible Tracker file in Google Drive
const findDriveFile = async (token: string): Promise<string | null> => {
    const response = await fetch(
        `${DRIVE_API_ENDPOINT}/files?q=name='${BIBLE_TRACKER_FILENAME}' and trashed=false&spaces=appDataFolder&fields=files(id,name)`,
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }
    return null;
};

// Download progress from Google Drive
export const downloadProgress = async (): Promise<BibleTrackerData | null> => {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');

    let fileId = localStorage.getItem('drive_file_id');

    // If we don't have a cached file ID, search for it
    if (!fileId) {
        fileId = await findDriveFile(token);
        if (!fileId) return null; // No file exists yet
        localStorage.setItem('drive_file_id', fileId);
    }

    const response = await fetch(
        `${DRIVE_API_ENDPOINT}/files/${fileId}?alt=media`,
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    if (!response.ok) {
        // File might have been deleted, clear cache
        localStorage.removeItem('drive_file_id');
        return null;
    }

    return await response.json();
};

// Upload progress to Google Drive
export const uploadProgress = async (data: BibleTrackerData): Promise<void> => {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');

    let fileId = localStorage.getItem('drive_file_id');

    // If no file exists, search for it first
    if (!fileId) {
        fileId = await findDriveFile(token);
    }

    // Metadata - only include parents when creating a new file
    const metadata: { name: string; mimeType: string; parents?: string[] } = {
        name: BIBLE_TRACKER_FILENAME,
        mimeType: 'application/json',
    };

    // Only add parents when creating a new file (not updating)
    if (!fileId) {
        metadata.parents = ['appDataFolder'];
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', blob);

    const url = fileId
        ? `${UPLOAD_ENDPOINT}/files/${fileId}?uploadType=multipart`
        : `${UPLOAD_ENDPOINT}/files?uploadType=multipart`;

    const response = await fetch(url, {
        method: fileId ? 'PATCH' : 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed:', errorText);
        throw new Error('Failed to upload progress');
    }

    const result = await response.json();
    localStorage.setItem('drive_file_id', result.id);
};

// Delete progress from Google Drive
export const deleteProgress = async (): Promise<void> => {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');

    let fileId = localStorage.getItem('drive_file_id');

    // If no cached file ID, search for it
    if (!fileId) {
        fileId = await findDriveFile(token);
    }

    // If file exists, delete it
    if (fileId) {
        const response = await fetch(
            `${DRIVE_API_ENDPOINT}/files/${fileId}`,
            {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            }
        );

        if (!response.ok) {
            console.error('Failed to delete file from Drive');
        }

        // Clear cached file ID
        localStorage.removeItem('drive_file_id');
    }
};

// Check if user is signed in
export const isSignedIn = async (): Promise<boolean> => {
    const token = await getAccessToken();
    return token !== null;
};
