import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  BackHandler,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  Image,
  Platform,
  ToastAndroid,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useTheme } from '../../src/context/ThemeContext';
import BookingMap from '../../src/components/bookings/booking-map';
import VehicleModalFeatures from '../../src/components/bookings/vehicle-modal-features';
import QuickWallet from '../../src/components/quick_wallet';
import { saveScheduledSavedRoute } from '../../src/lib/scheduled-saved-routes';
import { fetchRiderProfile, getCachedRiderProfile } from '../../src/lib/rider-profile';
import { supabase } from '../../src/lib/supabase';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DEFAULT_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};
const GOOGLE_DIRECTIONS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const DEFAULT_VEHICLE_IMAGE = require('../../assets/slide1.png');
const LIMPOPO_PRO_IMAGE = require('../../assets/wuling-pro.png');
const EXIT_BACK_PRESS_WINDOW_MS = 2000;
const DRAWER_HEIGHTS = {
  contracted: SCREEN_HEIGHT * 0.3,
  expanded: SCREEN_HEIGHT * (Platform.OS === 'android' ? 0.7 : 0.6),
} as const;
const MAP_FOCUS_EDGE_PADDING = {
  top: 140,
  right: 72,
  bottom: 320,
  left: 72,
} as const;

// ============================================
// VEHICLE DATA
// ============================================
const vehicleOptions = [
  {
    id: '1',
    name: 'Limpopo Pro',
    type: 'Economy',
    time: '5 mins',
    passengers: 4,
    seats: 4,
    priceNaira: 2500,
    imageSource: LIMPOPO_PRO_IMAGE,
  },
  {
    id: '2',
    name: 'Limpopo Promax',
    type: 'Business',
    time: '8 mins',
    passengers: 4,
    seats: 4,
    priceNaira: 4500,
    imageSource: DEFAULT_VEHICLE_IMAGE,
  },
  {
    id: '3',
    name: 'Limpopo Comfort',
    type: 'First Class',
    description: 'SUV Vehicle',
    badge: 'Coming Soon!',
    time: '10 mins',
    passengers: 6,
    seats: 6,
    priceNaira: 5500,
    imageSource: DEFAULT_VEHICLE_IMAGE,
  },
];

type DrawerHeight = 'contracted' | 'expanded';
type PaymentMethod = 'wallet' | 'directTransfer';
type RoutePoint = {
  latitude: number;
  longitude: number;
};

type RideFor = 'me' | 'someoneElse';

type StopDetails = {
  value: string;
};

type VehiclePricingRow = {
  id: string;
  vehicle_type: 'Limpopo Pro' | 'Limpopo Promax' | 'Limpopo Comfort';
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  delay_price_per_min: number;
  vat_percentage: number;
  state_levy: number;
  is_active: boolean;
};

type MarkerScreenPosition = {
  x: number;
  y: number;
};

type RouteMetrics = {
  etaText: string | null;
  distanceText: string | null;
  pickupCoords: RoutePoint | null;
  dropoffCoords: RoutePoint | null;
  polylineCoords: RoutePoint[];
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

const parseDistanceTextToKm = (value: string | null) => {
  if (!value) {
    return null;
  }

  const normalizedValue = value.replace(/,/g, '').trim().toLowerCase();
  const numericValue = Number.parseFloat(normalizedValue);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  if (normalizedValue.includes('km')) {
    return numericValue;
  }

  if (normalizedValue.includes('m')) {
    return Number((numericValue / 1000).toFixed(2));
  }

  return numericValue;
};

const parseDurationTextToMinutes = (value: string | null) => {
  if (!value) {
    return null;
  }

  const hoursMatch = value.match(/(\d+)\s*hour/);
  const minutesMatch = value.match(/(\d+)\s*min/);
  const hours = hoursMatch ? Number.parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? Number.parseInt(minutesMatch[1], 10) : 0;
  const totalMinutes = hours * 60 + minutes;

  return totalMinutes > 0 ? totalMinutes : null;
};

const parseStopDetails = (value?: string | string[]): StopDetails[] => {
  const normalized = normalizeRouteParam(value);

  if (!normalized) {
    return [];
  }

  try {
    const parsed = JSON.parse(normalized);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (typeof entry === 'string') {
          return { value: entry };
        }

        if (entry && typeof entry === 'object' && typeof entry.value === 'string') {
          return { value: entry.value };
        }

        return null;
      })
      .filter((entry): entry is StopDetails => Boolean(entry?.value.trim()));
  } catch {
    return [];
  }
};

const roundCurrency = (value: number) => Number(value.toFixed(2));
const roundUpToNearestHundred = (value: number) => Math.ceil(value / 100) * 100;
const formatWholeNaira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

const parseVehiclePricingParam = (value?: string | string[]): VehiclePricingRow[] => {
  const normalized = normalizeRouteParam(value);

  if (!normalized) {
    return [];
  }

  try {
    const parsed = JSON.parse(normalized);

    return Array.isArray(parsed) ? (parsed as VehiclePricingRow[]) : [];
  } catch {
    return [];
  }
};

const computeFareBreakdown = (pricing: VehiclePricingRow, distanceKm: number, durationMin: number) => {
  const baseFare = roundCurrency(Number(pricing.base_fare));
  const distanceFare = roundCurrency(distanceKm * Number(pricing.price_per_km));
  const timeFare = roundCurrency(durationMin * Number(pricing.price_per_min));
  const delayFare = 0;
  const amount = roundCurrency(baseFare + distanceFare + timeFare + delayFare);
  const vatAmount = roundCurrency((amount * Number(pricing.vat_percentage)) / 100);
  const stateLevy = roundCurrency(Number(pricing.state_levy));
  const totalFare = roundUpToNearestHundred(amount + vatAmount + stateLevy);

  return { baseFare, distanceFare, timeFare, delayFare, amount, vatAmount, stateLevy, totalFare };
};

const createRegionFromRoutePoints = (pickupCoords: RoutePoint, dropoffCoords: RoutePoint) => {
  const latitudeDelta = Math.max(Math.abs(pickupCoords.latitude - dropoffCoords.latitude) * 1.8, 0.02);
  const longitudeDelta = Math.max(Math.abs(pickupCoords.longitude - dropoffCoords.longitude) * 1.8, 0.02);

  return {
    latitude: (pickupCoords.latitude + dropoffCoords.latitude) / 2,
    longitude: (pickupCoords.longitude + dropoffCoords.longitude) / 2,
    latitudeDelta,
    longitudeDelta,
  };
};

const decodeGooglePolyline = (encoded: string): RoutePoint[] => {
  const coordinates: RoutePoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return coordinates;
};

const fetchRouteMetrics = async (origin: string, destination: string): Promise<RouteMetrics | null> => {
  if (!GOOGLE_DIRECTIONS_API_KEY) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      origin,
      destination,
      mode: 'driving',
      departure_time: 'now',
      region: 'ng',
      key: GOOGLE_DIRECTIONS_API_KEY,
    });

    const response = await fetch(`${GOOGLE_DIRECTIONS_URL}?${params.toString()}`);
    const payload = await response.json();
    const route = payload.routes?.[0];
    const leg = payload.routes?.[0]?.legs?.[0];

    if (!leg) {
      if (__DEV__ && payload.status && payload.status !== 'ZERO_RESULTS') {
        console.warn('[Google Directions Error]:', JSON.stringify(payload, null, 2));
      }
      return null;
    }

    return {
      etaText: leg.duration_in_traffic?.text ?? leg.duration?.text ?? null,
      distanceText: leg.distance?.text ?? null,
      pickupCoords: leg.start_location
        ? {
            latitude: leg.start_location.lat,
            longitude: leg.start_location.lng,
          }
        : null,
      dropoffCoords: leg.end_location
        ? {
            latitude: leg.end_location.lat,
            longitude: leg.end_location.lng,
          }
        : null,
      polylineCoords: route?.overview_polyline?.points
        ? decodeGooglePolyline(route.overview_polyline.points)
        : [],
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[Google Directions Network Error]:', String(error));
    }

    return null;
  }
};

export default function VehicleDetails() {
  const router = useRouter();
  const { pickup, dropoff, pickupLat, pickupLng, dropoffLat, dropoffLng, stops, rideFor, guestRiderName, guestRiderNumber, vehiclePricing } = useLocalSearchParams<{
    pickup?: string;
    dropoff?: string;
    pickupLat?: string;
    pickupLng?: string;
    dropoffLat?: string;
    dropoffLng?: string;
    stops?: string;
    rideFor?: RideFor;
    guestRiderName?: string;
    guestRiderNumber?: string;
    vehiclePricing?: string;
  }>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const resolvedPickup = normalizeRouteParam(pickup);
  const resolvedDropoff = normalizeRouteParam(dropoff);
  const [drawerHeight, setDrawerHeight] = useState<DrawerHeight>('expanded');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wallet');
  const [selectedVehicle, setSelectedVehicle] = useState(vehicleOptions[0]);
  const [isVehicleModalVisible, setIsVehicleModalVisible] = useState(false);
  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics | null>(null);
  const [isRouteMetricsLoading, setIsRouteMetricsLoading] = useState(false);
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [isMapInteracting, setIsMapInteracting] = useState(false);
  const [isQuickWalletVisible, setIsQuickWalletVisible] = useState(false);
  const useOverlayMarkers = Platform.OS === 'android';
  const [hasMarkerPosition, setHasMarkerPosition] = useState(false);
  const pickupMarkerAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dropoffMarkerAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const hasMarkerAnimInitRef = useRef(false);
  const lastBackPressRef = useRef(0);
  const animatedDrawerHeight = useRef(new Animated.Value(DRAWER_HEIGHTS.expanded)).current;
  const dragStartHeight = useRef(DRAWER_HEIGHTS.expanded);
  const mapRef = useRef<MapView | null>(null);
  const markerSyncFrameRef = useRef<number | null>(null);
  const markerSyncInFlightRef = useRef(false);
  const stopDetails = parseStopDetails(stops);
  const firstStop = stopDetails[0] ?? null;
  const isGuestRide = rideFor === 'someoneElse';
  const normalizedGuestRiderName = normalizeRouteParam(guestRiderName).trim();
  const normalizedGuestRiderNumber = normalizeRouteParam(guestRiderNumber).trim();
  const passedVehiclePricing = parseVehiclePricingParam(vehiclePricing);
  const pickupParamCoords = {
    latitude: parseCoordinateParam(pickupLat) ?? DEFAULT_REGION.latitude,
    longitude: parseCoordinateParam(pickupLng) ?? DEFAULT_REGION.longitude,
  };
  const dropoffParamCoords = {
    latitude: parseCoordinateParam(dropoffLat) ?? DEFAULT_REGION.latitude - 0.059,
    longitude: parseCoordinateParam(dropoffLng) ?? DEFAULT_REGION.longitude + 0.0272,
  };
  const pickupMarkerCoords = routeMetrics?.pickupCoords ?? pickupParamCoords;
  const dropoffMarkerCoords = routeMetrics?.dropoffCoords ?? dropoffParamCoords;
  const mapRegion = routeMetrics?.pickupCoords && routeMetrics?.dropoffCoords
    ? createRegionFromRoutePoints(routeMetrics.pickupCoords, routeMetrics.dropoffCoords)
    : DEFAULT_REGION;
  const estimateDistanceKm = parseDistanceTextToKm(routeMetrics?.distanceText ?? null) ?? 0;
  const estimateDurationMin = parseDurationTextToMinutes(routeMetrics?.etaText ?? null) ?? 0;
  const vehiclePriceEstimates = vehicleOptions.reduce<Record<string, number>>((estimates, vehicle) => {
    const pricing = passedVehiclePricing.find((row) => row.vehicle_type === vehicle.name);

    if (pricing) {
      estimates[vehicle.name] = computeFareBreakdown(pricing, estimateDistanceKm, estimateDurationMin).totalFare;
    }

    return estimates;
  }, {});

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

  useEffect(() => {
    if (__DEV__) {
      console.log('[Vehicle Details Params]:', {
        rawParams: {
          pickup,
          dropoff,
          pickupLat,
          pickupLng,
          dropoffLat,
          dropoffLng,
          stops,
          rideFor,
          guestRiderName,
          guestRiderNumber,
        },
        resolvedParams: {
          pickup: resolvedPickup,
          dropoff: resolvedDropoff,
          pickupCoords: pickupParamCoords,
          dropoffCoords: dropoffParamCoords,
          firstStop,
          isGuestRide,
        },
      });
    }
  }, [
    pickup,
    dropoff,
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
    stops,
    rideFor,
    guestRiderName,
    guestRiderNumber,
    resolvedPickup,
    resolvedDropoff,
    firstStop,
    isGuestRide,
    pickupParamCoords.latitude,
    pickupParamCoords.longitude,
    dropoffParamCoords.latitude,
    dropoffParamCoords.longitude,
  ]);

  const syncMarkerPositions = useCallback(async () => {
    if (!useOverlayMarkers || !mapRef.current || markerSyncInFlightRef.current) {
      return;
    }

    markerSyncInFlightRef.current = true;

    try {
      const [pickupPosition, dropoffPosition] = await Promise.all([
        mapRef.current.pointForCoordinate(pickupMarkerCoords),
        mapRef.current.pointForCoordinate(dropoffMarkerCoords),
      ]);

      if (!hasMarkerAnimInitRef.current) {
        hasMarkerAnimInitRef.current = true;
        pickupMarkerAnim.setValue(pickupPosition);
        dropoffMarkerAnim.setValue(dropoffPosition);
      } else {
        Animated.timing(pickupMarkerAnim, {
          toValue: pickupPosition,
          duration: 160,
          useNativeDriver: false,
        }).start();
        Animated.timing(dropoffMarkerAnim, {
          toValue: dropoffPosition,
          duration: 160,
          useNativeDriver: false,
        }).start();
      }

      setHasMarkerPosition(true);
    } catch {
      setHasMarkerPosition(false);
    } finally {
      markerSyncInFlightRef.current = false;
    }
  }, [dropoffMarkerCoords, dropoffMarkerAnim, pickupMarkerCoords, pickupMarkerAnim, useOverlayMarkers]);

  const scheduleMarkerPositionSync = useCallback(() => {
    if (!useOverlayMarkers) {
      return;
    }

    if (markerSyncFrameRef.current !== null) {
      cancelAnimationFrame(markerSyncFrameRef.current);
    }

    markerSyncFrameRef.current = requestAnimationFrame(() => {
      markerSyncFrameRef.current = null;
      syncMarkerPositions();
    });
  }, [syncMarkerPositions, useOverlayMarkers]);

  useEffect(() => {
    if (!resolvedPickup.trim() || !resolvedDropoff.trim()) {
      setRouteMetrics(null);
      setIsRouteMetricsLoading(false);
      return;
    }

    let isCancelled = false;

    setIsRouteMetricsLoading(true);

    fetchRouteMetrics(resolvedPickup, resolvedDropoff)
      .then((metrics) => {
        if (!isCancelled) {
          setRouteMetrics(metrics);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsRouteMetricsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [resolvedDropoff, resolvedPickup]);

  useEffect(() => {
    if (!useOverlayMarkers) {
      return;
    }

    scheduleMarkerPositionSync();

    return () => {
      if (markerSyncFrameRef.current !== null) {
        cancelAnimationFrame(markerSyncFrameRef.current);
        markerSyncFrameRef.current = null;
      }
    };
  }, [scheduleMarkerPositionSync, useOverlayMarkers]);

  const clampDrawerHeight = (height: number) => {
    return Math.min(DRAWER_HEIGHTS.expanded, Math.max(DRAWER_HEIGHTS.contracted, height));
  };

  const resolveNearestSnapPoint = (height: number): DrawerHeight => {
    const entries: Array<[DrawerHeight, number]> = [
      ['contracted', DRAWER_HEIGHTS.contracted],
      ['expanded', DRAWER_HEIGHTS.expanded],
    ];

    return entries.reduce((closest, current) => {
      const closestDistance = Math.abs(height - closest[1]);
      const currentDistance = Math.abs(height - current[1]);
      return currentDistance < closestDistance ? current : closest;
    })[0];
  };

  const animateDrawerTo = (nextHeight: DrawerHeight) => {
    const targetHeight = DRAWER_HEIGHTS[nextHeight];
    setDrawerHeight(nextHeight);
    dragStartHeight.current = targetHeight;

    Animated.spring(animatedDrawerHeight, {
      toValue: targetHeight,
      useNativeDriver: false,
      damping: 18,
      stiffness: 160,
      mass: 0.7,
    }).start();
  };

  const handleVehiclePress = (vehicle: (typeof vehicleOptions)[number]) => {
    setSelectedVehicle(vehicle);
  };

  const handleVehicleImagePress = (vehicle: (typeof vehicleOptions)[number]) => {
    setSelectedVehicle(vehicle);
    setIsVehicleModalVisible(true);
  };

  const navigateToGetDriver = async () => {
    if (selectedVehicle.badge || isCreatingBooking) {
      if (selectedVehicle.badge) {
        Alert.alert('Vehicle unavailable', `${selectedVehicle.name} is not available for booking yet.`);
      }
      return;
    }

    if (!resolvedPickup.trim() || !resolvedDropoff.trim()) {
      Alert.alert('Incomplete trip', 'Pickup and drop-off addresses are required before booking.');
      return;
    }

    setIsCreatingBooking(true);

    try {
      const cachedProfile = await getCachedRiderProfile();
      const profile = (await fetchRiderProfile()) ?? cachedProfile;

      if (!profile?.uuid) {
        throw new Error('Please sign in again before making a booking.');
      }

      if (!profile.phone.trim()) {
        throw new Error('Please complete your profile phone number before making a booking.');
      }

      const riderName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();

      if (!riderName) {
        throw new Error('Please complete your profile name before making a booking.');
      }

      const totalKm = parseDistanceTextToKm(routeMetrics?.distanceText ?? null);
      const totalTime = parseDurationTextToMinutes(routeMetrics?.etaText ?? null);
      const { data: pricing, error: pricingError } = await supabase
        .from('vehicle_pricing')
        .select('id, vehicle_type, base_fare, price_per_km, price_per_min, delay_price_per_min, vat_percentage, state_levy, is_active')
        .eq('vehicle_type', selectedVehicle.name)
        .eq('is_active', true)
        .single<VehiclePricingRow>();

      if (pricingError || !pricing) {
        throw pricingError ?? new Error('Pricing is unavailable for this vehicle right now.');
      }

      const fareBreakdown = computeFareBreakdown(pricing, totalKm ?? 0, totalTime ?? 0);

      const baseFare = fareBreakdown.baseFare;
      const distanceFare = fareBreakdown.distanceFare;
      const timeFare = fareBreakdown.timeFare;
      const delayFare = fareBreakdown.delayFare;
      const amount = fareBreakdown.amount;
      const vatAmount = fareBreakdown.vatAmount;
      const stateLevy = fareBreakdown.stateLevy;
      const totalFare = fareBreakdown.totalFare;

      const nextRideStatus = 'open' as const;

      const { data: booking, error } = await supabase
        .from('rider_booking')
        .insert({
        rider_id: profile.uuid,
        assigned_driver: null,
        pricing_id: pricing.id,
        pick_up: resolvedPickup,
        pickup_lat: pickupMarkerCoords.latitude,
        pickup_lng: pickupMarkerCoords.longitude,
        drop_off: resolvedDropoff,
        drop_lat: dropoffMarkerCoords.latitude,
        drop_lng: dropoffMarkerCoords.longitude,
        add_stop: firstStop?.value ?? null,
        addstop_lat: null,
        addstop_lng: null,
        guest_rider: isGuestRide,
        guest_rider_name: isGuestRide ? normalizedGuestRiderName || null : null,
        guest_rider_number: isGuestRide ? normalizedGuestRiderNumber || null : null,
        total_km: totalKm,
        total_time: totalTime,
        base_fare: baseFare,
        distance_fare: distanceFare,
        time_fare: timeFare,
        delay_fare: delayFare,
        amount,
        vat_amount: vatAmount,
        state_levy: stateLevy,
        total_fare: totalFare,
        payment_method: paymentMethod === 'directTransfer' ? 'transfer' : 'wallet',
        vehicle_type: pricing.vehicle_type,
        ride_status: nextRideStatus,
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      if (nextRideStatus === 'open') {
        try {
          await saveScheduledSavedRoute(
            resolvedPickup,
            resolvedDropoff,
            stopDetails.map((stop) => stop.value),
            {
              pickupCoords: pickupMarkerCoords,
              dropoffCoords: dropoffMarkerCoords,
            }
          );
        } catch (storageError) {
          console.warn('[LiveBooking] Saved route cache failed', storageError);
        }
      }

      router.push({
        pathname: '/bookings/Get-driver',
        params: {
          bookingId: booking.id,
          pickup: resolvedPickup,
          pickupLat: String(pickupMarkerCoords.latitude),
          pickupLng: String(pickupMarkerCoords.longitude),
          dropoff: resolvedDropoff,
          dropoffLat: String(dropoffMarkerCoords.latitude),
          dropoffLng: String(dropoffMarkerCoords.longitude),
        },
      });
    } catch (error) {
      Alert.alert(
        'Unable to create booking',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsCreatingBooking(false);
    }
  };

  const handleMapInteractionStart = () => {
    if (!useOverlayMarkers) {
      return;
    }

    setIsMapInteracting(true);
  };

  const handleMapInteractionEnd = () => {
    if (!useOverlayMarkers) {
      return;
    }

    setIsMapInteracting(false);
    scheduleMarkerPositionSync();
  };

  const drawerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderGrant: () => {
        animatedDrawerHeight.stopAnimation((value) => {
          dragStartHeight.current = value;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        const nextHeight = clampDrawerHeight(dragStartHeight.current - gestureState.dy);
        animatedDrawerHeight.setValue(nextHeight);
      },
      onPanResponderRelease: (_, gestureState) => {
        const releasedHeight = clampDrawerHeight(dragStartHeight.current - gestureState.dy);
        const nearestSnapPoint = resolveNearestSnapPoint(releasedHeight);
        animateDrawerTo(nearestSnapPoint);
      },
      onPanResponderTerminate: (_, gestureState) => {
        const releasedHeight = clampDrawerHeight(dragStartHeight.current - gestureState.dy);
        const nearestSnapPoint = resolveNearestSnapPoint(releasedHeight);
        animateDrawerTo(nearestSnapPoint);
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <StatusBar style={theme.mode === 'dark' ? 'dark' : 'light'} />

      {/* ============================================ */}
      {/* MAP SECTION */}
      {/* ============================================ */}
      <View style={styles.mapContainer}>
        <BookingMap
          ref={mapRef}
          style={styles.map}
          useGoogleProvider={Platform.OS === 'android'}
          initialRegion={mapRegion}
          focusCoordinates={[pickupMarkerCoords, dropoffMarkerCoords]}
          focusEdgePadding={MAP_FOCUS_EDGE_PADDING}
          onMapReady={useOverlayMarkers ? scheduleMarkerPositionSync : undefined}
          onPanDrag={useOverlayMarkers ? handleMapInteractionStart : undefined}
          onRegionChange={useOverlayMarkers ? scheduleMarkerPositionSync : undefined}
          onRegionChangeComplete={useOverlayMarkers ? handleMapInteractionEnd : undefined}
        >
          {routeMetrics?.polylineCoords?.length ? (
            <Polyline
              coordinates={routeMetrics.polylineCoords}
              strokeColor={theme.colors.primary}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}

          {!useOverlayMarkers ? (
            <>
              <Marker
                coordinate={pickupMarkerCoords}
                title="Pickup"
                description={resolvedPickup || 'Pickup'}
              >
                <View style={styles.routeMarkerWrapper} collapsable={false}>
                  <View style={[styles.routeMarker, { backgroundColor: theme.colors.background, borderColor: theme.colors.primary }]}> 
                    <Text style={[styles.routeMarkerText, { color: theme.colors.primary }]}>Pickup</Text>
                  </View>
                </View>
              </Marker>

              <Marker
                coordinate={dropoffMarkerCoords}
                title="Dropoff"
                description={resolvedDropoff || 'Dropoff'}
              >
                <View style={styles.routeMarkerWrapper} collapsable={false}>
                  <View style={[styles.routeMarker, { backgroundColor: theme.colors.background, borderColor: theme.colors.error }]}> 
                    <Text style={[styles.routeMarkerText, { color: theme.colors.error }]}>Drop-off</Text>
                  </View>
                </View>
              </Marker>
            </>
          ) : null}
        </BookingMap>

        {useOverlayMarkers && !isMapInteracting && hasMarkerPosition ? (
          <View pointerEvents="none" style={styles.routeMarkerOverlay}>
            <Animated.View
              style={[
                styles.routeMarkerFloating,
                { left: pickupMarkerAnim.x, top: pickupMarkerAnim.y },
              ]}
            >
              <View style={[styles.routeMarker, { backgroundColor: theme.colors.background, borderColor: theme.colors.primary }]}> 
                <Text style={[styles.routeMarkerText, { color: theme.colors.primary }]}>Pickup</Text>
              </View>
            </Animated.View>

            <Animated.View
              style={[
                styles.routeMarkerFloating,
                { left: dropoffMarkerAnim.x, top: dropoffMarkerAnim.y },
              ]}
            >
              <View style={[styles.routeMarker, { backgroundColor: theme.colors.background, borderColor: theme.colors.error }]}> 
                <Text style={[styles.routeMarkerText, { color: theme.colors.error }]}>Drop-off</Text>
              </View>
            </Animated.View>
          </View>
        ) : null}

        {useOverlayMarkers && isMapInteracting ? (
          <View pointerEvents="none" style={styles.centerMarkerOverlay}>
            <View style={styles.centerMarkerPin}>
              <View style={[styles.centerMarkerCore, { backgroundColor: theme.colors.primary }]}> 
                <Ionicons name="location" size={18} color="#FFFFFF" />
              </View>
            </View>
          </View>
        ) : null}

        {/* Header on top of map */}
        <SafeAreaView style={styles.headerContainer} edges={['top']}>
          <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
            </TouchableOpacity>
            <View style={styles.headerLocationRow}>
              <Ionicons name="radio-button-on" size={14} color={theme.colors.primary} />
              <Text style={[styles.headerLocationText, { color: theme.colors.text }]} numberOfLines={1}>
                {pickup || 'Pickup'}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={theme.colors.textSecondary} />
              <Ionicons name="location" size={14} color={theme.colors.error} />
              <Text style={[styles.headerLocationText, { color: theme.colors.text }]} numberOfLines={1}>
                {dropoff || 'Dropoff'}
              </Text>
            </View>
            <View style={styles.backButton} />
          </View>
        </SafeAreaView>

        {routeMetrics?.etaText ? (
          <View style={[styles.etaBadge, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}> 
            <Ionicons name="time-outline" size={14} color={theme.colors.primary} />
            <Text style={[styles.etaBadgeText, { color: theme.colors.text }]}>
              {routeMetrics.etaText}
              {routeMetrics.distanceText ? ` • ${routeMetrics.distanceText}` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ============================================ */}
      {/* DRAWER SECTION */}
      {/* ============================================ */}
      <Animated.View
        {...drawerPanResponder.panHandlers}
        style={[
          styles.drawer,
          {
            backgroundColor: theme.colors.background,
            height: animatedDrawerHeight,
          },
        ]}
      >
        {/* Drawer Handle */}
        <View style={styles.drawerHandleTouchArea}>
          <View style={styles.drawerHandle}>
            <View style={[styles.drawerHandleLine, { backgroundColor: theme.colors.border }]} />
          </View>
        </View>

        <View style={styles.drawerContent}>
          <View style={styles.vehicleList}>
            {vehicleOptions.map((vehicle) => (
              <TouchableOpacity
                key={vehicle.id}
                style={[
                  styles.vehicleCard,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor:
                      selectedVehicle.id === vehicle.id
                        ? theme.colors.primary
                        : theme.colors.border,
                  },
                ]}
                onPress={() => handleVehiclePress(vehicle)}
              >
                <TouchableOpacity
                  onPress={() => handleVehicleImagePress(vehicle)}
                  activeOpacity={0.8}
                  style={styles.vehicleImageTouchArea}
                >
                  <View
                    style={[
                      styles.vehicleImageContainer,
                      { backgroundColor: '#FFFFFF' },
                    ]}
                  >
                    <Image source={vehicle.imageSource} style={styles.vehicleImage} resizeMode="contain" />
                  </View>
                </TouchableOpacity>

                <View style={styles.vehicleInfo}>
                  <Text style={[styles.vehicleName, { color: theme.colors.text }]}>
                    {vehicle.name}
                  </Text>
                  <View style={styles.vehicleMetaRow}>
                    <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={[styles.vehicleMetaText, { color: theme.colors.textSecondary }]}> 
                      {isRouteMetricsLoading ? 'Calculating...' : routeMetrics?.etaText ?? vehicle.time}
                    </Text>
                    <Ionicons
                      name="navigate-outline"
                      size={14}
                      color={theme.colors.textSecondary}
                      style={styles.metaIconSpacing}
                    />
                    <Text style={[styles.vehicleMetaText, { color: theme.colors.textSecondary }]}> 
                      {routeMetrics?.distanceText ?? '-- km'}
                    </Text>
                  </View>
                  <Text style={[styles.vehicleType, { color: theme.colors.textSecondary }]}> 
                    {vehicle.type} • {vehicle.seats} seats
                  </Text>
                </View>

                <View style={styles.vehiclePriceContainer}>
                  {vehicle.badge ? (
                    <View style={styles.vehicleBadge}>
                      <Text style={styles.vehicleBadgeText}>{vehicle.badge}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.vehiclePrice, { color: theme.colors.text }]}> 
                      {formatWholeNaira(vehiclePriceEstimates[vehicle.name] ?? vehicle.priceNaira)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Animated.View>

      {/* ============================================ */}
      {/* FIXED FOOTER (does not collapse with drawer drag) */}
      {/* ============================================ */}
      <View
        style={[
          styles.fixedFooter,
          {
            backgroundColor: theme.mode === 'dark' ? '#000000' : '#FFFFFF',
            borderTopColor: theme.colors.border,
            paddingBottom: Platform.OS === 'android' ? insets.bottom + 28 : 16,
          },
        ]}
      > 
        <View style={styles.paymentRow}>
          <View style={styles.paymentTitleRow}>
            <Text style={[styles.paymentTitle, { color: theme.colors.textSecondary }]}>Payment method</Text>
            <TouchableOpacity
              onPress={() => setIsQuickWalletVisible(true)}
              style={styles.paymentTitleIconButton}
            >
              <Ionicons name="chevron-down" size={16} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
          <View
            style={[
              styles.paymentToggle,
              styles.paymentToggleSpacing,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === 'wallet' && { backgroundColor: theme.colors.primary },
              ]}
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
                numberOfLines={1}
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
              <Text
                style={[
                  styles.paymentOptionText,
                  { color: paymentMethod === 'directTransfer' ? '#FFFFFF' : theme.colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                Direct Transfer
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.bookButton,
            { backgroundColor: theme.colors.primary },
            isCreatingBooking ? styles.bookButtonDisabled : null,
          ]}
          onPress={navigateToGetDriver}
          disabled={isCreatingBooking}
        >
          <Text style={styles.bookButtonText}>
            {isCreatingBooking
              ? 'Creating booking...'
              : selectedVehicle.badge
              ? `Book ${selectedVehicle.name} - Unavailable`
              : `Book ${selectedVehicle.name} - ${formatWholeNaira(vehiclePriceEstimates[selectedVehicle.name] ?? selectedVehicle.priceNaira)}`}
          </Text>
        </TouchableOpacity>
      </View>

      <QuickWallet visible={isQuickWalletVisible} onClose={() => setIsQuickWalletVisible(false)} />

      <VehicleModalFeatures
        visible={isVehicleModalVisible}
        onClose={() => setIsVehicleModalVisible(false)}
        onGetDriver={() => {
          setIsVehicleModalVisible(false);
          navigateToGetDriver();
        }}
        theme={theme}
        vehicle={selectedVehicle}
        imageSource={selectedVehicle.imageSource}
        displayFareNaira={vehiclePriceEstimates[selectedVehicle.name] ?? selectedVehicle.priceNaira}
      />
    </View>
  );
}


// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
  },

  // ============================================
  // MAP SECTION STYLES
  // ============================================
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  map: {
    width: '100%',
    height: '100%',
  },

  // Header on Map
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerLocationRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginHorizontal: 8,
  },
  headerLocationText: {
    maxWidth: 92,
    fontSize: 12,
    fontWeight: '600',
  },
  etaBadge: {
    position: 'absolute',
    top: 92,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  etaBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  routeMarker: {
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  routeMarkerFloating: {
    position: 'absolute',
    transform: [{ translateX: -38 }, { translateY: -42 }],
  },
  routeMarkerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  centerMarkerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  centerMarkerPin: {
    transform: [{ translateY: -20 }],
  },
  centerMarkerCore: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
  routeMarkerWrapper: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeMarkerText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ============================================
  // DRAWER SECTION STYLES
  // ============================================
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    paddingTop: 8,
  },
  drawerContent: {
    flex: 1,
  },
  fixedFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    zIndex: 20,
    elevation: 20,
  },

  // Drawer Handle
  drawerHandleTouchArea: {
    paddingTop: 8,
  },
  drawerHandle: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  drawerHandleLine: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },

  // Vehicle List
  vehicleList: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'android' ? 170 : 150,
    marginBottom: Platform.OS === 'android' ? 1 : 0,
    marginTop: Platform.OS === 'android' ? -2 : Platform.OS === 'ios' ? 18 : 0,
  },

  // ============================================
  // VEHICLE CARD STYLES
  // ============================================
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 8,
    minHeight: 78,
  },

  // Car Image Placeholder
  vehicleImageContainer: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 28,
  },
  vehicleImageTouchArea: {
    marginRight: 10,
  },
  vehicleImage: {
    width: 56,
    height: 54,
  },

  // Car Details (Middle Section)
  vehicleInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  vehicleName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  vehicleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  vehicleMetaText: {
    fontSize: 12,
    marginLeft: 3,
  },
  metaIconSpacing: {
    marginLeft: 10,
  },
  vehicleType: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Price (Right Section - Aligned Right)
  vehiclePriceContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  vehicleBadge: {
    backgroundColor: '#3E7D59',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  vehicleBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  vehiclePrice: {
    fontSize: 16,
    fontWeight: '700',
  },

  // ============================================
  // FOOTER (BOOK BUTTON) STYLES
  // ============================================
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  paymentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
  },
  paymentTitle: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 0,
  },
  paymentTitleIconButton: {
    padding: 2,
  },
  paymentToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  paymentToggleSpacing: {
    marginLeft: 12,
  },
  paymentOption: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  paymentOptionText: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  bookButton: {
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookButtonDisabled: {
    opacity: 0.75,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
