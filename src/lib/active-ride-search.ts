import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const ACTIVE_RIDE_SEARCH_KEY = 'active_ride_search';
export const LIVE_RIDE_SEARCH_DURATION_SECONDS = 120;

export type ActiveRideSearch = {
  bookingId: string;
  startedAt: string;
  pickup: string;
  pickupLat: string;
  pickupLng: string;
  dropoff: string;
  dropoffLat: string;
  dropoffLng: string;
};

export const persistActiveRideSearch = async (search: ActiveRideSearch) => {
  await AsyncStorage.setItem(ACTIVE_RIDE_SEARCH_KEY, JSON.stringify(search));
};

export const readActiveRideSearch = async (): Promise<ActiveRideSearch | null> => {
  const storedValue = await AsyncStorage.getItem(ACTIVE_RIDE_SEARCH_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<ActiveRideSearch>;

    if (
      typeof parsedValue.bookingId !== 'string' ||
      typeof parsedValue.startedAt !== 'string' ||
      typeof parsedValue.pickup !== 'string' ||
      typeof parsedValue.pickupLat !== 'string' ||
      typeof parsedValue.pickupLng !== 'string' ||
      typeof parsedValue.dropoff !== 'string' ||
      typeof parsedValue.dropoffLat !== 'string' ||
      typeof parsedValue.dropoffLng !== 'string'
    ) {
      return null;
    }

    return {
      bookingId: parsedValue.bookingId,
      startedAt: parsedValue.startedAt,
      pickup: parsedValue.pickup,
      pickupLat: parsedValue.pickupLat,
      pickupLng: parsedValue.pickupLng,
      dropoff: parsedValue.dropoff,
      dropoffLat: parsedValue.dropoffLat,
      dropoffLng: parsedValue.dropoffLng,
    };
  } catch {
    return null;
  }
};

export const clearActiveRideSearch = async () => {
  await AsyncStorage.removeItem(ACTIVE_RIDE_SEARCH_KEY);
};

export const getRemainingRideSearchSeconds = (
  startedAt: string,
  totalSeconds = LIVE_RIDE_SEARCH_DURATION_SECONDS
) => {
  const startedAtMs = new Date(startedAt).getTime();

  if (!Number.isFinite(startedAtMs)) {
    return totalSeconds;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  return Math.max(0, totalSeconds - elapsedSeconds);
};

export const expireOpenRideBooking = async (bookingId: string) => {
  const { data, error } = await supabase
    .from('rider_booking')
    .update({ ride_status: 'expired' })
    .eq('id', bookingId)
    .eq('ride_status', 'open')
    .is('assigned_driver', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
};