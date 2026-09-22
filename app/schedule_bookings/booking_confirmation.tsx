import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import QuickWallet from '../../src/components/quick_wallet';
import { BudPayCheckoutModal } from '../../src/components/BudPayCheckoutModal';
import { supabase } from '../../src/lib/supabase';
import { fetchRiderProfile, getCachedRiderProfile } from '../../src/lib/rider-profile';

type RideFor = 'me' | 'someoneElse';
type PaymentMethod = 'wallet' | 'directTransfer';

const BUDPAY_PUBLIC_KEY = process.env.EXPO_PUBLIC_BUDPAY_PUBLIC_KEY || '';

const normalizeRouteParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
};

const formatDisplayTime = (value: string) => {
  if (!value.trim()) {
    return 'Not set';
  }

  const [hoursText, minutesText] = value.split(':');
  const hours = Number.parseInt(hoursText ?? '', 10);
  const minutes = Number.parseInt(minutesText ?? '', 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value;
  }

  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const formatWholeNaira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return 'Please try again.';
};

export default function BookingConfirmationScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    hourlyPackageId,
    vehicleType,
    hourlyDurationHours,
    hourlyPickupTime,
    hourlyAmount,
    pickup,
    pickupLat,
    pickupLng,
    hourlyNotes,
    rideFor,
    guestRiderName,
    guestRiderNumber,
  } = useLocalSearchParams<{
    hourlyPackageId?: string;
    vehicleType?: string;
    hourlyDurationHours?: string;
    hourlyPickupTime?: string;
    hourlyAmount?: string;
    pickup?: string;
    pickupLat?: string;
    pickupLng?: string;
    hourlyNotes?: string;
    rideFor?: string;
    guestRiderName?: string;
    guestRiderNumber?: string;
  }>();

  const resolvedVehicleType = normalizeRouteParam(vehicleType) || 'Limpopo Pro';
  const resolvedDurationHours = Number.parseInt(normalizeRouteParam(hourlyDurationHours), 10) || 0;
  const resolvedPickupTime = normalizeRouteParam(hourlyPickupTime);
  const resolvedPickupAddress = normalizeRouteParam(pickup) || 'Not set';
  const resolvedPickupLat = Number.parseFloat(normalizeRouteParam(pickupLat));
  const resolvedPickupLng = Number.parseFloat(normalizeRouteParam(pickupLng));
  const resolvedNotes = normalizeRouteParam(hourlyNotes).trim();
  const resolvedRideFor: RideFor = normalizeRouteParam(rideFor) === 'someoneElse' ? 'someoneElse' : 'me';
  const isGuestRide = resolvedRideFor === 'someoneElse';
  const resolvedGuestName = normalizeRouteParam(guestRiderName).trim();
  const resolvedGuestNumber = normalizeRouteParam(guestRiderNumber).trim();
  const resolvedAmount = Number.parseFloat(normalizeRouteParam(hourlyAmount)) || 0;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [isQuickWalletVisible, setIsQuickWalletVisible] = useState(false);
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [activeCheckout, setActiveCheckout] = useState<{ reference: string; amount: number } | null>(null);
  const [checkoutProfile, setCheckoutProfile] = useState({
    email: '',
    firstName: 'Rider',
    lastName: 'Limpopo',
    phone: '',
  });

  useEffect(() => {
    let isMounted = true;

    const hydrateCheckoutProfile = async () => {
      const cachedProfile = await getCachedRiderProfile();
      const profile = (await fetchRiderProfile()) ?? cachedProfile;

      if (isMounted && profile) {
        setCheckoutProfile({
          email: profile.email,
          firstName: profile.firstName || 'Rider',
          lastName: profile.lastName || 'Limpopo',
          phone: profile.phone,
        });
      }
    };

    hydrateCheckoutProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const canPayNow = Boolean(paymentMethod) && !isCreatingBooking && !isVerifyingPayment;

  const createHourlyBooking = async (finalPaymentMethod: PaymentMethod) => {
    if (!Number.isFinite(resolvedPickupLat) || !Number.isFinite(resolvedPickupLng)) {
      Alert.alert('Missing pickup location', 'Please choose a pickup location before booking.');
      return;
    }

    setIsCreatingBooking(true);

    try {
      const cachedProfile = await getCachedRiderProfile();
      const profile = (await fetchRiderProfile()) ?? cachedProfile;

      if (!profile?.uuid) {
        throw new Error('Please sign in again before making a booking.');
      }

      const riderName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();

      const { error } = await supabase.from('hourly_booking').insert({
        rider_id: profile.uuid,
        vehicle_type: resolvedVehicleType,
        duration_hours: resolvedDurationHours,
        pickup_time: resolvedPickupTime,
        pickup_address: resolvedPickupAddress,
        pickup_lat: resolvedPickupLat,
        pickup_lng: resolvedPickupLng,
        rider_name: riderName || null,
        rider_contact: profile.phone,
        rider_email: profile.email,
        guest_rider: isGuestRide,
        guest_name: isGuestRide ? resolvedGuestName || null : null,
        guest_contact: isGuestRide ? resolvedGuestNumber || null : null,
        booking_notes: resolvedNotes || null,
        amount: resolvedAmount,
        payment_method: finalPaymentMethod === 'directTransfer' ? 'transfer' : 'wallet',
        booking_status: 'pending',
      });

      if (error) {
        throw error;
      }

      Alert.alert('Booking created', 'Your hourly booking has been created successfully.', [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)/home'),
        },
      ]);
    } catch (error) {
      Alert.alert('Unable to create booking', getErrorMessage(error));
    } finally {
      setIsCreatingBooking(false);
    }
  };

  const handleCheckoutComplete = async (response: { reference?: string; status?: string }) => {
    const reference = response?.reference || activeCheckout?.reference;
    setActiveCheckout(null);

    if (!reference) {
      return;
    }

    setIsVerifyingPayment(true);

    try {
      await supabase.functions.invoke('budpay-webhook', {
        method: 'POST',
        body: {
          notify: 'transaction',
          notifyType: 'successful',
          data: { reference, channel: 'card' },
        },
      });
    } catch (error) {
      // Payment may still have succeeded even if webhook verification fails here.
    } finally {
      setIsVerifyingPayment(false);
    }

    await createHourlyBooking('directTransfer');
  };

  const handleCheckoutCancel = () => {
    setActiveCheckout(null);
  };

  const handlePayNow = async () => {
    if (!paymentMethod) {
      return;
    }

    if (paymentMethod === 'wallet') {
      await createHourlyBooking('wallet');
      return;
    }

    const cachedProfile = await getCachedRiderProfile();
    const profile = (await fetchRiderProfile()) ?? cachedProfile;

    if (!profile?.email) {
      Alert.alert('Profile incomplete', 'We could not find your email. Please update your profile and try again.');
      return;
    }

    const reference = `HRLY_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    setActiveCheckout({ reference, amount: resolvedAmount });
  };

  const guestSummary = useMemo(() => {
    if (!isGuestRide) {
      return null;
    }

    return [resolvedGuestName, resolvedGuestNumber].filter(Boolean).join(' · ') || 'Guest details not set';
  }, [isGuestRide, resolvedGuestName, resolvedGuestNumber]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Booking summary</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.summaryCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Vehicle</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{resolvedVehicleType}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Duration</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {resolvedDurationHours} {resolvedDurationHours === 1 ? 'hour' : 'hours'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Pickup time</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {formatDisplayTime(resolvedPickupTime)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Pickup location</Text>
            <Text style={[styles.summaryValue, styles.summaryValueWrap, { color: theme.colors.text }]}>
              {resolvedPickupAddress}
            </Text>
          </View>
          {resolvedNotes ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Notes</Text>
              <Text style={[styles.summaryValue, styles.summaryValueWrap, { color: theme.colors.text }]}>
                {resolvedNotes}
              </Text>
            </View>
          ) : null}
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Ride for</Text>
            <Text style={[styles.summaryValue, styles.summaryValueWrap, { color: theme.colors.text }]}>
              {isGuestRide ? guestSummary : 'Me'}
            </Text>
          </View>
        </View>

        <View style={[styles.amountCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.amountLabel, { color: theme.colors.textSecondary }]}>Amount payable</Text>
          <Text style={[styles.amountValue, { color: theme.colors.text }]}>{formatWholeNaira(resolvedAmount)}</Text>
        </View>

        <View style={styles.paymentTitleRow}>
          {paymentMethod === 'wallet' ? (
            <TouchableOpacity onPress={() => setIsQuickWalletVisible(true)} style={styles.paymentTitleIconButton}>
              <Ionicons name="chevron-down" size={16} color={theme.colors.primary} />
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Payment method</Text>
        </View>

        <View style={[styles.paymentToggle, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'wallet' && { backgroundColor: theme.colors.primary }]}
            onPress={() => setPaymentMethod('wallet')}
          >
            <Ionicons
              name="wallet-outline"
              size={16}
              color={paymentMethod === 'wallet' ? '#FFFFFF' : theme.colors.textSecondary}
            />
            <Text
              style={[
                styles.paymentOptionText,
                { color: paymentMethod === 'wallet' ? '#FFFFFF' : theme.colors.textSecondary },
              ]}
            >
              Wallet
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.paymentOption,
              paymentMethod === 'directTransfer' && { backgroundColor: theme.colors.primary },
            ]}
            onPress={() => setPaymentMethod('directTransfer')}
          >
            <Ionicons
              name="card-outline"
              size={16}
              color={paymentMethod === 'directTransfer' ? '#FFFFFF' : theme.colors.textSecondary}
            />
            <Text
              style={[
                styles.paymentOptionText,
                { color: paymentMethod === 'directTransfer' ? '#FFFFFF' : theme.colors.textSecondary },
              ]}
            >
              Direct Transfer
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.payButton, { backgroundColor: canPayNow ? theme.colors.primary : theme.colors.border }]}
          onPress={handlePayNow}
          disabled={!canPayNow}
        >
          {isCreatingBooking || isVerifyingPayment ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.payButtonText}>Pay Now</Text>
          )}
        </TouchableOpacity>
      </View>

      <QuickWallet visible={isQuickWalletVisible} onClose={() => setIsQuickWalletVisible(false)} />

      {activeCheckout ? (
        <BudPayCheckoutModal
          visible
          publicKey={BUDPAY_PUBLIC_KEY}
          amount={activeCheckout.amount}
          reference={activeCheckout.reference}
          email={checkoutProfile.email}
          firstName={checkoutProfile.firstName}
          lastName={checkoutProfile.lastName}
          phone={checkoutProfile.phone}
          onComplete={handleCheckoutComplete}
          onCancel={handleCheckoutCancel}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  summaryCard: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 13,
    flexShrink: 0,
    marginRight: 12,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  summaryValueWrap: {
    flex: 1,
  },
  amountCard: {
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  amountLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  paymentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  paymentTitleIconButton: {
    marginRight: 6,
  },
  paymentToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 4,
    gap: 8,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  paymentOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  payButton: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
