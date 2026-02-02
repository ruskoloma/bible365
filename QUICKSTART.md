# Quick Start: Google Drive Integration

## ⚡ 5-Minute Setup

### Step 1: Get Google OAuth Client ID

1. Go to: https://console.cloud.google.com/
2. Create a new project (name it anything, e.g., "Bible Tracker")
3. Click on "APIs & Services" → "Library"
4. Search for "Google Drive API" and click **Enable**
5. Go to "APIs & Services" → "Credentials"
6. Click **"Create Credentials"** → **"OAuth client ID"**
7. If prompted, configure OAuth consent screen:
   - User Type: **External**
   - App name: `Bible Tracker` (or whatever you want)
   - User support email: your email
   - Developer contact: your email
   - Click **Save and Continue** through the rest
8. Back at "Create OAuth client ID":
   - Application type: **Web application**
   - Name: `Bible Tracker Web Client`
   - Authorized JavaScript origins:
     - Add: `http://localhost:3000`
     - Add your production domain if you have one (e.g., `https://yourdomain.com`)
   - Click **Create**
9. **Copy the Client ID** (it looks like: `123456789-abcdefg.apps.googleusercontent.com`)

### Step 2: Add Client ID to Your App

1. Open the file `.env.local` in your project root
2. Replace the placeholder with your actual Client ID:
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-actual-client-id-here.apps.googleusercontent.com
   ```
3. Save the file

### Step 3: Restart Your Dev Server

```bash
# Stop the current dev server (Ctrl+C)
npm run dev
```

That's it! The Google Sign-In button should now work.

## 🎯 What This Gives You

- ✅ Automatic cloud backup of reading progress
- ✅ Sync across all your devices
- ✅ Never lose your progress
- ✅ No backend server needed - everything runs in the browser!

## 🔒 Privacy

- Only accesses files created by the app (not your entire Drive)
- Data stored in app's private folder
- You can revoke access anytime from [Google Account settings](https://myaccount.google.com/permissions)

## ⚠️ Important Notes

1. **The app works WITHOUT Google** - users can still use local storage only
2. **It's completely free** - Google Cloud's free tier is more than enough
3. **No credit card required** for basic OAuth setup
4. **For production**: Add your production domain to authorized origins in Google Cloud Console

## 🐛 Troubleshooting

**Google button not showing?**
- Make sure `.env.local` has the correct Client ID
- Restart the dev server after adding the Client ID

**"Sign in failed" error?**
- Check that `http://localhost:3000` is in authorized JavaScript origins
- Make sure you copied the full Client ID

**Need more help?**
See the detailed guide: `GOOGLE_DRIVE_SETUP.md`

## 📝 Current Status

I've created a **demo Client ID** in your `.env.local` file that won't actually work. You need to replace it with your real one from Google Cloud Console.

The file is already set up - just replace this line:
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
```

With your actual Client ID from Google.
