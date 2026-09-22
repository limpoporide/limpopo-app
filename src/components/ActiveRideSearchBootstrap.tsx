import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import {
  clearActiveRideSearch,
  expireOpenRideBooking,
  getRemainingRideSearchSeconds,
  LIVE_RIDE_SEARCH_DURATION_SECONDS,
  readActiveRideSearch,
} from '../lib/active-ride-search';
import { supabase } from '../lib/supabase';

type ActiveRideSearchBooking = {
  id: string;
  ride_status: 'open' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
  assigned_driver: string | null;
  payment_status: 'unpaid' | 'paid' | null;
};

type RestorableActiveRideBooking = {
  id: string;
  ride_status: 'accepted' | 'arrived' | 'in_progress' | 'completed';
  assigned_driver: string | null;
  payment_status: 'unpaid' | 'paid' | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_lat: number | null;
  drop_lng: number | null;
};

const RESTORABLE_RIDE_STATUSES = ['accepted', 'arrived', 'in_progress'] as const;

const ACTIVE_RIDE_FLOW_PATHS = new Set([
  '/bookings/accept',
  '/bookings/chat',
  '/bookings/call',
]);

const isRestorableRide = (rideStatus: ActiveRideSearchBooking['ride_status'], paymentStatus: ActiveRideSearchBooking['payment_status']) => {
  if (RESTORABLE_RIDE_STATUSES.includes(rideStatus as (typeof RESTORABLE_RIDE_STATUSES)[number])) {
    return true;
  }

  return rideStatus === 'completed' && paymentStatus !== 'paid';
};

const isActiveRideFlowPath = (pathname: string) => ACTIVE_RIDE_FLOW_PATHS.has(pathname);

export function ActiveRideSearchBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const appStateRef = useRef(AppState.currentState);
  const isRestoringRef = useRef(false);

  const fetchBooking = useCallback(async (bookingId: string) => {
    const { data, error } = await supabase
      .from('rider_booking')
      .select('id, ride_status, assigned_driver, payment_status')
      .eq('id', bookingId)
      .maybeSingle<ActiveRideSearchBooking>();

    if (error) {
      throw error;
    }

    return data;
  }, []);

  const fetchLatestActiveRide = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data, error } = await supabase
      .from('rider_booking')
      .select('id, ride_status, assigned_driver, payment_status, pickup_lat, pickup_lng, drop_lat, drop_lng')
      .eq('rider_id', user.id)
      .not('assigned_driver', 'is', null)
      .in('ride_status', [...RESTORABLE_RIDE_STATUSES, 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<RestorableActiveRideBooking>();

    if (error) {
      throw error;
    }

    return data;
  }, []);

  const restoreLatestActiveRide = useCallback(async () => {
    const activeRide = await fetchLatestActiveRide();

    if (!activeRide?.assigned_driver || !isRestorableRide(activeRide.ride_status, activeRide.payment_status)) {
      return;
    }

    if (isActiveRideFlowPath(pathname)) {
      return;
    }

    router.replace({
      pathname: '/bookings/accept',
      params: {
        bookingId: activeRide.id,
        pickupLat: activeRide.pickup_lat !== null ? String(activeRide.pickup_lat) : '',
        pickupLng: activeRide.pickup_lng !== null ? String(activeRide.pickup_lng) : '',
        dropoffLat: activeRide.drop_lat !== null ? String(activeRide.drop_lat) : '',
        dropoffLng: activeRide.drop_lng !== null ? String(activeRide.drop_lng) : '',
      },
    });
  }, [fetchLatestActiveRide, pathname, router]);

  const restoreActiveSearch = useCallback(async () => {
    if (isRestoringRef.current) {
      return;
    }

    isRestoringRef.current = true;

    try {
      const activeSearch = await readActiveRideSearch();

      if (!activeSearch?.bookingId) {
        await restoreLatestActiveRide();
        return;
      }

      const booking = await fetchBooking(activeSearch.bookingId);

      if (!booking) {
        await clearActiveRideSearch();
        await restoreLatestActiveRide();
        return;
      }

      if (isRestorableRide(booking.ride_status, booking.payment_status) && booking.assigned_driver) {
        if (!isActiveRideFlowPath(pathname)) {
          router.replace({
            pathname: '/bookings/accept',
            params: {
              bookingId: activeSearch.bookingId,
              pickup: activeSearch.pickup,
              pickupLat: activeSearch.pickupLat,
              pickupLng: activeSearch.pickupLng,
              dropoff: activeSearch.dropoff,
              dropoffLat: activeSearch.dropoffLat,
              dropoffLng: activeSearch.dropoffLng,
            },
          });
        }

        return;
      }

      if (booking.ride_status !== 'open') {
        await clearActiveRideSearch();
        await restoreLatestActiveRide();
        return;
      }

      const remainingSeconds = getRemainingRideSearchSeconds(
        activeSearch.startedAt,
        LIVE_RIDE_SEARCH_DURATION_SECONDS
      );

      if (remainingSeconds <= 0) {
        const didExpire = await expireOpenRideBooking(activeSearch.bookingId);

        if (!didExpire) {
          const refreshedBooking = await fetchBooking(activeSearch.bookingId);

          if (
            refreshedBooking &&
            isRestorableRide(refreshedBooking.ride_status, refreshedBooking.payment_status) &&
            refreshedBooking.assigned_driver
          ) {
            if (!isActiveRideFlowPath(pathname)) {
              router.replace({
                pathname: '/bookings/accept',
                params: {
                  bookingId: activeSearch.bookingId,
                  pickup: activeSearch.pickup,
                  pickupLat: activeSearch.pickupLat,
                  pickupLng: activeSearch.pickupLng,
                  dropoff: activeSearch.dropoff,
                  dropoffLat: activeSearch.dropoffLat,
                  dropoffLng: activeSearch.dropoffLng,
                },
              });
            }

            return;
          }
        }

        await clearActiveRideSearch();
        await restoreLatestActiveRide();
        return;
      }

      if (pathname !== '/bookings/Get-driver') {
        router.replace({
          pathname: '/bookings/Get-driver',
          params: {
            bookingId: activeSearch.bookingId,
            pickup: activeSearch.pickup,
            pickupLat: activeSearch.pickupLat,
            pickupLng: activeSearch.pickupLng,
            dropoff: activeSearch.dropoff,
            dropoffLat: activeSearch.dropoffLat,
            dropoffLng: activeSearch.dropoffLng,
          },
        });
      }
    } catch (error) {
      if (__DEV__) {
        console.log('[ActiveRideSearchBootstrap] restore failed', error);
      }
    } finally {
      isRestoringRef.current = false;
    }
  }, [fetchBooking, pathname, restoreLatestActiveRide, router]);

  useEffect(() => {
    void restoreActiveSearch();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const wasBackgrounded = /inactive|background/.test(appStateRef.current);
      appStateRef.current = nextAppState;

      if (wasBackgrounded && nextAppState === 'active') {
        void restoreActiveSearch();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [restoreActiveSearch]);

  return null;
}