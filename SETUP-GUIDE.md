# 🚀 Crypto Exit Planner - Multi-User Setup Guide

## Phase 1: Foundation Setup (15 minutes)

### Step 1: Create Supabase Project (5 minutes)

1. **Go to [supabase.com](https://supabase.com)**
2. **Sign up with GitHub** (recommended for easy integration)
3. **Create new project:**
   - Name: `crypto-exit-planner`
   - Generate strong password
   - Choose region closest to you
4. **Wait for project creation** (2-3 minutes)

### Step 2: Get Your Credentials (2 minutes)

1. **Go to Settings > API**
2. **Copy these values:**
   - `Project URL`
   - `anon public key`
3. **Open `supabase-config.js` in your project**
4. **Replace the placeholder values:**
   ```javascript
   const SUPABASE_URL = 'your-project-url-here'
   const SUPABASE_ANON_KEY = 'your-anon-key-here'
   ```

### Step 3: Create Database Tables (5 minutes)

1. **Go to Supabase Dashboard > SQL Editor**
2. **Open `database-schema.sql` from your project**
3. **Copy the entire contents**
4. **Paste into SQL Editor and run**
5. **Verify tables created** (check Table Editor)

### Step 4: Enable Google OAuth (Optional - 3 minutes)

1. **Go to Authentication > Providers**
2. **Enable Google provider**
3. **Add your domain to redirect URLs:**
   - `http://localhost:3000` (for local testing)
   - Your production domain (when deployed)

---

## Phase 2: Test Your Setup (5 minutes)

### Step 1: Test Locally
1. **Open `auth.html` in your browser**
2. **Try creating an account**
3. **Check if you get redirected to main app**
4. **Verify your data syncs**

### Step 2: Test Offline Mode
1. **Click "Continue Offline"**
2. **Verify app works without internet**
3. **Check localStorage fallback**

---

## Phase 3: Deploy to Vercel (10 minutes)

### Step 1: Prepare for Deployment
1. **Create GitHub repository:**
   ```bash
   cd /Users/paul/Downloads/CEP
   git init
   git add .
   git commit -m "Initial multi-user setup"
   ```
2. **Push to GitHub:**
   - Create repo on GitHub
   - Follow push instructions

### Step 2: Deploy with Vercel
1. **Go to [vercel.com](https://vercel.com)**
2. **Import GitHub repository**
3. **No configuration needed** - it's a static site!
4. **Deploy** ✨

### Step 3: Update Supabase URLs
1. **Copy your Vercel deployment URL**
2. **Go to Supabase > Authentication > URL Configuration**
3. **Add to Redirect URLs:**
   - `https://your-app.vercel.app`
   - `https://your-app.vercel.app/auth.html`

---

## Phase 4: Invite Your Friends (2 minutes)

### Share Your App
1. **Send them your Vercel URL**
2. **They can create accounts**
3. **Each user gets their own portfolio data**
4. **No more file sharing needed!** 🎉

---

## What You Get Immediately:

### ✅ **Multi-User Support**
- Each friend has their own account
- Private portfolio data
- Secure authentication

### ✅ **Seamless Development**
- Edit code locally
- `git push` → Auto-deploy in 10 seconds
- Everyone sees updates instantly

### ✅ **Offline Fallback**
- Works without internet
- localStorage backup
- No data loss

### ✅ **Ready for Price Alerts**
- Database schema ready
- User system in place
- Email infrastructure prepared

---

## Next Steps (Coming Soon):

### 📧 **Phase 5: Email Notifications**
- Price alert system
- Exit level notifications
- Custom alert frequencies

### 📱 **Phase 6: Mobile App**
- Progressive Web App
- Push notifications
- Offline sync

### 📊 **Phase 7: Advanced Features**
- Portfolio sharing
- Group alerts
- Advanced analytics

---

## Troubleshooting:

### **Auth Page Not Loading?**
- Check Supabase credentials in `supabase-config.js`
- Verify database tables exist
- Check browser console for errors

### **Can't Sign Up?**
- Check email confirmation settings in Supabase
- Verify redirect URLs are correct
- Try offline mode as fallback

### **Data Not Syncing?**
- Check browser network tab
- Verify Supabase connection
- localStorage fallback should work

### **Deployment Issues?**
- Ensure all files are in repository
- Check Vercel build logs
- Verify static site configuration

---

## Support:

If you run into any issues:
1. Check browser console for errors
2. Verify Supabase dashboard for data
3. Test offline mode works
4. Check this guide again

**Remember:** Your app works offline as a fallback, so you can always continue development even if something goes wrong with the backend setup!

---

## Files Created/Modified:

### **New Files:**
- `supabase-config.js` - Database connection & migration logic
- `database-schema.sql` - Database tables and security
- `auth.html` - Sign in/up page
- `auth.js` - Authentication logic
- `SETUP-GUIDE.md` - This guide

### **Modified Files:**
- `index.html` - Added Supabase script tag
- `script.js` - Added authentication checks and logout

### **Ready for Next Phase:**
- Price alert system
- Email notifications
- Advanced user features

**Your app is now ready for multi-user collaboration!** 🚀
