# Setting Up Git Repository for stoagroupDB

Follow these steps to create a Git repository and connect it to GitHub for Render deployment.

---

## Step 1: Initialize Git Repository

Open Terminal and run:

```bash
cd "/Users/alecrovner/Library/CloudStorage/OneDrive-STOA/Desktop/Domo Dashboards/stoagroupDB"
git init
```

---

## Step 2: Add All Files (First Time)

```bash
git add .
```

This will add all files except those in `.gitignore` (like `.env` files).

---

## Step 3: Create Initial Commit

```bash
git commit -m "Initial commit: Stoa Group Database API and schema"
```

---

## Step 4: Create GitHub Repository

1. Go to [github.com](https://github.com) and sign in
2. Click the **"+"** button (top right) → **"New repository"**
3. Repository name: `stoagroupDB` (or `stoagroup-db-api`)
4. Description: "Stoa Group Database REST API and schema"
5. Choose **Private** (recommended - contains database structure)
6. **DO NOT** initialize with README, .gitignore, or license (we already have these)
7. Click **"Create repository"**

---

## Step 5: Connect Local Repo to GitHub

GitHub will show you commands. Use these:

```bash
# Add GitHub as remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/stoagroupDB.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

You'll be prompted for your GitHub username and password (or use a Personal Access Token).

---

## Step 6: Verify

1. Go to your GitHub repository page
2. You should see all your files there
3. Make sure `.env` files are **NOT** visible (they should be ignored)

---

## Step 7: Connect to Render

Now you can connect this GitHub repository to Render:

1. Go to [render.com](https://render.com)
2. Click **"New +"** → **"Web Service"**
3. Click **"Connect account"** next to your Git provider (GitHub)
4. Authorize Render to access your repositories
5. Select `stoagroupDB` repository
6. Continue with Render setup (see `api/RENDER_DEPLOYMENT.md`)

---

## 🔒 Important: What's Ignored

The `.gitignore` file ensures these sensitive files are **NOT** committed:

- ✅ `.env` files (database passwords)
- ✅ `node_modules/` (dependencies)
- ✅ `dist/` (build files)
- ✅ IDE files

**Never commit:**
- Database passwords
- API keys
- Personal information

---

## 📝 Future Updates

After making changes:

```bash
# See what changed
git status

# Add changes
git add .

# Commit
git commit -m "Description of changes"

# Push to GitHub
git push
```

Render will automatically detect the push and redeploy your API!

---

## 🐛 Troubleshooting

### "Repository not found"
- Make sure you've created the GitHub repo first
- Check the repository name matches
- Verify you're logged into GitHub

### "Permission denied"
- Use HTTPS URL (not SSH) if you haven't set up SSH keys
- You may need a Personal Access Token instead of password
- Generate one: GitHub → Settings → Developer settings → Personal access tokens

### "Nothing to commit"
- Check if files are in `.gitignore`
- Use `git status` to see what's tracked

---

## ✅ Checklist

- [ ] Git repository initialized
- [ ] `.gitignore` file created (already done)
- [ ] Initial commit made
- [ ] GitHub repository created
- [ ] Local repo connected to GitHub
- [ ] Code pushed to GitHub
- [ ] Verified `.env` files are NOT in GitHub
- [ ] Ready to connect to Render!
