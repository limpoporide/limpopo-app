import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  BackHandler,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import BookingMap from '../../src/components/bookings/booking-map';
import { useTheme } from '../../src/context/ThemeContext';
import RideCancel from '../../src/components/bookings/ride-cancel';
import {
  clearActiveRideSearch,
  expireOpenRideBooking,
  getRemainingRideSearchSeconds,
  LIVE_RIDE_SEARCH_DURATION_SECONDS,
  persistActiveRideSearch,
  readActiveRideSearch,
} from '../../src/lib/active-ride-search';
import { supabase } from '../../src/lib/supabase';

const DEFAULT_REGION = {
  latitude: 6.6742708,
  longitude: 3.3500354,
  latitudeDelta: 0.0422,
  longitudeDelta: 0.0321,
};

const PULSE_WAVE_COUNT = 3;
const NEARBY_DRIVERS_POLL_MS = 8000;
const EXIT_BACK_PRESS_WINDOW_MS = 2000;
const DRIVER_MAP_MARKER = require('../../assets/limpopo-car-icon.png');

type MarkerScreenPosition = {
  x: number;
  y: number;
};

type NearbyDriver = {
  uuid: string;
  first_name: string | null;
  last_name: string | null;
  profile_img: string | null;
  location_lat: number;
  location_lng: number;
};

const normalizeRouteParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
};

const parseCoordinateParam = (value?: string | string[]) => {
  const normalized = normalizeRouteParam(value);
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
};

const formatCountdownLabel = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export default function GetDriver() {
  const router = useRouter();
  const { bookingId, pickup, pickupLat, pickupLng, dropoff, dropoffLat, dropoffLng } = useLocalSearchParams<{
    bookingId?: string;
    pickup?: string;
    pickupLat?: string;
    pickupLng?: string;
    dropoff?: string;
    dropoffLat?: string;
    dropoffLng?: string;
  }>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [secondsRemaining, setSecondsRemaining] = useState(LIVE_RIDE_SEARCH_DURATION_SECONDS);
  const [hasSearchTimedOut, setHasSearchTimedOut] = useState(false);
  const [isRetryingSearch, setIsRetryingSearch] = useState(false);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [pickupMarkerPosition, setPickupMarkerPosition] = useState<MarkerScreenPosition | null>(null);
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  const pulseWaves = useRef(
    Array.from({ length: PULSE_WAVE_COUNT }, () => new Animated.Value(0))
  ).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const lastBackPressRef = useRef(0);
  const markerSyncFrameRef = useRef<number | null>(null);
  const markerSyncInFlightRef = useRef(false);
  const isStatusMutationInFlightRef = useRef(false);
  const hasHandledTimeoutRef = useRef(false);
  const resolvedBookingId = normalizeRouteParam(bookingId).trim();
  const pickupLabel = normalizeRouteParam(pickup);
  const pickupCoordinate = {
    latitude: parseCoordinateParam(pickupLat) ?? DEFAULT_REGION.latitude,
    longitude: parseCoordinateParam(pickupLng) ?? DEFAULT_REGION.longitude,
  };
  const pickupRegion = {
    latitude: pickupCoordinate.latitude,
    longitude: pickupCoordinate.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };
  const activeRideSearch = {
    bookingId: resolvedBookingId,
    pickup: pickupLabel,
    pickupLat: String(pickupCoordinate.latitude),
    pickupLng: String(pickupCoordinate.longitude),
    dropoff: normalizeRouteParam(dropoff),
    dropoffLat: normalizeRouteParam(dropoffLat),
    dropoffLng: normalizeRouteParam(dropoffLng),
  };

  useEffect(() => {
    if (__DEV__) {
      console.log('[Get Driver Params]:', {
        rawParams: {
          bookingId,
          pickup,
          pickupLat,
          pickupLng,
          dropoff,
          dropoffLat,
          dropoffLng,
        },
        resolvedParams: {
          bookingId: resolvedBookingId,
          pickup: pickupLabel,
          pickupCoords: pickupCoordinate,
        },
      });
    }
  }, [bookingId, pickup, pickupLat, pickupLng, dropoff, dropoffLat, dropoffLng, resolvedBookingId, pickupLabel, pickupCoordinate.latitude, pickupCoordinate.longitude]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const now = Date.now();

      if (now - lastBackPressRef.current < EXIT_BACK_PRESS_WINDOW_MS) {
        BackHandler.exitApp();
        return true;
      }

      lastBackPressRef.current = now;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      return true;
    });

    return () => {
      backSubscription.remove();
    };
  }, []);

  const syncPickupMarkerPosition = useCallback(async () => {
    if (!mapRef.current || markerSyncInFlightRef.current) {
      return;
    }

    markerSyncInFlightRef.current = true;

    try {
      const markerPosition = await mapRef.current.pointForCoordinate(pickupCoordinate);
      setPickupMarkerPosition(markerPosition);
    } catch {
      setPickupMarkerPosition(null);
    } finally {
      markerSyncInFlightRef.current = false;
    }
  }, [pickupCoordinate]);

  const schedulePickupMarkerSync = useCallback(() => {
    if (markerSyncFrameRef.current !== null) {
      cancelAnimationFrame(markerSyncFrameRef.current);
    }

    markerSyncFrameRef.current = requestAnimationFrame(() => {
      markerSyncFrameRef.current = null;
      syncPickupMarkerPosition();
    });
  }, [syncPickupMarkerPosition]);

  const stopCountdown = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const progress = Math.round((secondsRemaining / LIVE_RIDE_SEARCH_DURATION_SECONDS) * 100);

  const startCountdown = (initialSeconds = LIVE_RIDE_SEARCH_DURATION_SECONDS) => {
    stopCountdown();
    hasHandledTimeoutRef.current = initialSeconds <= 0;
    setHasSearchTimedOut(initialSeconds <= 0);
    setSecondsRemaining(initialSeconds);

    if (initialSeconds <= 0) {
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsRemaining((currentSeconds: number) => {
        if (currentSeconds <= 1) {
          stopCountdown();
          setHasSearchTimedOut(true);
          return 0;
        }

        return currentSeconds - 1;
      });
    }, 1000);
  };

  const retryDriverSearch = useCallback(async () => {
    if (!resolvedBookingId || isRetryingSearch) {
      return;
    }

    setIsRetryingSearch(true);

    try {
      const { data, error } = await supabase.functions.invoke('notify-new-booking-drivers', {
        method: 'POST',
        body: {
          type: 'INSERT',
          table: 'rider_booking',
          schema: 'public',
          record: { id: resolvedBookingId },
          old_record: null,
        },
      });

      if (error) {
        throw error;
      }

      const responseError = typeof data?.error === 'string' ? data.error : null;

      if (responseError) {
        throw new Error(responseError);
      }

      if (data?.skipped === 'booking_not_eligible') {
        throw new Error('This ride request is no longer available for retry.');
      }

      await persistActiveRideSearch({
        ...activeRideSearch,
        startedAt: new Date().toISOString(),
      });

      startCountdown();
    } catch (error) {
      Alert.alert(
        'Unable to retry search',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsRetryingSearch(false);
    }
  }, [activeRideSearch, isRetryingSearch, resolvedBookingId]);


  const updateBookingStatus = useCallback(
    async (nextStatus: 'cancelled' | 'expired') => {
      if (!resolvedBookingId || isStatusMutationInFlightRef.current) {
        return false;
      }

      isStatusMutationInFlightRef.current = true;

      try {
        const query = supabase
          .from('rider_booking')
          .update({ ride_status: nextStatus })
          .eq('id', resolvedBookingId)
          .in('ride_status', nextStatus === 'cancelled' ? ['open', 'accepted', 'arrived'] : ['open']);

        const guardedQuery =
          nextStatus === 'expired' ? query.is('assigned_driver', null) : query;

        const { data, error } = await guardedQuery.select('id').maybeSingle();

        if (error) {
          throw error;
        }

        return Boolean(data);
      } finally {
        isStatusMutationInFlightRef.current = false;
      }
    },
    [resolvedBookingId]
  );

  const hasNavigatedToAcceptRef = useRef(false);

  const navigateToAcceptScreen = useCallback(() => {
    if (hasNavigatedToAcceptRef.current) {
      return;
    }

    hasNavigatedToAcceptRef.current = true;
    stopCountdown();
    void clearActiveRideSearch();

    router.replace({
      pathname: '/bookings/accept',
      params: {
        bookingId: resolvedBookingId,
        pickup: pickupLabel,
        pickupLat: String(pickupCoordinate.latitude),
        pickupLng: String(pickupCoordinate.longitude),
        dropoff: normalizeRouteParam(dropoff),
        dropoffLat: normalizeRouteParam(dropoffLat),
        dropoffLng: normalizeRouteParam(dropoffLng),
      },
    });
  }, [resolvedBookingId, pickupLabel, pickupCoordinate.latitude, pickupCoordinate.longitude, dropoff, dropoffLat, dropoffLng, router]);

  // Watches for a driver accepting this booking so the rider is pushed
  // forward instead of waiting on the countdown to expire.
  useEffect(() => {
    if (!resolvedBookingId) {
      return;
    }

    let isMounted = true;

    const checkCurrentStatus = async () => {
      const { data, error } = await supabase
        .from('rider_booking')
        .select('ride_status, assigned_driver')
        .eq('id', resolvedBookingId)
        .maybeSingle();

      if (!error && isMounted && data?.ride_status === 'accepted' && data?.assigned_driver) {
        navigateToAcceptScreen();
      }
    };

    checkCurrentStatus();

    const channel = supabase
      .channel(`rider_booking_status:${resolvedBookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rider_booking',
          filter: `id=eq.${resolvedBookingId}`,
        },
        (payload) => {
          const updatedBooking = payload.new as { ride_status?: string; assigned_driver?: string | null };

          if (updatedBooking.ride_status === 'accepted' && updatedBooking.assigned_driver) {
            navigateToAcceptScreen();
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [resolvedBookingId, navigateToAcceptScreen]);

  useEffect(() => {
    let isMounted = true;

    const initializeSearchCountdown = async () => {
      if (!resolvedBookingId) {
        return;
      }

      const persistedSearch = await readActiveRideSearch();
      const isCurrentSearch = persistedSearch?.bookingId === resolvedBookingId;
      const startedAt = isCurrentSearch ? persistedSearch.startedAt : new Date().toISOString();

      if (!isCurrentSearch) {
        await persistActiveRideSearch({
          ...activeRideSearch,
          startedAt,
        });
      }

      if (!isMounted) {
        return;
      }

      const remainingSeconds = getRemainingRideSearchSeconds(startedAt, LIVE_RIDE_SEARCH_DURATION_SECONDS);
      startCountdown(remainingSeconds);
    };

    initializeSearchCountdown();

    const pulseAnimations = pulseWaves.map((wave, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 420),
          Animated.timing(wave, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(wave, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      )
    );

    pulseAnimations.forEach((animation) => animation.start());

    return () => {
      isMounted = false;
      stopCountdown();
      pulseAnimations.forEach((animation) => animation.stop());
    };
  }, [activeRideSearch, pulseWaves, resolvedBookingId]);

  useEffect(() => {
    if (!hasSearchTimedOut || hasHandledTimeoutRef.current || !resolvedBookingId) {
      return;
    }

    hasHandledTimeoutRef.current = true;

    const handleSearchTimeout = async () => {
      try {
        await expireOpenRideBooking(resolvedBookingId);
      } catch (error) {
        if (__DEV__) {
          console.log('[Get Driver] expire booking failed', {
            bookingId: resolvedBookingId,
            error,
          });
        }
      } finally {
        await clearActiveRideSearch();
      }
    };

    void handleSearchTimeout();
  }, [hasSearchTimedOut, resolvedBookingId]);

  useEffect(() => {
    schedulePickupMarkerSync();

    return () => {
      if (markerSyncFrameRef.current !== null) {
        cancelAnimationFrame(markerSyncFrameRef.current);
        markerSyncFrameRef.current = null;
      }
    };
  }, [schedulePickupMarkerSync]);

  useEffect(() => {
    let isMounted = true;

    const loadNearbyDrivers = async () => {
      const { data, error } = await supabase.rpc('get_nearby_online_drivers');

      if (!isMounted) {
        return;
      }

      if (error) {
        if (__DEV__) {
          console.warn('[Nearby Drivers Error]:', error);
        }
        return;
      }

      setNearbyDrivers((data ?? []) as NearbyDriver[]);
    };

    loadNearbyDrivers();
    const pollInterval = setInterval(loadNearbyDrivers, NEARBY_DRIVERS_POLL_MS);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, []);

  return (
    <View style={styles.container}>
      <BookingMap
        ref={mapRef}
        style={styles.map}
        initialRegion={pickupRegion}
        focusCoordinates={[
          {
            latitude: pickupCoordinate.latitude,
            longitude: pickupCoordinate.longitude,
          },
        ]}
        onMapReady={schedulePickupMarkerSync}
        onRegionChange={schedulePickupMarkerSync}
        onRegionChangeComplete={schedulePickupMarkerSync}
      >
        {nearbyDrivers.map((driver) => (
          <Marker
            key={driver.uuid}
            coordinate={{ latitude: driver.location_lat, longitude: driver.location_lng }}
            title={driver.first_name || 'Pilot'}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={15}
          >
            <View collapsable={false} style={styles.nearbyDriverMarkerShell}>
              <Image source={DRIVER_MAP_MARKER} style={styles.nearbyDriverMarkerImage} resizeMode="contain" />
            </View>
          </Marker>
        ))}
      </BookingMap>

      <View pointerEvents="none" style={styles.centerMarkerOverlay}>
        <View
          style={[
            styles.markerContainer,
            pickupMarkerPosition
              ? {
                  left: pickupMarkerPosition.x,
                  top: pickupMarkerPosition.y,
                }
              : styles.markerContainerCentered,
          ]}
        >
          {pulseWaves.map((wave, index) => (
            <Animated.View
              key={index}
              style={[
                styles.pulseRing,
                {
                  borderColor: theme.colors.primary,
                  opacity: wave.interpolate({
                    inputRange: [0, 0.2, 1],
                    outputRange: [0, 0.45, 0],
                  }),
                  transform: [
                    {
                      scale: wave.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.7, Platform.OS === 'android' ? 5.4 : 4.4],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
          <View style={[styles.markerCore, { backgroundColor: theme.colors.primary }]}>
            <Ionicons name="radio-button-on" size={16} color="#FFFFFF" />
          </View>
        </View>
      </View>

      <SafeAreaView style={styles.overlay} edges={['top']}>
        <View style={[styles.header, { backgroundColor: theme.colors.background }]}> 
          <View style={styles.backButton} />
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Get Pilot</Text>
          <View style={styles.backButton} />
        </View>
      </SafeAreaView>

      <View
        style={[
          styles.drawer,
          {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.border,
            paddingBottom: insets.bottom + 18,
          },
        ]}
      >
        <View style={[styles.drawerHandle, { backgroundColor: theme.colors.border }]} />
        <Text style={[styles.drawerTitle, { color: theme.colors.text }]}>Searching for your pilot</Text>
        <Text style={[styles.drawerSubtitle, { color: theme.colors.textSecondary }]}>
          {hasSearchTimedOut
            ? 'No pilot accepted yet. Retry the search or cancel this request.'
            : 'Please wait while we connect you to the nearest available executive ride.'}
        </Text>

        <View style={[styles.progressTrack, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: theme.colors.primary,
                width: `${progress}%`,
              },
            ]}
          />
        </View>

        <Text
          style={[
            styles.countdownLabel,
            { color: hasSearchTimedOut ? theme.colors.error : theme.colors.primary },
          ]}
        >
          {hasSearchTimedOut
            ? 'Search timed out'
            : `Time remaining ${formatCountdownLabel(secondsRemaining)}`}
        </Text>

        <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}> 
          {hasSearchTimedOut ? 'No pilot found yet' : `${progress}%`}
        </Text>

        {hasSearchTimedOut ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
              onPress={retryDriverSearch}
              disabled={isRetryingSearch}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
                {isRetryingSearch ? 'Retrying...' : 'Retry'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelActionButton, { borderColor: theme.colors.error }]}
              onPress={() => setIsCancelModalVisible(true)}
            >
              <Text style={[styles.cancelButtonText, { color: theme.colors.error }]}>Cancel request</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: theme.colors.error }]}
            onPress={() => setIsCancelModalVisible(true)}
          >
            <Text style={[styles.cancelButtonText, { color: theme.colors.error }]}>Cancel request</Text>
          </TouchableOpacity>
        )}
      </View>

      <RideCancel
        visible={isCancelModalVisible}
        onClose={() => setIsCancelModalVisible(false)}
        onSubmit={async (reason) => {
          setIsCancelModalVisible(false);

          try {
            const didCancel = await updateBookingStatus('cancelled');

            if (!didCancel) {
              throw new Error('This ride can no longer be cancelled from this screen.');
            }

            await clearActiveRideSearch();

            Alert.alert('Cancelled successfully', 'Your ride request has been cancelled.', [
              {
                text: 'OK',
                onPress: () => router.replace('/(tabs)/home'),
              },
            ]);
          } catch (error) {
            if (__DEV__) {
              console.log('[Get Driver] RideCancel failed', {
                bookingId: resolvedBookingId,
                reason,
                error,
              });
            }
            Alert.alert(
              'Unable to cancel booking',
              error instanceof Error ? error.message : 'Please try again.'
            );
          }
        }}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  centerMarkerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  nearbyDriverMarkerShell: {
    width: 32,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  nearbyDriverMarkerImage: {
    width: 22,
    height: 46,
  },
  header: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  markerContainer: {
    position: 'absolute',
    width: Platform.OS === 'android' ? 176 : 132,
    height: Platform.OS === 'android' ? 176 : 132,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Platform.OS === 'android' ? -88 : -66,
    marginTop: Platform.OS === 'android' ? -88 : -66,
  },
  markerContainerCentered: {
    left: '50%',
    top: '50%',
  },
  pulseRing: {
    position: 'absolute',
    width: Platform.OS === 'android' ? 36 : 30,
    height: Platform.OS === 'android' ? 36 : 30,
    borderRadius: Platform.OS === 'android' ? 18 : 15,
    borderWidth: Platform.OS === 'android' ? 3 : 2.5,
  },
  markerCore: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    minHeight: 240,
  },
  drawerHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    marginBottom: 18,
  },
  drawerTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  drawerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressLabel: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  countdownLabel: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  cancelActionButton: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
