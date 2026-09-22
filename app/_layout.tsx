import { Stack } from 'expo-router';
import { ActiveRideSearchBootstrap } from '../src/components/ActiveRideSearchBootstrap';
import { NativeCallBootstrap } from '../src/components/NativeCallBootstrap';
import { ThemeProvider } from '../src/context/ThemeContext';
import { NotificationsProvider } from '../src/context/NotificationsContext';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <NotificationsProvider>
        <ActiveRideSearchBootstrap />
        <NativeCallBootstrap />
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="intro-slider" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="booking" />
          <Stack.Screen name="vehicle-details" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="transaction-history" />
          <Stack.Screen name="transaction-details" />
          <Stack.Screen name="Security/reset-password" />
          <Stack.Screen name="Security/emergency" />
          <Stack.Screen name="schedule_bookings/onboarding" />
          <Stack.Screen name="schedule_bookings/ride_route" />
          <Stack.Screen name="schedule_bookings/schedule_booking" options={{ presentation: 'modal' }} />
          <Stack.Screen name="schedule_bookings/vehicle_details" />
          <Stack.Screen name="schedule_bookings/rent_booking" />
        </Stack>
      </NotificationsProvider>
    </ThemeProvider>
  );
}
