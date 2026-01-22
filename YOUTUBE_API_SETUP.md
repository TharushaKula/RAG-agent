# YouTube API Setup Guide

This guide explains how to set up the YouTube Data API v3 for the Learning Materials feature.

## Prerequisites

- A Google account
- Access to Google Cloud Console

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click "New Project"
4. Enter a project name (e.g., "RAG Agent Learning")
5. Click "Create"

## Step 2: Enable YouTube Data API v3

1. In your Google Cloud project, go to **APIs & Services** > **Library**
2. Search for "YouTube Data API v3"
3. Click on it and click **Enable**

## Step 3: Create API Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **API Key**
3. Your API key will be generated
4. (Recommended) Click **Restrict Key** to:
   - Under "API restrictions", select "Restrict key" and choose "YouTube Data API v3"
   - Under "Application restrictions", you can restrict by IP or HTTP referrer for security

## Step 4: Add API Key to Backend

1. Open `backend/.env` file (create it if it doesn't exist)
2. Add the following line:
   ```
   YOUTUBE_API_KEY=your_api_key_here
   ```
3. Replace `your_api_key_here` with your actual API key
4. **Important**: Never commit the `.env` file to version control!

## Step 5: Verify Setup

1. Restart your backend server
2. Navigate to the Learning Materials page in the frontend
3. You should see YouTube videos in the "Visual" tab
4. Try searching for a topic to verify the search functionality

## API Quotas

YouTube Data API v3 has the following default quotas:
- **10,000 units per day** (free tier)
- **1 unit per search request**
- **100 units per video details request**

This means you can make approximately **10,000 search requests per day** on the free tier.

## Troubleshooting

### Error: "YouTube API key is not configured"
- Make sure you've added `YOUTUBE_API_KEY` to your `backend/.env` file
- Restart your backend server after adding the key
- Check that there are no extra spaces or quotes around the API key

### Error: "API key not valid"
- Verify your API key is correct
- Check that YouTube Data API v3 is enabled in your Google Cloud project
- Ensure your API key restrictions allow the API

### Error: "Quota exceeded"
- You've reached your daily quota limit
- Wait 24 hours for the quota to reset, or
- Request a quota increase in Google Cloud Console

### No videos showing up
- Check the browser console for errors
- Verify the API key is working by testing it directly:
  ```bash
  curl "https://www.googleapis.com/youtube/v3/search?part=snippet&q=javascript&key=YOUR_API_KEY"
  ```

## Security Best Practices

1. **Never commit API keys to version control**
   - Add `.env` to `.gitignore`
   - Use environment variables in production

2. **Restrict your API key**
   - Limit to YouTube Data API v3 only
   - Add IP or referrer restrictions for production

3. **Rotate keys if compromised**
   - Generate a new key in Google Cloud Console
   - Update your `.env` file
   - Delete the old key

## Next Steps

Once YouTube API is working, you can:
- Integrate other APIs (Coursera, Udemy, etc.)
- Add caching to reduce API calls
- Implement pagination for search results
- Add filters (duration, upload date, etc.)
