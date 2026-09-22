# Limpopo - Vehicle Rental App

A production-ready React Native mobile application built with Expo for vehicle rentals and ride-sharing services.

## 🚀 Features

### Authentication & Onboarding
- Animated splash screen with auto-redirection
- Onboarding carousel with skip/next options
- Login with email validation and password visibility toggle
- Sign up with complete form validation and terms acceptance

### Main App Experience
- **Home**: Dashboard with active bookings, quick actions, and vehicle search
- **History**: Booking records with filter tabs (All, Active, Completed, Cancelled)
- **Wallet**: Account balance, payment methods, and transaction history
- **Settings**: App preferences, theme toggle, account management

### Additional Features
- **Vehicle Details**: Comprehensive vehicle information, specs, features, and pricing
- **Booking**: Date/time pickers, location selection, and price summary
- **Profile**: User profile management with editable fields
- **Dark/Light Theme**: Automatic theme switching with system default detection

## 📱 Tech Stack

- **Framework**: Expo SDK ~52.0.0
- **Language**: TypeScript
- **Navigation**: Expo Router ~4.0.0
- **UI**: React Native with SafeAreaView
- **Theme**: Custom Dark/Light mode with Context API
- **Storage**: AsyncStorage for persistent data

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18 or higher
- npm or yarn
- Expo Go app on your mobile device (iOS/Android)

### Installation

1. **Fix npm cache permissions** (if you encounter permission errors):
   ```bash
   sudo chown -R 501:20 "/Users/APPLE/.npm"
   ```

2. **Navigate to the project directory**:
   ```bash
   cd "/Users/APPLE/Documents/My Repository/new-limpopo-users/limpopo-app"
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Start the development server**:
   ```bash
   npm start
   ```

5. **Run on your device**:
   - Scan the QR code with Expo Go (Android) or Camera app (iOS)
   - Or press `i` for iOS simulator, `a` for Android emulator

## 📂 Project Structure

```
limpopo-app/
├── app/                        # Expo Router screens
│   ├── (tabs)/                # Bottom tab navigation
│   │   ├── _layout.tsx       # Tab bar configuration
│   │   ├── home.tsx          # Home screen
│   │   ├── history.tsx       # Booking history
│   │   ├── wallet.tsx        # Wallet & transactions
│   │   └── settings.tsx      # App settings
│   ├── _layout.tsx           # Root layout with ThemeProvider
│   ├── index.tsx             # Splash screen
│   ├── intro-slider.tsx      # Onboarding carousel
│   ├── login.tsx             # Login screen
│   ├── signup.tsx            # Registration screen
│   ├── booking.tsx           # Booking form
│   ├── vehicle-details.tsx   # Vehicle information
│   └── profile.tsx           # User profile
├── src/
│   ├── components/           # Reusable components (future)
│   ├── context/
│   │   └── ThemeContext.tsx  # Theme management
│   ├── data/
│   │   └── mockData.ts       # Mock data for demo
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces
│   └── utils/
│       └── formatters.ts     # Utility functions
├── assets/                   # Images and icons
├── app.json                  # Expo configuration
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript configuration
└── babel.config.js          # Babel configuration
```

## 🎨 Theme Configuration

The app supports three theme modes:
- **Light Mode**: Clean, bright interface
- **Dark Mode**: OLED-friendly dark interface
- **System Default**: Automatically matches device settings

Toggle theme in: Settings → Preferences → Dark Mode

## 🔑 Key Features

### Authentication Flow
- Smart splash screen with conditional routing
- First-time users see onboarding carousel
- Returning users go directly to login/home

### Booking System
- Search and filter vehicles by name, brand, or type
- View detailed vehicle specifications and features
- Book with custom date/time ranges
- Real-time price calculations

### Wallet Management
- Track account balance
- View transaction history with status indicators
- Manage multiple payment methods
- Add money or send transfers

### User Profile
- Edit personal information
- View booking statistics
- Manage account security
- Delete account option

## 📱 Navigation Structure

```
Root Stack
├── Splash Screen (index)
├── Intro Slider
├── Login
├── Signup
├── Bottom Tabs
│   ├── Home
│   ├── History
│   ├── Wallet
│   └── Settings
├── Booking (Modal)
├── Vehicle Details (Modal)
└── Profile (Modal)
```

## 🎯 Next Steps

To continue development:

1. **Add real API integration**:
   - Replace mock data with actual API calls
   - Implement authentication backend
   - Connect to payment gateway

2. **Enhance UI**:
   - Add actual images for vehicles
   - Implement image picker for profile photos
   - Add animations and transitions

3. **Add features**:
   - Real-time booking updates
   - Push notifications
   - Maps integration for pickup/dropoff
   - Review and rating system
   - Multi-language support

4. **Testing**:
   - Unit tests with Jest
   - E2E tests with Detox
   - Performance optimization

## 🐛 Troubleshooting

### npm permission errors
Run: `sudo chown -R 501:20 "/Users/APPLE/.npm"`

### Metro bundler issues
Clear cache: `npm start -- --clear`

### TypeScript errors
Ensure all dependencies are installed: `npm install`

## 📄 License

This project is for demonstration purposes.

## 🤝 Contributing

Feel free to fork this project and customize it for your needs!

---

Built with ❤️ using Expo and React Native
