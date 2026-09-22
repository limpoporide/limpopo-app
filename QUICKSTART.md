# Quick Start Guide

## Before Running the App

### 1. Fix npm Cache Permission (Required)
Run this command in your terminal:
```bash
sudo chown -R 501:20 "/Users/APPLE/.npm"
```

### 2. Install Dependencies
```bash
cd "/Users/APPLE/Documents/My Repository/new-limpopo-users/limpopo-app"
npm install
```

### 3. Start the App
```bash
npm start
```

### 4. Run on Your Device
- Install **Expo Go** app on your phone
- Scan the QR code that appears
- The app will load automatically

## Quick Navigation Guide

### Authentication Flow
1. **Splash Screen** → Auto-redirects based on login status
2. **Intro Slider** → First-time users see onboarding (can skip)
3. **Login** → Existing users login here
4. **Sign Up** → New users create account

### Main App Tabs
- **🏠 Home**: Browse vehicles, see active bookings, quick actions
- **📋 History**: View all bookings with filters
- **💰 Wallet**: Manage balance and payments
- **⚙️ Settings**: Theme toggle, preferences, logout

### Additional Screens
- **Vehicle Details**: Tap any vehicle to see full specs
- **Booking**: Book a vehicle with dates and location
- **Profile**: Manage your account info

## Theme Switching
Go to: **Settings → Dark Mode toggle**

## Test Credentials
Since this uses mock data, any email/password combination will work for login/signup.

## Common Issues

### "npm permission error"
Solution: Run the sudo command above

### "Module not found"
Solution: 
```bash
rm -rf node_modules
npm install
```

### "Metro bundler error"
Solution:
```bash
npm start -- --clear
```

## Need Help?
Check the full [README.md](./README.md) for detailed documentation.
