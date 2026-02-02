# Google Drive Integration Setup

This guide will help you set up Google Drive integration for the Bible Tracker app.

## Prerequisites

You need a Google Cloud Project with the Google Drive API enabled.

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### 2. Enable Google Drive API

1. In your Google Cloud Project, go to **APIs & Services** > **Library**
2. Search for "Google Drive API"
3. Click on it and press **Enable**

### 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen:
   - Choose **External** user type
   - Fill in the required fields (App name, User support email, Developer contact)
   - Add scopes: `https://www.googleapis.com/auth/drive.file` and `https://www.googleapis.com/auth/drive.appdata`
   - Add test users if needed (for testing phase)
4. For Application type, select **Web application**
5. Add authorized JavaScript origins:
   - `http://localhost:3000` (for development)
   - Your production domain (e.g., `https://yourdomain.com`)
6. Add authorized redirect URIs:
   - `http://localhost:3000` (for development)
   - Your production domain (e.g., `https://yourdomain.com`)
7. Click **Create**
8. Copy the **Client ID** (it will look like: `xxxxx.apps.googleusercontent.com`)

### 4. Configure Your App

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` and replace the placeholder with your actual Client ID:
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
   ```

3. Restart your development server:
   ```bash
   npm run dev
   ```

## How It Works

- **Local Storage**: By default, the app stores progress in browser localStorage
- **Google Drive Sync**: When signed in with Google, progress is automatically synced to Google Drive
- **Automatic Backup**: Changes are synced to Drive every 2 seconds (debounced)
- **Cross-Device Sync**: Access your progress from any device by signing in with the same Google account

## User Flow

1. **First Time Setup**:
   - User can choose "Start Reading (Local Only)" or "Start with Google Drive"
   - If choosing Google Drive, they'll be prompted to sign in

2. **Existing Users**:
   - Users with local progress can connect Google Drive from the menu (three dots)
   - They'll be asked whether to use cloud data or upload local data

3. **Signed In Users**:
   - Progress automatically syncs to Google Drive
   - Menu shows sync status and user info
   - Can manually trigger sync or sign out

## Privacy & Security

- The app only requests access to files it creates (using `drive.file` scope)
- Data is stored in the app's private folder on Google Drive
- No backend server is needed - all authentication happens client-side
- Users can revoke access anytime from their [Google Account settings](https://myaccount.google.com/permissions)

## Troubleshooting

### "Google Auth not initialized" error
- Make sure the Google Client ID is set in `.env.local`
- Restart the development server after adding the environment variable

### "Failed to sign in with Google" error
- Check that your domain is added to authorized JavaScript origins
- Verify the OAuth consent screen is configured correctly
- Make sure you're using the correct Client ID

### Sync not working
- Check browser console for errors
- Verify Google Drive API is enabled in your project
- Ensure the user has granted the necessary permissions

## Production Deployment

When deploying to production:

1. Add your production domain to authorized JavaScript origins in Google Cloud Console
2. Set the `NEXT_PUBLIC_GOOGLE_CLIENT_ID` environment variable in your hosting platform
3. If your app is in testing mode, publish it or add users as test users in the OAuth consent screen
