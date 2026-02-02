# Deployment Guide for Xperimental Mutant Apes Website

## Option 1: Deploy via Vercel Dashboard (Recommended - No Git Required)

1. **Prepare your files:**
   - All files are ready in the `/Users/tombuxdao/xapes` directory
   - Files needed: `index.html`, `styles.css`, `script.js`, and `public/images/` folder

2. **Deploy to Vercel:**
   - Go to [vercel.com](https://vercel.com) and log in with your new account
   - Click "Add New..." → "Project"
   - Choose "Import Git Repository" OR "Deploy from local files"
   - If deploying from local files, you can drag and drop the folder

## Option 2: Use Vercel CLI (No Git Required)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Navigate to project:
   ```bash
   cd /Users/tombuxdao/xapes
   ```

3. Deploy:
   ```bash
   vercel
   ```
   - Follow the prompts
   - Login with your new account when prompted
   - Vercel will deploy directly without needing git

## Option 3: GitHub + Vercel (After resolving Xcode license)

If you want to use GitHub:

1. **Resolve Xcode license:**
   ```bash
   sudo xcodebuild -license
   ```
   (Press space to scroll, type 'agree' at the end)

2. **Clear old GitHub credentials:**
   - Open Keychain Access (Applications → Utilities)
   - Search for "github.com"
   - Delete any GitHub credentials found
   - Or use: `git credential-osxkeychain erase` (after Xcode is resolved)

3. **Set up new GitHub account:**
   ```bash
   git config --global user.name "Your New Name"
   git config --global user.email "your-new-email@example.com"
   ```

4. **Initialize and push:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-NEW-USERNAME/xapes.git
   git push -u origin main
   ```
   (You'll be prompted to login with your new GitHub account)

5. **Connect to Vercel:**
   - Go to Vercel dashboard
   - Import the GitHub repository
   - Deploy automatically

## Recommended: Option 1 or 2

Since you have a new temporary account, I recommend **Option 1 or 2** (Vercel Dashboard or CLI) as they don't require resolving the Xcode license issue or setting up git credentials.
