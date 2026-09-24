import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppState,
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Image,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Modal,
  Share,
  type AppStateStatus,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import LottieView from 'lottie-react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/context/NotificationsContext';
import DriverDetails from '@/components/bookings/driver-details';
import InsufficientWalletPaymentModal from '@/components/bookings/InsufficientWalletPaymentModal';
import BookingMap from '@/components/bookings/booking-map';
import RideCancel from '@/components/bookings/ride-cancel';
import { BudPayCheckoutModal } from '@/components/BudPayCheckoutModal';
import QuickWallet from '@/components/quick_wallet';
import { showIncomingNativeCall } from '@/lib/native-calling';
import { fetchUnreadDriverMessageCount, markDriverMessagesRead, subscribeToChatMessages } from '@/lib/chat';
import type { NotificationItem } from '@/lib/notifications';
import { fetchRiderProfile, getCachedRiderProfile } from '@/lib/rider-profile';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/utils/formatters';

const DEFAULT_DRIVER_IMAGE = require('../../assets/driver-profile.png');
const DRIVER_MAP_MARKER = require('../../assets/limpopo-car-icon.png');
const CHAT_MESSAGE_SOUND = require('../../assets/chat.wav');
const PAYMENT_SUCCESS_LOTTIE = require('../../assets/success.json');
const GOOGLE_DIRECTIONS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const BUDPAY_PUBLIC_KEY = process.env.EXPO_PUBLIC_BUDPAY_PUBLIC_KEY || '';
const DEFAULT_FREE_DELAY_MINS = 3;
const DEFAULT_MAX_DELAY_MINS = 30;
const NOTIFICATION_BANNER_TIMEOUT_MS = 5000;
const MAX_VISIBLE_NOTIFICATION_BANNERS = 3;
const PENDING_DIRECT_TRANSFER_KEY_PREFIX = 'direct_transfer_pending_verification:';
const ACTIVE_DIRECT_TRANSFER_CHECKOUT_KEY_PREFIX = 'direct_transfer_active_checkout:';

type AssignedDriverProfile = {
  uuid: string;
  firstName: string;
  lastName: string;
  phone: string;
  profileImageUri: string | null;
  experience: string | null;
  vehicleNum: string | null;
  locationLat: number | null;
  locationLng: number | null;
};

type BookingSummary = {
  vehicleType: string;
  totalKm: number | null;
  totalTime: number | null;
  amount: number;
  delayFare: number;
  vatAmount: number;
  stateLevy: number;
  totalFare: number;
  rideStatus: string | null;
  paymentStatus: 'unpaid' | 'paid' | null;
  paymentMethod: string | null;
  pricingId: string | null;
  driverArrivedAt: string | null;
  tripStartedAt: string | null;
  tripCompletedAt: string | null;
};

type VehiclePricingPolicy = {
  id: string;
  delayPricePerMin: number;
  freeDelayMins: number;
  maxDelayMins: number;
  vatPercentage: number;
};

type RoutePoint = {
  latitude: number;
  longitude: number;
};

type DriverRouteMetrics = {
  etaText: string | null;
  etaSeconds: number | null;
  polylineCoords: RoutePoint[];
};

type CheckoutSession = {
  reference: string;
  amount: number;
};

type DrawerHeight = 'collapsed' | 'expanded';

type ScreenPoint = {
  x: number;
  y: number;
};

type LabelSize = {
  width: number;
  height: number;
};

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const DRAWER_HEIGHTS = {
  collapsed: Math.max(SCREEN_HEIGHT * 0.4, 390),
  expanded: SCREEN_HEIGHT * 0.7,
};
const DRAWER_MAX_TRANSLATE_Y = DRAWER_HEIGHTS.expanded - DRAWER_HEIGHTS.collapsed;

const DEFAULT_PICKUP_COORDINATE = {
  latitude: 6.5244,
  longitude: 3.3792,
};

const DEFAULT_DROPOFF_COORDINATE = {
  latitude: 6.4654,
  longitude: 3.4064,
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

const formatCoordinateLabel = (label: string, coordinate: RoutePoint) => {
  return `${label}: ${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`;
};

const getPendingDirectTransferStorageKey = (bookingId: string) => `${PENDING_DIRECT_TRANSFER_KEY_PREFIX}${bookingId}`;

const getActiveCheckoutStorageKey = (bookingId: string) => `${ACTIVE_DIRECT_TRANSFER_CHECKOUT_KEY_PREFIX}${bookingId}`;

const getAddressComponentValue = (components: Array<{ long_name?: string; types?: string[] }>, type: string) => {
  return components.find((component) => component.types?.includes(type))?.long_name?.trim() ?? '';
};

const buildReadableAddressLabel = (coordinate: RoutePoint, components: Array<{ long_name?: string; types?: string[] }>) => {
  const route = getAddressComponentValue(components, 'route');
  const landmark =
    getAddressComponentValue(components, 'point_of_interest') ||
    getAddressComponentValue(components, 'establishment') ||
    getAddressComponentValue(components, 'premise') ||
    getAddressComponentValue(components, 'neighborhood') ||
    getAddressComponentValue(components, 'sublocality') ||
    getAddressComponentValue(components, 'sublocality_level_1');
  const locality =
    getAddressComponentValue(components, 'locality') ||
    getAddressComponentValue(components, 'administrative_area_level_2');

  const parts = [route, landmark, locality].filter(
    (value, index, values) => value && values.indexOf(value) === index
  );

  return parts.length > 0 ? parts.join(', ') : formatCoordinateLabel('Location', coordinate);
};

const reverseGeocodeShortAddress = async (coordinate: RoutePoint) => {
  if (!GOOGLE_DIRECTIONS_API_KEY) {
    return formatCoordinateLabel('Location', coordinate);
  }

  try {
    const params = new URLSearchParams({
      latlng: `${coordinate.latitude},${coordinate.longitude}`,
      key: GOOGLE_DIRECTIONS_API_KEY,
      language: 'en',
    });

    const response = await fetch(`${GOOGLE_GEOCODING_URL}?${params.toString()}`);
    const payload = await response.json();
    const result = payload.results?.[0];

    if (payload.status === 'OK' && result?.address_components) {
      return buildReadableAddressLabel(coordinate, result.address_components);
    }

    if (__DEV__ && payload.status && payload.status !== 'ZERO_RESULTS') {
      console.warn('[Accept Reverse Geocoding Error]:', JSON.stringify(payload, null, 2));
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[Accept Reverse Geocoding Network Error]:', String(error));
    }
  }

  return formatCoordinateLabel('Location', coordinate);
};

const createRegionFromRoutePoints = (origin: RoutePoint, destination: RoutePoint) => {
  const latitudeDelta = Math.max(Math.abs(origin.latitude - destination.latitude) * 1.8, 0.02);
  const longitudeDelta = Math.max(Math.abs(origin.longitude - destination.longitude) * 1.8, 0.02);

  return {
    latitude: (origin.latitude + destination.latitude) / 2,
    longitude: (origin.longitude + destination.longitude) / 2,
    latitudeDelta,
    longitudeDelta,
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const calculateBearing = (origin: RoutePoint, destination: RoutePoint) => {
  const startLat = (origin.latitude * Math.PI) / 180;
  const startLng = (origin.longitude * Math.PI) / 180;
  const endLat = (destination.latitude * Math.PI) / 180;
  const endLng = (destination.longitude * Math.PI) / 180;
  const deltaLng = endLng - startLng;
  const y = Math.sin(deltaLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;

  return (bearing + 360) % 360;
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

const formatArrivalTime = (date: Date) => {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const normalizedHours = hours % 12 || 12;

  return `${normalizedHours}:${minutes} ${suffix}`;
};

const formatCountdownLabel = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const roundCurrency = (value: number) => Number(value.toFixed(2));
const roundUpToNearestHundred = (value: number) => Math.ceil(value / 100) * 100;

const formatDelayMinutesLabel = (minutes: number) => {
  const normalizedMinutes = Number.isInteger(minutes) ? minutes.toString() : minutes.toFixed(1);
  return `${normalizedMinutes} minute${minutes === 1 ? '' : 's'}`;
};

const fetchDriverRouteMetrics = async (
  origin: RoutePoint,
  destination: RoutePoint
): Promise<DriverRouteMetrics | null> => {
  if (!GOOGLE_DIRECTIONS_API_KEY) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      origin: `${origin.latitude},${origin.longitude}`,
      destination: `${destination.latitude},${destination.longitude}`,
      mode: 'driving',
      departure_time: 'now',
      region: 'ng',
      key: GOOGLE_DIRECTIONS_API_KEY,
    });

    const response = await fetch(`${GOOGLE_DIRECTIONS_URL}?${params.toString()}`);
    const payload = await response.json();
    const route = payload.routes?.[0];
    const leg = route?.legs?.[0];

    if (!leg) {
      if (__DEV__ && payload.status && payload.status !== 'ZERO_RESULTS') {
        console.warn('[Accept Directions Error]:', JSON.stringify(payload, null, 2));
      }
      return null;
    }

    return {
      etaText: leg.duration_in_traffic?.text ?? leg.duration?.text ?? null,
      etaSeconds: leg.duration_in_traffic?.value ?? leg.duration?.value ?? null,
      polylineCoords: route?.overview_polyline?.points
        ? decodeGooglePolyline(route.overview_polyline.points)
        : [],
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[Accept Directions Network Error]:', String(error));
    }

    return null;
  }
};

export default function Accept() {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const { bookingId, pickupLat, pickupLng, dropoffLat, dropoffLng } = useLocalSearchParams<{
    bookingId?: string;
    pickupLat?: string;
    pickupLng?: string;
    dropoffLat?: string;
    dropoffLng?: string;
  }>();
  const { theme } = useTheme();
  const { notifications, markAsRead } = useNotifications();
  const insets = useSafeAreaInsets();
  const scrollOffsetRef = useRef(0);
  const rideCallChannelRef = useRef<RealtimeChannel | null>(null);
  const driverFirstNameRef = useRef('Your pilot');
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const bannerTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const resolvedBookingId = normalizeRouteParam(bookingId).trim();
  const pickupCoordinate = {
    latitude: parseCoordinateParam(pickupLat) ?? DEFAULT_PICKUP_COORDINATE.latitude,
    longitude: parseCoordinateParam(pickupLng) ?? DEFAULT_PICKUP_COORDINATE.longitude,
  };
  const dropoffCoordinate = {
    latitude: parseCoordinateParam(dropoffLat) ?? DEFAULT_DROPOFF_COORDINATE.latitude,
    longitude: parseCoordinateParam(dropoffLng) ?? DEFAULT_DROPOFF_COORDINATE.longitude,
  };
  const pickupLabel = formatCoordinateLabel('Pickup', pickupCoordinate);
  const dropoffLabel = formatCoordinateLabel('Drop-off', dropoffCoordinate);
  const [drawerHeight, setDrawerHeight] = useState<DrawerHeight>('expanded');
  const [isDrawerDragging, setIsDrawerDragging] = useState(false);
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapLabelPositions, setMapLabelPositions] = useState<{
    pickup: ScreenPoint | null;
    dropoff: ScreenPoint | null;
    driverEta: ScreenPoint | null;
  }>({
    pickup: null,
    dropoff: null,
    driverEta: null,
  });
  const [mapLabelSizes, setMapLabelSizes] = useState<{
    pickup: LabelSize | null;
    dropoff: LabelSize | null;
    driverEta: LabelSize | null;
  }>({
    pickup: null,
    dropoff: null,
    driverEta: null,
  });
  const animatedDrawerTranslateY = useRef(new Animated.Value(0)).current;
  const dragStartTranslateY = useRef(0);
  const currentDrawerTranslateY = useRef(0);
  const drawerHeightRef = useRef<DrawerHeight>('expanded');
  const [assignedDriver, setAssignedDriver] = useState<AssignedDriverProfile | null>(null);
  const [bookingSummary, setBookingSummary] = useState<BookingSummary | null>(null);
  const [pricingPolicy, setPricingPolicy] = useState<VehiclePricingPolicy | null>(null);
  const [driverRouteMetrics, setDriverRouteMetrics] = useState<DriverRouteMetrics | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ bookingId: string; participantName: string } | null>(null);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [pendingVerificationReference, setPendingVerificationReference] = useState<string | null>(null);
  const [activeCheckout, setActiveCheckout] = useState<CheckoutSession | null>(null);
  const [isQuickWalletVisible, setIsQuickWalletVisible] = useState(false);
  const [isInsufficientWalletModalVisible, setIsInsufficientWalletModalVisible] = useState(false);
  const [isPaymentSuccessModalVisible, setIsPaymentSuccessModalVisible] = useState(false);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState('Your ride payment has been confirmed.');
  const [arrivedCountdownSeconds, setArrivedCountdownSeconds] = useState<number | null>(null);
  const [visibleNotificationBanners, setVisibleNotificationBanners] = useState<NotificationItem[]>([]);
  const [checkoutProfile, setCheckoutProfile] = useState({
    email: '',
    firstName: 'Rider',
    lastName: 'Limpopo',
    phone: '',
  });
  const incomingChatSoundRef = useRef<Audio.Sound | null>(null);
  const isPersistingDelayFareRef = useRef(false);
  const paymentSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [readableLocations, setReadableLocations] = useState({
    pickup: pickupLabel,
    dropoff: dropoffLabel,
  });
  const assignedDriverLatitude = assignedDriver?.locationLat ?? null;
  const assignedDriverLongitude = assignedDriver?.locationLng ?? null;
  const assignedDriverCoordinate =
    assignedDriverLatitude !== null && assignedDriverLongitude !== null
      ? {
          latitude: assignedDriverLatitude,
          longitude: assignedDriverLongitude,
        }
      : null;
  const rideStatus = bookingSummary?.rideStatus ?? 'accepted';
  const showPickupMarker = rideStatus === 'accepted' || rideStatus === 'open';
  const showDropoffMarker =
    rideStatus === 'arrived' || rideStatus === 'in_progress' || rideStatus === 'completed';
  const routeTargetCoordinate = showDropoffMarker ? dropoffCoordinate : pickupCoordinate;
  const driverHeading =
    assignedDriverCoordinate && driverRouteMetrics?.polylineCoords.length
      ? calculateBearing(
          assignedDriverCoordinate,
          driverRouteMetrics.polylineCoords[1] ?? routeTargetCoordinate
        )
      : assignedDriverCoordinate
        ? calculateBearing(assignedDriverCoordinate, routeTargetCoordinate)
        : 0;
  const mapFocusCoordinates = assignedDriverCoordinate
    ? [assignedDriverCoordinate, routeTargetCoordinate]
    : [routeTargetCoordinate];
  const mapInitialRegion = assignedDriverCoordinate
    ? createRegionFromRoutePoints(assignedDriverCoordinate, routeTargetCoordinate)
    : {
        latitude: routeTargetCoordinate.latitude,
        longitude: routeTargetCoordinate.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  const playIncomingChatSound = useCallback(async () => {
    try {
      let sound = incomingChatSoundRef.current;

      if (!sound) {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        const createdSound = await Audio.Sound.createAsync(CHAT_MESSAGE_SOUND, {
          shouldPlay: false,
        });

        sound = createdSound.sound;
        incomingChatSoundRef.current = sound;
      }

      await sound.replayAsync();
    } catch (error) {
      console.log('[Accept] Unable to play incoming chat sound', error);
    }
  }, []);

  drawerHeightRef.current = drawerHeight;

  useEffect(() => {
    const listenerId = animatedDrawerTranslateY.addListener(({ value }) => {
      currentDrawerTranslateY.current = value;
    });

    return () => {
      animatedDrawerTranslateY.removeListener(listenerId);
    };
  }, [animatedDrawerTranslateY]);

  useEffect(() => {
    return () => {
      if (paymentSuccessTimeoutRef.current) {
        clearTimeout(paymentSuccessTimeoutRef.current);
      }

      Object.values(bannerTimeoutsRef.current).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });

      bannerTimeoutsRef.current = {};
    };
  }, []);

  const dismissNotificationBanner = useCallback((notificationId: string) => {
    const timeoutId = bannerTimeoutsRef.current[notificationId];

    if (timeoutId) {
      clearTimeout(timeoutId);
      delete bannerTimeoutsRef.current[notificationId];
    }

    setVisibleNotificationBanners((current) =>
      current.filter((notification) => notification.id !== notificationId)
    );
  }, []);

  useEffect(() => {
    if (seenNotificationIdsRef.current.size === 0 && notifications.length > 0) {
      seenNotificationIdsRef.current = new Set(notifications.map((notification) => notification.id));
      return;
    }

    const nextNotifications = notifications.filter(
      (notification) => !seenNotificationIdsRef.current.has(notification.id)
    );

    if (nextNotifications.length === 0) {
      return;
    }

    const hasAudibleNotification = nextNotifications.some(
      (notification) => notification.type !== 'driver_arrived'
    );

    if (hasAudibleNotification) {
      void playIncomingChatSound();
    }

    nextNotifications.forEach((notification) => {
      seenNotificationIdsRef.current.add(notification.id);

      if (notification.type === 'driver_arrived') {
        return;
      }

      setVisibleNotificationBanners((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== notification.id);
        return [notification, ...withoutDuplicate].slice(0, MAX_VISIBLE_NOTIFICATION_BANNERS);
      });

      const existingTimeout = bannerTimeoutsRef.current[notification.id];

      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      bannerTimeoutsRef.current[notification.id] = setTimeout(() => {
        dismissNotificationBanner(notification.id);
      }, NOTIFICATION_BANNER_TIMEOUT_MS);
    });
  }, [notifications, dismissNotificationBanner, playIncomingChatSound]);

  const handleOpenNotificationBanner = useCallback(
    async (notification: NotificationItem) => {
      dismissNotificationBanner(notification.id);

      if (!notification.isRead) {
        try {
          await markAsRead(notification.id);
        } catch {
          // Keep banner interaction non-blocking if the server update fails.
        }
      }

      router.push('/notifications');
    },
    [dismissNotificationBanner, markAsRead, router]
  );

  useEffect(() => {
    const driverArrivedAt = bookingSummary?.driverArrivedAt;
    const freeDelaySeconds = Math.max(
      0,
      Math.round((pricingPolicy?.freeDelayMins ?? DEFAULT_FREE_DELAY_MINS) * 60)
    );

    if (rideStatus !== 'arrived') {
      setArrivedCountdownSeconds(null);
      return;
    }

    if (!driverArrivedAt) {
      setArrivedCountdownSeconds(freeDelaySeconds);
      return;
    }

    const driverArrivedAtMs = new Date(driverArrivedAt).getTime();

    if (!Number.isFinite(driverArrivedAtMs)) {
      setArrivedCountdownSeconds(freeDelaySeconds);
      return;
    }

    const updateCountdown = () => {
      const remainingSeconds = Math.ceil(
        (driverArrivedAtMs + freeDelaySeconds * 1000 - Date.now()) / 1000
      );

      setArrivedCountdownSeconds(remainingSeconds);
    };

    updateCountdown();

    const intervalId = setInterval(updateCountdown, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [bookingSummary?.driverArrivedAt, pricingPolicy?.freeDelayMins, rideStatus]);

  useEffect(() => {
    const pricingId = bookingSummary?.pricingId;

    if (!pricingId) {
      setPricingPolicy(null);
      return;
    }

    let isActive = true;

    const loadPricingPolicy = async () => {
      const { data, error } = await supabase
        .from('vehicle_pricing')
        .select('id, delay_price_per_min, free_delay_mins, max_delay_mins, vat_percentage')
        .eq('id', pricingId)
        .maybeSingle();

      if (error || !data || !isActive) {
        if (isActive) {
          setPricingPolicy(null);
        }
        return;
      }

      setPricingPolicy({
        id: data.id,
        delayPricePerMin: Number(data.delay_price_per_min),
        freeDelayMins: Number(data.free_delay_mins ?? DEFAULT_FREE_DELAY_MINS),
        maxDelayMins: Number(data.max_delay_mins ?? DEFAULT_MAX_DELAY_MINS),
        vatPercentage: Number(data.vat_percentage),
      });
    };

    void loadPricingPolicy();

    return () => {
      isActive = false;
    };
  }, [bookingSummary?.pricingId]);

  useEffect(() => {
    if (
      !resolvedBookingId ||
      !bookingSummary ||
      !pricingPolicy ||
      rideStatus !== 'arrived' ||
      arrivedCountdownSeconds === null
    ) {
      return;
    }

    if (!bookingSummary.driverArrivedAt || !Number.isFinite(new Date(bookingSummary.driverArrivedAt).getTime())) {
      return;
    }

    const overdueSeconds = Math.max(0, Math.abs(Math.min(0, arrivedCountdownSeconds)));
    const chargeableDelayMinutes = Math.min(
      pricingPolicy.maxDelayMins,
      Math.floor(overdueSeconds / 60)
    );
    const nextDelayFare = roundCurrency(chargeableDelayMinutes * pricingPolicy.delayPricePerMin);
    const baseAmount = roundCurrency(Math.max(0, bookingSummary.amount - bookingSummary.delayFare));
    const nextAmount = roundCurrency(baseAmount + nextDelayFare);
    const nextVatAmount = roundCurrency((nextAmount * pricingPolicy.vatPercentage) / 100);
    const nextTotalFare = roundUpToNearestHundred(nextAmount + nextVatAmount + bookingSummary.stateLevy);

    if (
      nextDelayFare === bookingSummary.delayFare &&
      nextAmount === bookingSummary.amount &&
      nextVatAmount === bookingSummary.vatAmount &&
      nextTotalFare === bookingSummary.totalFare
    ) {
      return;
    }

    if (isPersistingDelayFareRef.current) {
      return;
    }

    isPersistingDelayFareRef.current = true;

    void (async () => {
      try {
        const { error } = await supabase
          .from('rider_booking')
          .update({
            delay_fare: nextDelayFare,
            amount: nextAmount,
            vat_amount: nextVatAmount,
            total_fare: nextTotalFare,
          })
          .eq('id', resolvedBookingId)
          .eq('ride_status', 'arrived');

        if (error) {
          throw error;
        }

        setBookingSummary((current) =>
          current
            ? {
                ...current,
                delayFare: nextDelayFare,
                amount: nextAmount,
                vatAmount: nextVatAmount,
                totalFare: nextTotalFare,
              }
            : current
        );
      } catch (error) {
        console.log('[Accept] Unable to persist delay fare update', {
          bookingId: resolvedBookingId,
          error,
        });
      } finally {
        isPersistingDelayFareRef.current = false;
      }
    })();
  }, [arrivedCountdownSeconds, bookingSummary, pricingPolicy, resolvedBookingId, rideStatus]);

  useEffect(() => {
    let isMounted = true;

    const hydrateCheckoutProfile = async () => {
      const cachedProfile = await getCachedRiderProfile();
      const profile = (await fetchRiderProfile()) ?? cachedProfile;

      if (!isMounted || !profile) {
        return;
      }

      setCheckoutProfile({
        email: profile.email || '',
        firstName: profile.firstName || 'Rider',
        lastName: profile.lastName || 'Limpopo',
        phone: profile.phone || '',
      });
    };

    hydrateCheckoutProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshUnreadMessageCount = useCallback(async () => {
    if (!resolvedBookingId) {
      setUnreadMessageCount(0);
      return;
    }

    try {
      const nextCount = await fetchUnreadDriverMessageCount(resolvedBookingId);
      setUnreadMessageCount(nextCount);
    } catch {
      setUnreadMessageCount(0);
    }
  }, [resolvedBookingId]);

  const updateMapLabelPositions = async () => {
    if (!mapRef.current) {
      return;
    }

    try {
      const [pickupPoint, dropoffPoint, driverEtaPoint] = await Promise.all([
        showPickupMarker ? mapRef.current.pointForCoordinate(pickupCoordinate) : Promise.resolve(null),
        showDropoffMarker ? mapRef.current.pointForCoordinate(dropoffCoordinate) : Promise.resolve(null),
        assignedDriverCoordinate && driverRouteMetrics?.etaText
          ? mapRef.current.pointForCoordinate(assignedDriverCoordinate)
          : Promise.resolve(null),
      ]);

      setMapLabelPositions({
        pickup: pickupPoint,
        dropoff: dropoffPoint,
        driverEta: driverEtaPoint,
      });
    } catch {
      setMapLabelPositions((current) => current);
    }
  };

  useEffect(() => {
    if (!resolvedBookingId) {
      return;
    }

    let isMounted = true;
    const untypedSupabase = supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: unknown; error: Error | null }>;
          };
        };
      };
    };

    const loadAssignedDriver = async () => {
      const { data: booking, error: bookingError } = await supabase
        .from('rider_booking')
        .select('assigned_driver, pricing_id, vehicle_type, total_km, total_time, amount, delay_fare, vat_amount, state_levy, total_fare, ride_status, payment_status, payment_method, driver_arrived_at, trip_started_at, trip_completed_at')
        .eq('id', resolvedBookingId)
        .maybeSingle();

      if (bookingError || !booking || !isMounted) {
        return;
      }

      setBookingSummary({
        vehicleType: booking.vehicle_type,
        totalKm: booking.total_km,
        totalTime: booking.total_time,
        amount: booking.amount,
        delayFare: booking.delay_fare,
        vatAmount: booking.vat_amount,
        stateLevy: booking.state_levy,
        totalFare: booking.total_fare,
        rideStatus: booking.ride_status,
        paymentStatus: booking.payment_status,
        paymentMethod: booking.payment_method,
        pricingId: booking.pricing_id,
        driverArrivedAt: booking.driver_arrived_at,
        tripStartedAt: booking.trip_started_at,
        tripCompletedAt: booking.trip_completed_at,
      });

      if (!booking.assigned_driver) {
        return;
      }

      const [driverProfileResult, vehicleResult] = await Promise.all([
        untypedSupabase
          .from('driver_profile')
          .select('uuid, first_name, last_name, phone_num, profile_img, experience, location_lat, location_lng')
          .eq('uuid', booking.assigned_driver)
          .maybeSingle(),
        untypedSupabase
          .from('vehicle_management')
          .select('vehicle_num')
          .eq('assigned', booking.assigned_driver)
          .maybeSingle(),
      ]);

      const driverProfile = driverProfileResult.data ?? null;
      const driverError = driverProfileResult.error;

      if (driverError || !driverProfile || typeof driverProfile !== 'object' || !isMounted) {
        return;
      }

      const driverProfileRecord = driverProfile as Record<string, unknown>;

      const firstName = typeof driverProfileRecord['first_name'] === 'string' ? driverProfileRecord['first_name'] : '';
      const lastName = typeof driverProfileRecord['last_name'] === 'string' ? driverProfileRecord['last_name'] : '';
      const phone = typeof driverProfileRecord['phone_num'] === 'string' ? driverProfileRecord['phone_num'] : '';
      const uuid = typeof driverProfileRecord['uuid'] === 'string' ? driverProfileRecord['uuid'] : booking.assigned_driver;
      const profileImageUri = typeof driverProfileRecord['profile_img'] === 'string' ? driverProfileRecord['profile_img'] : null;
      const experience = typeof driverProfileRecord['experience'] === 'string' ? driverProfileRecord['experience'] : null;
      const locationLat = typeof driverProfileRecord['location_lat'] === 'number' ? driverProfileRecord['location_lat'] : null;
      const locationLng = typeof driverProfileRecord['location_lng'] === 'number' ? driverProfileRecord['location_lng'] : null;
      const vehicleRecord = vehicleResult.data && typeof vehicleResult.data === 'object'
        ? (vehicleResult.data as Record<string, unknown>)
        : null;
      const vehicleNum =
        vehicleRecord && typeof vehicleRecord['vehicle_num'] === 'string' && vehicleRecord['vehicle_num'].trim()
          ? vehicleRecord['vehicle_num'].trim()
          : null;

      setAssignedDriver({
        uuid,
        firstName,
        lastName,
        phone,
        profileImageUri,
        experience,
        vehicleNum,
        locationLat,
        locationLng,
      });
    };

    loadAssignedDriver();

    return () => {
      isMounted = false;
    };
  }, [resolvedBookingId]);

  useEffect(() => {
    if (!resolvedBookingId) {
      return;
    }

    const bookingChannelName = `rider_booking_status:${resolvedBookingId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const bookingChannel = supabase
      .channel(bookingChannelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rider_booking',
          filter: `id=eq.${resolvedBookingId}`,
        },
        (payload) => {
          const next = payload.new as Record<string, unknown>;

          setBookingSummary((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              rideStatus: typeof next.ride_status === 'string' ? next.ride_status : current.rideStatus,
              paymentStatus:
                next.payment_status === 'paid' || next.payment_status === 'unpaid'
                  ? next.payment_status
                  : current.paymentStatus,
              totalKm: typeof next.total_km === 'number' ? next.total_km : current.totalKm,
              totalTime: typeof next.total_time === 'number' ? next.total_time : current.totalTime,
              amount: typeof next.amount === 'number' ? next.amount : current.amount,
              delayFare: typeof next.delay_fare === 'number' ? next.delay_fare : current.delayFare,
              vatAmount: typeof next.vat_amount === 'number' ? next.vat_amount : current.vatAmount,
              stateLevy: typeof next.state_levy === 'number' ? next.state_levy : current.stateLevy,
              totalFare: typeof next.total_fare === 'number' ? next.total_fare : current.totalFare,
              paymentMethod:
                typeof next.payment_method === 'string' ? next.payment_method : current.paymentMethod,
              pricingId:
                typeof next.pricing_id === 'string' || next.pricing_id === null
                  ? next.pricing_id
                  : current.pricingId,
              driverArrivedAt:
                typeof next.driver_arrived_at === 'string' || next.driver_arrived_at === null
                  ? next.driver_arrived_at
                  : current.driverArrivedAt,
              tripStartedAt:
                typeof next.trip_started_at === 'string' || next.trip_started_at === null
                  ? next.trip_started_at
                  : current.tripStartedAt,
              tripCompletedAt:
                typeof next.trip_completed_at === 'string' || next.trip_completed_at === null
                  ? next.trip_completed_at
                  : current.tripCompletedAt,
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingChannel);
    };
  }, [resolvedBookingId]);

  useFocusEffect(
    useCallback(() => {
      refreshUnreadMessageCount();
    }, [refreshUnreadMessageCount])
  );

  useEffect(() => {
    return () => {
      const sound = incomingChatSoundRef.current;
      incomingChatSoundRef.current = null;

      if (sound) {
        void sound.unloadAsync().catch((error) => {
          console.log('[Accept] Unable to unload chat sound', error);
        });
      }
    };
  }, []);

  useEffect(() => {
    if (!resolvedBookingId) {
      setUnreadMessageCount(0);
      return;
    }

    const unsubscribe = subscribeToChatMessages(resolvedBookingId, (message) => {
      if (message.sender_role === 'driver') {
        void playIncomingChatSound();
        setUnreadMessageCount((currentCount: number) => currentCount + 1);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [playIncomingChatSound, resolvedBookingId]);

  useEffect(() => {
    if (!assignedDriver?.uuid) {
      return;
    }

    const channelName = `driver_profile_location:${assignedDriver.uuid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'driver_profile',
          filter: `uuid=eq.${assignedDriver.uuid}`,
        },
        (payload) => {
          const next = payload.new as Record<string, unknown>;
          const nextLat = typeof next.location_lat === 'number' ? next.location_lat : null;
          const nextLng = typeof next.location_lng === 'number' ? next.location_lng : null;

          setAssignedDriver((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              locationLat: nextLat,
              locationLng: nextLng,
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [assignedDriver?.uuid]);

  useEffect(() => {
    if (!assignedDriverCoordinate) {
      setDriverRouteMetrics(null);
      return;
    }

    let isMounted = true;

    const loadDriverRouteMetrics = async () => {
      const nextRouteMetrics = await fetchDriverRouteMetrics(assignedDriverCoordinate, routeTargetCoordinate);

      if (!isMounted) {
        return;
      }

      setDriverRouteMetrics(nextRouteMetrics);
    };

    loadDriverRouteMetrics();

    return () => {
      isMounted = false;
    };
  }, [
    assignedDriverCoordinate?.latitude,
    assignedDriverCoordinate?.longitude,
    routeTargetCoordinate.latitude,
    routeTargetCoordinate.longitude,
  ]);

  useEffect(() => {
    let isMounted = true;

    const loadReadableLocations = async () => {
      const [nextPickup, nextDropoff] = await Promise.all([
        reverseGeocodeShortAddress(pickupCoordinate),
        reverseGeocodeShortAddress(dropoffCoordinate),
      ]);

      if (!isMounted) {
        return;
      }

      setReadableLocations({
        pickup: nextPickup,
        dropoff: nextDropoff,
      });
    };

    loadReadableLocations();

    return () => {
      isMounted = false;
    };
  }, [pickupCoordinate.latitude, pickupCoordinate.longitude, dropoffCoordinate.latitude, dropoffCoordinate.longitude]);

  useEffect(() => {
    if (__DEV__) {
      console.log('[Accept Params]:', {
        rawParams: {
          pickupLat,
          pickupLng,
          dropoffLat,
          dropoffLng,
        },
        resolvedParams: {
          bookingId: resolvedBookingId,
          pickupCoords: pickupCoordinate,
          dropoffCoords: dropoffCoordinate,
        },
      });
    }
  }, [resolvedBookingId, pickupLat, pickupLng, dropoffLat, dropoffLng, pickupCoordinate.latitude, pickupCoordinate.longitude, dropoffCoordinate.latitude, dropoffCoordinate.longitude]);

  useEffect(() => {
    if (!isMapReady) {
      return;
    }

    updateMapLabelPositions();
  }, [
    isMapReady,
    pickupCoordinate.latitude,
    pickupCoordinate.longitude,
    dropoffCoordinate.latitude,
    dropoffCoordinate.longitude,
    assignedDriverCoordinate?.latitude,
    assignedDriverCoordinate?.longitude,
    driverRouteMetrics?.etaText,
    showPickupMarker,
    showDropoffMarker,
  ]);

  const clampDrawerTranslateY = (translateY: number) => {
    return Math.min(DRAWER_MAX_TRANSLATE_Y, Math.max(0, translateY));
  };

  const updateMapLabelSize = (key: 'pickup' | 'dropoff' | 'driverEta', width: number, height: number) => {
    setMapLabelSizes((current) => {
      const nextSize = { width, height };
      const existingSize = current[key];

      if (existingSize && existingSize.width === width && existingSize.height === height) {
        return current;
      }

      return {
        ...current,
        [key]: nextSize,
      };
    });
  };

  const getOverlayLabelPosition = (
    point: ScreenPoint,
    size: LabelSize | null,
    fallbackWidth: number,
    fallbackHeight: number,
    verticalGap: number
  ) => {
    const labelWidth = size?.width ?? fallbackWidth;
    const labelHeight = size?.height ?? fallbackHeight;

    return {
      left: clamp(point.x - labelWidth / 2, 8, SCREEN_WIDTH - labelWidth - 8),
      top: point.y - labelHeight - verticalGap,
    };
  };

  const resolveNearestSnapPoint = (translateY: number): DrawerHeight => {
    const entries: Array<[DrawerHeight, number]> = [
      ['collapsed', DRAWER_MAX_TRANSLATE_Y],
      ['expanded', 0],
    ];

    return entries.reduce((closest, current) => {
      const closestDistance = Math.abs(translateY - closest[1]);
      const currentDistance = Math.abs(translateY - current[1]);
      return currentDistance < closestDistance ? current : closest;
    })[0];
  };

  const animateDrawerTo = (nextHeight: DrawerHeight) => {
    const targetTranslateY = nextHeight === 'expanded' ? 0 : DRAWER_MAX_TRANSLATE_Y;
    drawerHeightRef.current = nextHeight;
    setDrawerHeight(nextHeight);
    dragStartTranslateY.current = targetTranslateY;
    currentDrawerTranslateY.current = targetTranslateY;

    Animated.spring(animatedDrawerTranslateY, {
      toValue: targetTranslateY,
      useNativeDriver: true,
      damping: 22,
      stiffness: 260,
      mass: 0.9,
    }).start(() => {
      setIsDrawerDragging(false);
    });
  };

  const driver = {
    firstName: assignedDriver?.firstName || 'Your pilot',
    profileImage: assignedDriver?.profileImageUri ? { uri: assignedDriver.profileImageUri } : DEFAULT_DRIVER_IMAGE,
    vehicle: bookingSummary?.vehicleType || 'Limpopo Pro',
    plateNumber: assignedDriver?.vehicleNum || 'Plate number unavailable',
    experience: assignedDriver?.experience || 'New pilot',
    rating: 5,
    reviews: 0,
    phone: assignedDriver?.phone || '',
  };

  // Read via ref inside the call channel effect so driver name updates don't tear down the subscription.
  driverFirstNameRef.current = driver.firstName;

  const tripDurationMinutes = bookingSummary?.totalTime ?? null;
  const tripApproachSeconds = driverRouteMetrics?.etaSeconds ?? null;
  const freeDelayMinutes = pricingPolicy?.freeDelayMins ?? DEFAULT_FREE_DELAY_MINS;
  const totalArrivalSeconds =
    tripDurationMinutes !== null
      ? Math.max(0, Math.round(tripDurationMinutes * 60) + (tripApproachSeconds ?? 0))
      : null;
  const dropoffArrivalText =
    totalArrivalSeconds !== null
      ? `ETA ${formatArrivalTime(new Date(Date.now() + totalArrivalSeconds * 1000))}`
      : null;
  const pickupEtaText =
    driverRouteMetrics?.etaText ??
    (tripApproachSeconds !== null ? `${Math.max(1, Math.ceil(tripApproachSeconds / 60))} min` : null);
  const currentDelayMinutes =
    bookingSummary?.delayFare && pricingPolicy?.delayPricePerMin
      ? Math.round(bookingSummary.delayFare / pricingPolicy.delayPricePerMin)
      : 0;
  const extraDelaySeconds =
    arrivedCountdownSeconds !== null && arrivedCountdownSeconds < 0 ? Math.abs(arrivedCountdownSeconds) : 0;
  const liveDelayMinutes =
    rideStatus === 'arrived' && pricingPolicy
      ? Math.min(pricingPolicy.maxDelayMins, Math.floor(extraDelaySeconds / 60))
      : currentDelayMinutes;
  const liveDelayFare =
    bookingSummary && pricingPolicy && rideStatus === 'arrived'
      ? roundCurrency(liveDelayMinutes * pricingPolicy.delayPricePerMin)
      : bookingSummary?.delayFare ?? 0;
  const originalBaseRideAmount =
    bookingSummary ? roundCurrency(Math.max(0, bookingSummary.amount - bookingSummary.delayFare)) : null;
  const originalVatAmount =
    bookingSummary && pricingPolicy && originalBaseRideAmount !== null
      ? roundCurrency((originalBaseRideAmount * pricingPolicy.vatPercentage) / 100)
      : null;
  const originalComputedRideTotal =
    bookingSummary && originalBaseRideAmount !== null && originalVatAmount !== null
      ? roundUpToNearestHundred(
          originalBaseRideAmount + originalVatAmount + bookingSummary.stateLevy
        )
      : bookingSummary?.totalFare ?? null;
  const liveRideAmount =
    originalComputedRideTotal !== null ? roundCurrency(originalComputedRideTotal + liveDelayFare) : null;
  const liveTotalFare = liveRideAmount;
  const rideDetails = {
    pickup: readableLocations.pickup,
    dropoff: readableLocations.dropoff,
    eta: bookingSummary?.totalTime ? `${Math.round(bookingSummary.totalTime)} mins` : '—',
    distance: bookingSummary?.totalKm ? `${bookingSummary.totalKm.toFixed(1)} km` : '—',
    amount: liveTotalFare !== null ? formatCurrency(liveTotalFare) : '—',
  };
  const timingPrompt =
    rideStatus === 'arrived'
      ? {
          icon: 'time-outline' as const,
          title: 'Pilot is waiting for you',
          value:
            arrivedCountdownSeconds !== null && arrivedCountdownSeconds < 0
              ? `Extra time ${formatCountdownLabel(extraDelaySeconds)}`
              : formatCountdownLabel(arrivedCountdownSeconds ?? 0),
          hint:
            arrivedCountdownSeconds !== null && arrivedCountdownSeconds < 0
              ? liveDelayFare > 0
                ? `Delay fee added: ${formatCurrency(liveDelayFare)} for ${formatDelayMinutesLabel(liveDelayMinutes)}.`
                : 'Delay charges will apply for each extra minute.'
              : `Please meet your Pilot within ${formatDelayMinutesLabel(freeDelayMinutes)}.`,
        }
      : rideStatus === 'in_progress'
        ? {
            icon: 'navigate-outline' as const,
              title: dropoffArrivalText ? `You'll arrive at ${dropoffArrivalText.replace('ETA ', '')}` : 'You are on your way',
            value: rideDetails.dropoff,
            hint: rideDetails.distance !== '—' ? `${rideDetails.distance} remaining to dropoff.` : 'Sit tight while we get you there.',
          }
        : rideStatus === 'completed'
          ? {
              icon: 'checkmark-circle-outline' as const,
              title: 'Trip completed',
              value: rideDetails.dropoff,
              hint: 'Thanks for riding with Limpopo.',
            }
          : {
              icon: 'car-sport-outline' as const,
              title: pickupEtaText ? `Pilot is arriving in ${pickupEtaText}` : 'Your pilot is on the way',
              value: rideDetails.pickup,
              hint: `${driver.firstName} is heading to your pickup point.`,
            };

  const bannerMessage =
    rideStatus === 'arrived'
      ? 'Your Pilot has arrived.'
      : rideStatus === 'in_progress'
        ? 'Enjoy your Trip using Limpopo Ride. Please fasten your seat belt.'
        : rideStatus === 'completed'
          ? 'You have arrived at your Destination.'
          : 'Your pilot is verified and your executive ride is almost ready.';
      const hasTripEnded = rideStatus === 'completed' || Boolean(bookingSummary?.tripCompletedAt);
      const canPayNow = hasTripEnded && bookingSummary?.paymentStatus !== 'paid';

  // Drawer drag handler
  const drawerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        const isVerticalGesture = Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx);

        if (!isVerticalGesture) {
          return false;
        }

        if (drawerHeightRef.current !== 'expanded') {
          return true;
        }

        return scrollOffsetRef.current <= 0 && gesture.dy > 4;
      },
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        const isVerticalGesture = Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx);

        if (!isVerticalGesture) {
          return false;
        }

        if (drawerHeightRef.current !== 'expanded') {
          return true;
        }

        return scrollOffsetRef.current <= 0 && gesture.dy > 4;
      },
      onPanResponderGrant: () => {
        setIsDrawerDragging(true);
        animatedDrawerTranslateY.stopAnimation((value) => {
          dragStartTranslateY.current = value;
          currentDrawerTranslateY.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        const nextTranslateY = clampDrawerTranslateY(dragStartTranslateY.current + gesture.dy);
        currentDrawerTranslateY.current = nextTranslateY;
        animatedDrawerTranslateY.setValue(nextTranslateY);
      },
      onPanResponderRelease: (_, gesture) => {
        const releasedTranslateY = clampDrawerTranslateY(currentDrawerTranslateY.current);
        const nearestSnapPoint =
          gesture.vy >= 0.25
            ? 'collapsed'
            : gesture.vy <= -0.25
              ? 'expanded'
              : resolveNearestSnapPoint(releasedTranslateY);
        animateDrawerTo(nearestSnapPoint);
      },
      onPanResponderTerminate: (_, gesture) => {
        const releasedTranslateY = clampDrawerTranslateY(currentDrawerTranslateY.current);
        const nearestSnapPoint =
          gesture.vy >= 0.25
            ? 'collapsed'
            : gesture.vy <= -0.25
              ? 'expanded'
              : resolveNearestSnapPoint(releasedTranslateY);
        animateDrawerTo(nearestSnapPoint);
      },
    })
  ).current;

  const sendOutgoingCallSignal = async () => {
    if (!resolvedBookingId || !rideCallChannelRef.current) {
      console.warn('[Accept] Outgoing call signal unavailable', {
        bookingId: resolvedBookingId,
        hasChannel: Boolean(rideCallChannelRef.current),
      });
      return false;
    }

    try {
      await rideCallChannelRef.current.send({
        type: 'broadcast',
        event: 'incoming_call',
        payload: {
          bookingId: resolvedBookingId,
          participantName: driver.firstName,
          callerRole: 'rider',
          initiatedAt: new Date().toISOString(),
        },
      });

      console.log('[Accept] Outgoing call signal sent', {
        bookingId: resolvedBookingId,
        participantName: driver.firstName,
      });
      return true;
    } catch (error) {
      console.log('[Accept] Failed to send outgoing call signal', {
        bookingId: resolvedBookingId,
        error,
      });
      return false;
    }
  };

  const handleCall = async () => {
    const callPayload = {
      bookingId: resolvedBookingId,
      driverId: assignedDriver?.uuid ?? null,
      participantName: driver.firstName,
      pickupCoordinate,
      dropoffCoordinate,
    };

    console.log('[Accept] Call button pressed', callPayload);

    if (!resolvedBookingId) {
      console.log('[Accept] Call button blocked: missing bookingId', callPayload);
      Alert.alert('Call unavailable', 'This booking is missing the call details needed to start an in-app call.');
      return;
    }

    const signalSent = await sendOutgoingCallSignal();

    // Agora in-app call entrypoint.
    // Keep this route change isolated so call-launch issues are easy to debug.
    console.log('[Accept] Navigating to call screen', {
      pathname: '/bookings/call',
      params: {
        bookingId: resolvedBookingId,
        participantName: driver.firstName,
        signalSent: signalSent ? '1' : '0',
      },
    });

    router.push({
      pathname: '/bookings/call',
      params: {
        bookingId: resolvedBookingId,
        participantName: driver.firstName,
        signalSent: signalSent ? '1' : '0',
      },
    });
  };

  const logCallButtonInteraction = (stage: 'press-in' | 'press') => {
    const payload = {
      stage,
      bookingId: resolvedBookingId,
      driverId: assignedDriver?.uuid ?? null,
      participantName: driver.firstName,
    };

    console.warn(`[Accept] Call button ${stage}: ${JSON.stringify(payload)}`);
  };

  const handleMessage = async () => {
    setUnreadMessageCount(0);

    if (resolvedBookingId) {
      try {
        await markDriverMessagesRead(resolvedBookingId);
      } catch {
        void refreshUnreadMessageCount();
      }
    }

    router.push({
      pathname: '/bookings/chat',
      params: {
        bookingId: resolvedBookingId,
        driverName: driver.firstName,
        vehicleLabel: driver.vehicle,
      },
    });
  };

  // Google Maps deep link works cross-platform (falls back to web) and needs no hosted page.
  const buildTripMapsLink = () => {
    if (assignedDriverCoordinate) {
      return `https://www.google.com/maps/dir/?api=1&origin=${assignedDriverCoordinate.latitude},${assignedDriverCoordinate.longitude}&destination=${routeTargetCoordinate.latitude},${routeTargetCoordinate.longitude}&travelmode=driving`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${routeTargetCoordinate.latitude},${routeTargetCoordinate.longitude}`;
  };

  const buildTripShareMessage = () => {
    const lines = [
      'Track my Limpopo trip:',
      `Pilot: ${driver.firstName}`,
      `Status: ${rideStatus}`,
      `Pickup: ${rideDetails.pickup}`,
      `Drop-off: ${rideDetails.dropoff}`,
      `Distance: ${rideDetails.distance}`,
      `ETA: ${pickupEtaText ?? rideDetails.eta}`,
      buildTripMapsLink(),
    ];

    return lines.join('\n');
  };

  const handleShareTrip = async () => {
    try {
      await Share.share({
        title: 'Track my Limpopo trip',
        message: buildTripShareMessage(),
      });
    } catch (error) {
      Alert.alert(
        'Share unavailable',
        error instanceof Error ? error.message : 'Unable to open the system share sheet right now.'
      );
    }
  };

  const openRatingScreen = () => {
    router.replace({
      pathname: '/bookings/rate-driver',
      params: {
        bookingId: resolvedBookingId,
        pickup: rideDetails.pickup,
        dropoff: rideDetails.dropoff,
        amount: rideDetails.amount,
        driverName: driver.firstName,
        vehicle: driver.vehicle,
        plateNumber: driver.plateNumber,
        rating: String(driver.rating),
      },
    });
  };

  const showPaymentSuccessModalThenRoute = (message: string) => {
    setPaymentSuccessMessage(message);
    setIsPaymentSuccessModalVisible(true);

    if (paymentSuccessTimeoutRef.current) {
      clearTimeout(paymentSuccessTimeoutRef.current);
    }

    paymentSuccessTimeoutRef.current = setTimeout(() => {
      setIsPaymentSuccessModalVisible(false);
      openRatingScreen();
    }, 1800);
  };

  const finalizeRideAfterSuccessfulPayment = async (successMessage: string, paymentStatus: 'unpaid' | 'paid' | null) => {
    if (resolvedBookingId) {
      try {
        await AsyncStorage.removeItem(getActiveCheckoutStorageKey(resolvedBookingId));
      } catch {
        // Leave UI success flow non-blocking if checkout cleanup fails.
      }
    }

    setBookingSummary((current) =>
      current
        ? {
            ...current,
            paymentStatus,
          }
        : current
    );

    showPaymentSuccessModalThenRoute(successMessage);
  };

  const clearPendingDirectTransferReference = useCallback(async () => {
    setPendingVerificationReference(null);

    if (!resolvedBookingId) {
      return;
    }

    try {
      await AsyncStorage.removeItem(getPendingDirectTransferStorageKey(resolvedBookingId));
    } catch {
      // Best-effort cleanup; a stale key just leaves the retry button visible.
    }
  }, [resolvedBookingId]);

  const persistPendingDirectTransferReference = useCallback(async (reference: string) => {
    setPendingVerificationReference(reference);

    if (!resolvedBookingId) {
      return;
    }

    try {
      await AsyncStorage.setItem(getPendingDirectTransferStorageKey(resolvedBookingId), reference);
    } catch {
      // If persistence fails the in-memory state still lets the rider retry this session.
    }
  }, [resolvedBookingId]);

  const clearPersistedCheckoutSession = useCallback(async () => {
    if (!resolvedBookingId) {
      return;
    }

    try {
      await AsyncStorage.removeItem(getActiveCheckoutStorageKey(resolvedBookingId));
    } catch {
      // Best-effort cleanup; stale checkout state can still be superseded by fresh data.
    }
  }, [resolvedBookingId]);

  const persistCheckoutSession = useCallback(async (session: CheckoutSession) => {
    if (!resolvedBookingId) {
      return;
    }

    try {
      await AsyncStorage.setItem(getActiveCheckoutStorageKey(resolvedBookingId), JSON.stringify(session));
    } catch {
      // If persistence fails the current in-memory session still works until app restart.
    }
  }, [resolvedBookingId]);

  const syncCheckoutRecoveryState = useCallback(async () => {
    if (!resolvedBookingId) {
      setActiveCheckout(null);
      return;
    }

    try {
      const [storedCheckoutSession, bookingResult] = await Promise.all([
        AsyncStorage.getItem(getActiveCheckoutStorageKey(resolvedBookingId)),
        supabase
          .from('rider_booking')
          .select('ride_status, payment_status, total_fare')
          .eq('id', resolvedBookingId)
          .maybeSingle(),
      ]);

      const booking = bookingResult.data;

      if (bookingResult.error || !booking) {
        return;
      }

      setBookingSummary((current) =>
        current
          ? {
              ...current,
              rideStatus: booking.ride_status,
              paymentStatus: booking.payment_status,
              totalFare: typeof booking.total_fare === 'number' ? booking.total_fare : current.totalFare,
            }
          : current
      );

      if (booking.payment_status === 'paid') {
        setActiveCheckout(null);
        await Promise.all([clearPersistedCheckoutSession(), clearPendingDirectTransferReference()]);
        return;
      }

      if (!storedCheckoutSession) {
        return;
      }

      const parsedSession = JSON.parse(storedCheckoutSession) as Partial<CheckoutSession>;
      const reference = typeof parsedSession.reference === 'string' ? parsedSession.reference.trim() : '';
      const amount =
        typeof parsedSession.amount === 'number' && Number.isFinite(parsedSession.amount) && parsedSession.amount > 0
          ? parsedSession.amount
          : typeof booking.total_fare === 'number' && booking.total_fare > 0
            ? booking.total_fare
            : null;

      if (!reference || amount === null) {
        await clearPersistedCheckoutSession();
        return;
      }

      setActiveCheckout((current) =>
        current?.reference === reference && current.amount === amount ? current : { reference, amount }
      );
    } catch {
      // Leave existing screen state in place if recovery checks fail.
    }
  }, [clearPendingDirectTransferReference, clearPersistedCheckoutSession, resolvedBookingId]);

  useEffect(() => {
    if (!resolvedBookingId) {
      setPendingVerificationReference(null);
      setActiveCheckout(null);
      return;
    }

    let isMounted = true;

    AsyncStorage.getItem(getPendingDirectTransferStorageKey(resolvedBookingId))
      .then((storedReference) => {
        if (isMounted && storedReference) {
          setPendingVerificationReference(storedReference);
        }
      })
      .catch(() => undefined);

    void syncCheckoutRecoveryState();

    return () => {
      isMounted = false;
    };
  }, [resolvedBookingId, syncCheckoutRecoveryState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const wasBackgrounded = /inactive|background/.test(appStateRef.current);
      appStateRef.current = nextAppState;

      if (wasBackgrounded && nextAppState === 'active') {
        void syncCheckoutRecoveryState();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncCheckoutRecoveryState]);

  // Bank transfers often clear a few seconds after BudPay's checkout callback fires,
  // so retry verification with backoff before asking the rider to check back later.
  const verifyDirectTransferPayment = async (reference: string) => {
    setIsVerifyingPayment(true);

    const maxAttempts = 4;

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          const { data, error } = await supabase.functions.invoke('budpay-webhook', {
            method: 'POST',
            body: {
              notify: 'transaction',
              notifyType: 'successful',
              data: { reference, channel: 'card', bookingId: resolvedBookingId },
            },
          });

          if (error) {
            throw error;
          }

          const result = (data ?? {}) as {
            paymentStatus?: 'unpaid' | 'paid';
          };

          await clearPendingDirectTransferReference();
          await finalizeRideAfterSuccessfulPayment(
            result.paymentStatus === 'paid'
              ? 'Your ride payment has been confirmed.'
              : 'Your payment was received. Pilot settlement is still pending.',
            result.paymentStatus ?? null
          );
          return true;
        } catch (attemptError) {
          const isLastAttempt = attempt === maxAttempts - 1;

          if (isLastAttempt) {
            await persistPendingDirectTransferReference(reference);
            Alert.alert(
              'Payment still processing',
              'Bank transfers can take a few minutes to clear. We saved this payment — tap "Verify Payment" below once BudPay confirms it.'
            );
            return false;
          }

          await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
        }
      }

      return false;
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  const handleCheckoutComplete = async (response: { reference?: string; status?: string }) => {
    const reference = response.reference || activeCheckout?.reference;
    setActiveCheckout(null);

    if (!reference) {
      Alert.alert('Payment received', 'Your payment completed, but we could not confirm the reference.');
      return;
    }

    await verifyDirectTransferPayment(reference);
  };

  const handleCheckoutCancel = () => {
    setActiveCheckout(null);
    void clearPersistedCheckoutSession();
  };

  const handleRetryPaymentVerification = async () => {
    if (!pendingVerificationReference || isVerifyingPayment) {
      return;
    }

    await verifyDirectTransferPayment(pendingVerificationReference);
  };

  const openDirectTransferCheckout = async () => {
    if (!BUDPAY_PUBLIC_KEY) {
      Alert.alert('Payment unavailable', 'BudPay checkout is not configured for this app build.');
      return false;
    }

    if (!bookingSummary?.totalFare || bookingSummary.totalFare <= 0) {
      Alert.alert('Payment unavailable', 'This ride does not have a valid fare to charge.');
      return false;
    }

    if (!checkoutProfile.email) {
      Alert.alert('Profile incomplete', 'We could not find your email. Please update your profile and try again.');
      return false;
    }

    const referenceSeed = resolvedBookingId || Date.now().toString();
    const reference = `RIDE_${referenceSeed}_${Date.now()}`;
    const session = { reference, amount: bookingSummary.totalFare };
    setActiveCheckout(session);
    void persistCheckoutSession(session);
    return true;
  };

  const switchToDirectTransferAndCheckout = async () => {
    if (!resolvedBookingId) {
      Alert.alert('Payment unavailable', 'This ride is missing the details needed to continue.');
      return;
    }

    setIsVerifyingPayment(true);

    try {
      const { error } = await supabase
        .from('rider_booking')
        .update({ payment_method: 'transfer' })
        .eq('id', resolvedBookingId);

      if (error) {
        throw error;
      }

      setBookingSummary((current) =>
        current
          ? {
              ...current,
              paymentMethod: 'transfer',
            }
          : current
      );
    } catch (error) {
      Alert.alert(
        'Unable to switch payment method',
        error instanceof Error ? error.message : 'Please try again.'
      );
      setIsVerifyingPayment(false);
      return;
    }

    setIsVerifyingPayment(false);
    await openDirectTransferCheckout();
  };

  const handleOpenInsufficientWalletModal = () => {
    setIsInsufficientWalletModalVisible(true);
  };

  const handleCloseInsufficientWalletModal = () => {
    setIsInsufficientWalletModalVisible(false);
  };

  const handleFundWalletFromPaymentModal = () => {
    setIsInsufficientWalletModalVisible(false);
    setIsQuickWalletVisible(true);
  };

  const handleSwitchToDirectTransferFromPaymentModal = () => {
    setIsInsufficientWalletModalVisible(false);
    void switchToDirectTransferAndCheckout();
  };

  const handlePayNow = async () => {
    if (isVerifyingPayment) {
      return;
    }

    if (!canPayNow) {
      Alert.alert('Payment unavailable', 'Payment becomes available once the driver ends the trip.');
      return;
    }

    if (bookingSummary?.paymentMethod === 'wallet') {
      if (!resolvedBookingId) {
        Alert.alert('Payment unavailable', 'This ride is missing the details needed to continue.');
        return;
      }

      setIsVerifyingPayment(true);

      try {
        const { data, error } = await (supabase as unknown as {
          rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
        }).rpc('pay_ride_with_wallet', { p_booking_id: resolvedBookingId });

        if (error) {
          throw error;
        }

        const result = (data ?? {}) as {
          status?: string;
          paymentStatus?: 'unpaid' | 'paid';
        };

        if (result.status === 'insufficient_balance') {
          handleOpenInsufficientWalletModal();
          return;
        }

        if (result.status !== 'paid' && result.status !== 'already_paid') {
          Alert.alert('Payment unavailable', 'We could not complete your wallet payment. Please try again.');
          return;
        }

        await fetchRiderProfile();

        await finalizeRideAfterSuccessfulPayment(
          result.status === 'already_paid'
            ? 'This ride has already been paid for.'
            : result.paymentStatus === 'paid'
              ? 'Your wallet payment has been confirmed.'
              : 'Your wallet payment was received. Pilot settlement is still pending.',
          result.paymentStatus ?? null
        );
      } catch (error) {
        Alert.alert(
          'Wallet payment failed',
          error instanceof Error ? error.message : 'Please try again.'
        );
      } finally {
        setIsVerifyingPayment(false);
      }

      return;
    }

    await openDirectTransferCheckout();
  };

  const handleCancelRequest = () => {
    console.log('[Accept] Cancel Request button pressed', {
      bookingId: resolvedBookingId,
      isCancelModalVisible,
    });
    setIsCancelModalVisible(true);
  };

  const emitCallSignal = async (event: 'call_declined') => {
    if (!resolvedBookingId) {
      return;
    }

    const channel = supabase
      .channel(`ride_call:${resolvedBookingId}:response`)
      .on('broadcast', { event }, () => undefined);

    try {
      const isChannelReady = await new Promise<boolean>((resolve) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
          if (settled) {
            return;
          }

          settled = true;
          resolve(false);
        }, 4000);

        channel.subscribe((status) => {
          if (settled) {
            return;
          }

          if (status === 'SUBSCRIBED') {
            settled = true;
            clearTimeout(timeoutId);
            resolve(true);
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            settled = true;
            clearTimeout(timeoutId);
            resolve(false);
          }
        });
      });

      if (!isChannelReady) {
        throw new Error('Rider call response channel did not become ready.');
      }

      await channel.send({
        type: 'broadcast',
        event,
        payload: {
          bookingId: resolvedBookingId,
          participantName: driver.firstName,
          respondedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.log('[Accept] Failed to send call signal', { event, error });
    } finally {
      supabase.removeChannel(channel);
    }
  };

  const handleAnswerIncomingCall = () => {
    if (!incomingCall?.bookingId) {
      return;
    }

    console.log('[Accept] Answering incoming call', incomingCall);
    setIncomingCall(null);
    router.push({
      pathname: '/bookings/call',
      params: {
        bookingId: incomingCall.bookingId,
        participantName: incomingCall.participantName,
        incoming: '1',
      },
    });
  };

  const handleDeclineIncomingCall = async () => {
    console.log('[Accept] Declining incoming call', incomingCall);
    await emitCallSignal('call_declined');
    setIncomingCall(null);
  };

  useEffect(() => {
    if (!resolvedBookingId) {
      return;
    }

    const channel = supabase
      .channel(`ride_call:${resolvedBookingId}`)
      .on('broadcast', { event: 'incoming_call' }, async ({ payload }) => {
        const payloadBookingId = typeof payload?.bookingId === 'string' ? payload.bookingId : '';
        const payloadCallerRole = typeof payload?.callerRole === 'string' ? payload.callerRole : '';
        const payloadParticipantName =
          typeof payload?.participantName === 'string' && payload.participantName.trim()
            ? payload.participantName.trim()
            : driverFirstNameRef.current;

        if (payloadBookingId !== resolvedBookingId || payloadCallerRole === 'rider') {
          return;
        }

        console.log('[Accept] Incoming call signal received', {
          bookingId: payloadBookingId,
          participantName: payloadParticipantName,
          callerRole: payloadCallerRole || null,
          initiatedAt: payload?.initiatedAt ?? null,
        });

        if (Platform.OS === 'android') {
          const callUUID = await showIncomingNativeCall({
            bookingId: payloadBookingId,
            participantName: payloadParticipantName,
          });

          if (callUUID) {
            return;
          }
        }

        setIncomingCall({
          bookingId: payloadBookingId,
          participantName: payloadParticipantName,
        });
      })
      .subscribe((status) => {
        console.log('[Accept] Incoming call channel status', {
          bookingId: resolvedBookingId,
          status,
        });
      });

    rideCallChannelRef.current = channel;

    return () => {
      if (rideCallChannelRef.current === channel) {
        rideCallChannelRef.current = null;
      }
      supabase.removeChannel(channel);
      setIncomingCall(null);
    };
  }, [resolvedBookingId]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />

      {visibleNotificationBanners.length > 0 ? (
        <View pointerEvents="box-none" style={[styles.notificationBannerStack, { top: insets.top + 12 }]}> 
          {visibleNotificationBanners.map((notification, index) => (
            <TouchableOpacity
              key={notification.id}
              activeOpacity={0.95}
              style={[
                styles.notificationBannerCard,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  transform: [{ scale: 1 - index * 0.03 }],
                  opacity: index === 0 ? 1 : 0.94 - index * 0.08,
                },
              ]}
              onPress={() => {
                void handleOpenNotificationBanner(notification);
              }}
            >
              <View style={[styles.notificationBannerIcon, { backgroundColor: theme.colors.primary + '18' }]}> 
                <Ionicons name="notifications" size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.notificationBannerContent}>
                <Text style={[styles.notificationBannerTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {notification.title}
                </Text>
                <Text style={[styles.notificationBannerBody, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                  {notification.body}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification banner"
                hitSlop={10}
                style={styles.notificationBannerClose}
                onPress={() => dismissNotificationBanner(notification.id)}
              >
                <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Full screen map */}
      <BookingMap
        ref={mapRef}
        style={styles.map}
        initialRegion={mapInitialRegion}
        focusCoordinates={mapFocusCoordinates}
        onMapReady={() => {
          setIsMapReady(true);
          updateMapLabelPositions();
        }}
        onRegionChangeComplete={() => {
          updateMapLabelPositions();
        }}
      >
        {driverRouteMetrics?.polylineCoords.length ? (
          <Polyline
            coordinates={driverRouteMetrics.polylineCoords}
            strokeColor={theme.colors.primary}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}

        {showDropoffMarker ? (
          <Marker
            coordinate={dropoffCoordinate}
            title="Drop-off"
            description={dropoffLabel}
            anchor={{ x: 0.5, y: 1 }}
            pinColor={theme.colors.error}
          />
        ) : null}

        {showPickupMarker ? (
          <Marker
            coordinate={pickupCoordinate}
            title="Pickup"
            description={pickupLabel}
            anchor={{ x: 0.5, y: 1 }}
            pinColor={theme.colors.primary}
          />
        ) : null}

        {assignedDriverCoordinate ? (
          <Marker
            coordinate={assignedDriverCoordinate}
            title={driver.firstName || 'Assigned pilot'}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={driverHeading}
            zIndex={25}
          >
            <View collapsable={false} style={styles.driverMarkerShell}>
              <Image
                source={DRIVER_MAP_MARKER}
                style={styles.driverMapMarkerImage}
                resizeMode="contain"
              />
            </View>
          </Marker>
        ) : null}
      </BookingMap>

      <View pointerEvents="none" style={styles.mapOverlay}>
        {showPickupMarker && mapLabelPositions.pickup ? (
          <View
            style={[
              styles.overlayLabelAnchor,
              getOverlayLabelPosition(mapLabelPositions.pickup, mapLabelSizes.pickup, 56, 28, 18),
            ]}
          >
            <View
              style={[styles.detachedMarkerLabel, styles.overlaySmallLabel, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                updateMapLabelSize('pickup', width, height);
              }}
            >
              <Text style={[styles.mapMarkerLabelText, { color: theme.colors.text }]}>Pickup</Text>
            </View>
          </View>
        ) : null}

        {showDropoffMarker && mapLabelPositions.dropoff ? (
          <View
            style={[
              styles.overlayLabelAnchor,
              getOverlayLabelPosition(mapLabelPositions.dropoff, mapLabelSizes.dropoff, 88, 42, 18),
            ]}
          >
            <View
              style={[styles.detachedMarkerLabel, styles.overlayWideLabel, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                updateMapLabelSize('dropoff', width, height);
              }}
            >
              <Text style={[styles.mapMarkerLabelText, { color: theme.colors.text }]}>Dropoff</Text>
              {/* Re-enable this block to show drop-off ETA on the map label. */}
              {/*
              {dropoffArrivalText ? (
                <Text style={[styles.mapMarkerSubtext, { color: theme.colors.textSecondary }]}> 
                  {dropoffArrivalText}
                </Text>
              ) : null}
              */}
            </View>
          </View>
        ) : null}

        {mapLabelPositions.driverEta && driverRouteMetrics?.etaText ? (
          <View
            style={[
              styles.overlayLabelAnchor,
              getOverlayLabelPosition(mapLabelPositions.driverEta, mapLabelSizes.driverEta, 76, 28, 26),
            ]}
          >
            <View
              style={[styles.detachedMarkerLabel, styles.driverEtaFloatingBadge, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                updateMapLabelSize('driverEta', width, height);
              }}
            >
              <Text style={[styles.driverEtaText, { color: theme.colors.text }]}>{driverRouteMetrics.etaText}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Draggable Drawer */}
      <Animated.View
        {...drawerPanResponder.panHandlers}
        style={[
          styles.drawer,
          {
            height: DRAWER_HEIGHTS.expanded,
            backgroundColor: theme.colors.background,
            transform: [{ translateY: animatedDrawerTranslateY }],
          },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.dragHandleTouchArea}>
          <View style={styles.dragHandle}>
            <View style={[styles.dragHandleLine, { backgroundColor: theme.colors.border }]} />
          </View>
        </View>

        <ScrollView
          style={styles.drawerScroll}
          contentContainerStyle={[styles.drawerContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={drawerHeight === 'expanded' && !isDrawerDragging}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
        >
          <View
            style={[
              styles.timingPromptCard,
              {
                backgroundColor: theme.colors.card,
                borderColor: rideStatus === 'arrived' ? theme.colors.primary : theme.colors.border,
              },
            ]}
          >
            <View style={styles.timingPromptHeader}>
              <Ionicons name={timingPrompt.icon} size={18} color={theme.colors.primary} />
              <Text style={[styles.timingPromptEyebrow, { color: theme.colors.textSecondary }]}>Ride timing</Text>
            </View>
            <Text style={[styles.timingPromptTitle, { color: theme.colors.text }]}>
              {timingPrompt.title}
            </Text>
            <Text
              style={[
                styles.timingPromptValue,
                {
                  color:
                    rideStatus === 'arrived' && arrivedCountdownSeconds !== null && arrivedCountdownSeconds <= 0
                      ? theme.colors.error
                      : theme.colors.primary,
                },
              ]}
            >
              {timingPrompt.value}
            </Text>
            <Text style={[styles.timingPromptHint, { color: theme.colors.textSecondary }]}>
              {timingPrompt.hint}
            </Text>
          </View>

          {/* Driver Section */}
          <TouchableOpacity
            style={styles.driverSection}
            onPress={() => setDriverModalVisible(true)}
          >
            <Image source={driver.profileImage} style={styles.driverImage} />
            <View style={styles.driverInfo}>
              <Text style={[styles.driverName, { color: theme.colors.text }]}>
                {driver.firstName}
              </Text>
              <Text style={[styles.driverMeta, { color: theme.colors.textSecondary }]}>
                {driver.vehicle}
              </Text>
              <Text style={[styles.driverMeta, { color: theme.colors.textSecondary }]}>
                {driver.plateNumber}
              </Text>
            </View>
            <View style={styles.actionIcons}>
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: theme.colors.card }]}
                onPressIn={() => logCallButtonInteraction('press-in')}
                onPress={() => {
                  logCallButtonInteraction('press');
                  handleCall();
                }}
              >
                <Ionicons name="call" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: theme.colors.card }]}
                onPress={handleMessage}
              >
                <Ionicons name="chatbox-ellipses" size={20} color={theme.colors.primary} />
                {unreadMessageCount > 0 ? (
                  <View style={[styles.messageBadge, { backgroundColor: theme.colors.error }]}>
                    <Text style={styles.messageBadgeText}>{unreadMessageCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          {/* Ride Details Section */}
          <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
            <View style={styles.locationRow}>
              <Ionicons name="radio-button-on" size={16} color={theme.colors.primary} />
              <Text style={[styles.locationText, { color: theme.colors.text }]} numberOfLines={1}>
                {rideDetails.pickup}
              </Text>
            </View>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={theme.colors.error} />
              <Text style={[styles.locationText, { color: theme.colors.text }]} numberOfLines={1}>
                {rideDetails.dropoff}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>
                  {rideDetails.eta}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="navigate-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>
                  {rideDetails.distance}
                </Text>
              </View>
            </View>
          </View>

          {/* Payment Section */}
          <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
            <View style={styles.paymentRow}>
              <Text style={[styles.amountLabel, { color: theme.colors.textSecondary }]}>
                Ride amount
              </Text>
              <Text style={[styles.amountValue, { color: theme.colors.text }]}>
                {originalComputedRideTotal !== null ? formatCurrency(originalComputedRideTotal) : '—'}
              </Text>
            </View>
            {rideStatus === 'arrived' || (bookingSummary?.delayFare ?? 0) > 0 ? (
              <>
                <View style={styles.paymentRow}>
                  <Text style={[styles.amountLabel, { color: theme.colors.textSecondary }]}> 
                    Delay fee
                  </Text>
                  <Text
                    style={[
                      styles.paymentBreakdownValue,
                      { color: liveDelayFare > 0 ? theme.colors.error : theme.colors.textSecondary },
                    ]}
                  >
                    {formatCurrency(liveDelayFare)}
                  </Text>
                </View>
                <View style={[styles.paymentRow, styles.paymentTotalRow]}>
                  <Text style={[styles.amountLabel, styles.paymentTotalLabel, { color: theme.colors.text }]}> 
                    Total payable
                  </Text>
                  <Text style={[styles.amountValue, { color: theme.colors.text }]}> 
                    {rideDetails.amount}
                  </Text>
                </View>
              </>
            ) : null}
            <TouchableOpacity
              style={[
                styles.payButton,
                { backgroundColor: canPayNow ? theme.colors.primary : theme.colors.border },
              ]}
              onPress={handlePayNow}
              disabled={isVerifyingPayment || !canPayNow}
            >
              <Text style={styles.payButtonText}>
                {isVerifyingPayment
                  ? 'Confirming payment...'
                  : bookingSummary?.paymentStatus === 'paid'
                    ? 'Paid'
                    : 'Pay Now'}
              </Text>
            </TouchableOpacity>
            {pendingVerificationReference && bookingSummary?.paymentStatus !== 'paid' ? (
              <TouchableOpacity
                style={[styles.verifyPaymentButton, { borderColor: theme.colors.primary }]}
                onPress={handleRetryPaymentVerification}
                disabled={isVerifyingPayment}
              >
                <Text style={[styles.verifyPaymentButtonText, { color: theme.colors.primary }]}>
                  {isVerifyingPayment ? 'Checking...' : 'Verify Payment'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Vehicle Features Section */}
          <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
            <Image
              source={require('../../assets/wuling-pro.png')}
              style={styles.vehicleImage}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={[styles.shareRideButton, { backgroundColor: theme.colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="Share ride"
              onPress={handleShareTrip}
            >
              <Ionicons name="share-social" size={18} color="#FFFFFF" />
              <Text style={styles.shareRideButtonText}>Share Ride</Text>
            </TouchableOpacity>
          </View>

          {rideStatus !== 'arrived' ? (
            <View style={[styles.bannerSection, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
              <Ionicons name="ribbon-outline" size={18} color={theme.colors.primary} />
              <View style={styles.bannerContent}>
                <Text style={[styles.bannerText, { color: theme.colors.text }]}> 
                  {bannerMessage}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Cancel Button */}
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: theme.colors.error }]}
            onPress={handleCancelRequest}
          >
            <Text style={[styles.cancelButtonText, { color: theme.colors.error }]}>
              Cancel Request
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>

      {/* Driver Details Modal */}
      <DriverDetails
        visible={driverModalVisible}
        onClose={() => setDriverModalVisible(false)}
        driver={{
          firstName: driver.firstName,
          profileImage: driver.profileImage,
          experience: driver.experience,
          rating: driver.rating,
          reviews: driver.reviews,
          vehicle: driver.vehicle,
        }}
        bookingId={resolvedBookingId}
      />

      <RideCancel
        visible={isCancelModalVisible}
        onClose={() => {
          console.log('[Accept] RideCancel modal closed', {
            bookingId: resolvedBookingId,
          });
          setIsCancelModalVisible(false);
        }}
        onSubmit={async (reason) => {
          console.log('[Accept] RideCancel submit pressed', {
            bookingId: resolvedBookingId,
            reason,
          });
          setIsCancelModalVisible(false);

          try {
            if (!resolvedBookingId) {
              throw new Error('This booking is missing its id, so it cannot be cancelled.');
            }

            const { data, error } = await supabase
                .from('rider_booking')
                .update({ ride_status: 'cancelled' })
                .eq('id', resolvedBookingId)
                .in('ride_status', ['open', 'accepted', 'arrived'])
                .select('id, ride_status')
                .maybeSingle();

            console.log('[Accept] RideCancel update result', {
              bookingId: resolvedBookingId,
              reason,
              data,
              error,
            });

            if (error) {
              throw error;
            }

            if (!data) {
              throw new Error('This ride can no longer be cancelled from this screen.');
            }

            Alert.alert('Cancelled', 'Ride cancelled successfully', [
              {
                text: 'OK',
                onPress: () => router.replace('/(tabs)/home'),
              },
            ]);
          } catch (error) {
            console.log('[Accept] RideCancel failed', {
              bookingId: resolvedBookingId,
              reason,
              error,
            });
            Alert.alert(
              'Unable to cancel booking',
              error instanceof Error ? error.message : 'Please try again.'
            );
          }
        }}
        theme={theme}
      />

      <BudPayCheckoutModal
        visible={Boolean(activeCheckout)}
        publicKey={BUDPAY_PUBLIC_KEY}
        amount={activeCheckout?.amount ?? 0}
        reference={activeCheckout?.reference ?? ''}
        email={checkoutProfile.email}
        firstName={checkoutProfile.firstName}
        lastName={checkoutProfile.lastName}
        phone={checkoutProfile.phone}
        bookingId={resolvedBookingId}
        onComplete={handleCheckoutComplete}
        onCancel={handleCheckoutCancel}
      />

      <InsufficientWalletPaymentModal
        visible={isInsufficientWalletModalVisible}
        amountDue={bookingSummary?.totalFare ?? 0}
        onClose={handleCloseInsufficientWalletModal}
        onFundWallet={handleFundWalletFromPaymentModal}
        onSwitchToDirectTransfer={handleSwitchToDirectTransferFromPaymentModal}
      />

      <QuickWallet
        visible={isQuickWalletVisible}
        onClose={() => setIsQuickWalletVisible(false)}
      />

      <Modal
        transparent
        animationType="fade"
        visible={isPaymentSuccessModalVisible}
        onRequestClose={() => undefined}
      >
        <View style={styles.paymentSuccessBackdrop}>
          <View
            style={[
              styles.paymentSuccessCard,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <LottieView
              autoPlay
              loop
              source={PAYMENT_SUCCESS_LOTTIE}
              style={styles.paymentSuccessLottie}
            />
            <Text style={[styles.paymentSuccessTitle, { color: theme.colors.text }]}>Payment Successful</Text>
            <Text style={[styles.paymentSuccessMessage, { color: theme.colors.textSecondary }]}>
              {paymentSuccessMessage}
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={Boolean(incomingCall)}
        onRequestClose={handleDeclineIncomingCall}
      >
        <View style={styles.incomingCallBackdrop}>
          <View style={[styles.incomingCallCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.incomingCallTitle, { color: theme.colors.text }]}>Incoming call</Text>
            <Text style={[styles.incomingCallName, { color: theme.colors.text }]}> 
              {incomingCall?.participantName ?? driver.firstName}
            </Text>
            <Text style={[styles.incomingCallSubtitle, { color: theme.colors.textSecondary }]}>Driver is calling...</Text>
            <View style={styles.incomingCallActionsRow}>
              <TouchableOpacity
                style={[styles.incomingCallActionButton, { backgroundColor: theme.colors.error }]}
                onPress={handleDeclineIncomingCall}
              >
                <Ionicons name="call" size={18} color="#FFFFFF" style={styles.incomingCallDeclineIcon} />
                <Text style={styles.incomingCallDeclineText}>End</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.incomingCallActionButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleAnswerIncomingCall}
              >
                <Ionicons name="call" size={18} color="#FFFFFF" />
                <Text style={styles.incomingCallAnswerText}>Answer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  notificationBannerStack: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 40,
    gap: 10,
  },
  notificationBannerCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  notificationBannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  notificationBannerContent: {
    flex: 1,
    paddingTop: 1,
  },
  notificationBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  notificationBannerBody: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  notificationBannerClose: {
    marginLeft: 10,
    paddingTop: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayLabelAnchor: {
    position: 'absolute',
  },
  detachedMarkerLabel: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 64,
    maxWidth: 160,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  overlaySmallLabel: {
    minWidth: 56,
  },
  overlayWideLabel: {
    minWidth: 88,
  },
  mapMarkerLabelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mapMarkerSubtext: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  driverMarkerShell: {
    width: 36,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  driverEtaText: {
    fontSize: 12,
    fontWeight: '700',
  },
  driverEtaFloatingBadge: {
    minWidth: 76,
  },
  driverMapMarkerImage: {
    width: 24,
    height: 52,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dragHandleTouchArea: {
    paddingTop: 8,
  },
  dragHandle: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  dragHandleLine: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  drawerContent: {
    paddingHorizontal: 20,
  },
  drawerScroll: {
    flex: 1,
  },
  driverSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  timingPromptCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    gap: 6,
  },
  timingPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timingPromptEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  timingPromptTitle: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  timingPromptValue: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  timingPromptHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  driverImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  driverInfo: {
    flex: 1,
    paddingTop: 2,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  driverMeta: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionIcons: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  messageBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  messageBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  section: {
    paddingTop: 14,
    marginBottom: 14,
    borderTopWidth: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  locationText: {
    fontSize: 14,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  paymentTotalRow: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  amountLabel: {
    fontSize: 14,
  },
  amountValue: {
    fontSize: 19,
    fontWeight: '700',
  },
  paymentBreakdownValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  paymentTotalLabel: {
    fontWeight: '600',
  },
  payButton: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  verifyPaymentButton: {
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  verifyPaymentButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  paymentSuccessBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  paymentSuccessCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
  },
  paymentSuccessLottie: {
    width: 160,
    height: 160,
    marginBottom: 8,
  },
  paymentSuccessTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  paymentSuccessMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
  },
  vehicleImage: {
    width: '100%',
    height: 88,
    marginBottom: 10,
  },
  shareRideButton: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  shareRideButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  bannerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  bannerContent: {
    flex: 1,
    gap: 4,
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  arrivedCountdownText: {
    fontSize: 13,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  incomingCallBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  incomingCallCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
  },
  incomingCallTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  incomingCallName: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: '700',
  },
  incomingCallSubtitle: {
    marginTop: 6,
    fontSize: 14,
  },
  incomingCallActionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 24,
  },
  incomingCallActionButton: {
    minWidth: 120,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  incomingCallDeclineIcon: {
    transform: [{ rotate: '135deg' }],
  },
  incomingCallDeclineText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  incomingCallAnswerText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
