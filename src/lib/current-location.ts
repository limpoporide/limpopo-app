import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type CurrentLocationSnapshot = {
  coords: Coordinates;
  label: string;
};

type ResolveCurrentLocationOptions = {
  requestPermission?: boolean;
  preferFresh?: boolean;
  log?: (context: string, details?: Record<string, unknown>) => void;
};

const CURRENT_LOCATION_SNAPSHOT_KEY = 'current_location_snapshot';
const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || GOOGLE_PLACES_API_KEY;
const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const PLACES_REQUEST_TIMEOUT_MS = 8000;

let cachedCurrentLocationSnapshot: CurrentLocationSnapshot | null = null;
let hydratedStoredSnapshotPromise: Promise<CurrentLocationSnapshot | null> | null = null;
let prefetchCurrentLocationPromise: Promise<CurrentLocationSnapshot | null> | null = null;

const fetchWithTimeout = async (url: string, timeoutMs: number = PLACES_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const sanitizeSnapshot = (value: unknown): CurrentLocationSnapshot | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const snapshot = value as Partial<CurrentLocationSnapshot>;
  const label = typeof snapshot.label === 'string' ? snapshot.label.trim() : '';
  const latitude = typeof snapshot.coords?.latitude === 'number' ? snapshot.coords.latitude : null;
  const longitude = typeof snapshot.coords?.longitude === 'number' ? snapshot.coords.longitude : null;

  if (!label || latitude === null || longitude === null) {
    return null;
  }

  return {
    label,
    coords: {
      latitude,
      longitude,
    },
  };
};

const hydrateStoredCurrentLocationSnapshot = async (): Promise<CurrentLocationSnapshot | null> => {
  if (cachedCurrentLocationSnapshot) {
    return cachedCurrentLocationSnapshot;
  }

  if (!hydratedStoredSnapshotPromise) {
    hydratedStoredSnapshotPromise = (async () => {
      try {
        const cachedValue = await AsyncStorage.getItem(CURRENT_LOCATION_SNAPSHOT_KEY);

        if (!cachedValue) {
          return null;
        }

        const parsedValue: unknown = JSON.parse(cachedValue);
        const snapshot = sanitizeSnapshot(parsedValue);

        if (snapshot) {
          cachedCurrentLocationSnapshot = snapshot;
        }

        return snapshot;
      } catch {
        return null;
      }
    })();
  }

  return hydratedStoredSnapshotPromise;
};

const persistCurrentLocationSnapshot = async (snapshot: CurrentLocationSnapshot) => {
  cachedCurrentLocationSnapshot = snapshot;
  await AsyncStorage.setItem(CURRENT_LOCATION_SNAPSHOT_KEY, JSON.stringify(snapshot));
};

const reverseGeocodeWithGoogle = async (latitude: number, longitude: number): Promise<string> => {
  if (!GOOGLE_MAPS_API_KEY) {
    return 'Current location';
  }

  try {
    const params = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
      key: GOOGLE_MAPS_API_KEY,
      result_type: 'street_address|premise|subpremise',
      language: 'en',
    });

    const url = `${GOOGLE_GEOCODING_URL}?${params.toString()}`;
    const response = await fetchWithTimeout(url);
    const payload = await response.json();

    if (payload.status === 'OK' && payload.results && payload.results.length > 0) {
      const result = payload.results[0];
      let streetNumber = '';
      let street = '';
      let sublocality = '';
      let locality = '';

      result.address_components?.forEach((component: any) => {
        const types = component.types || [];
        if (types.includes('street_number')) streetNumber = component.long_name;
        if (types.includes('route')) street = component.long_name;
        if (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood')) {
          sublocality = component.long_name;
        }
        if (types.includes('locality')) locality = component.long_name;
      });

      const streetPart = [streetNumber, street].filter(Boolean).join(' ').trim();
      const areaPart = [sublocality, locality].filter(Boolean).join(', ').trim();

      if (streetPart && areaPart) return `${streetPart}, ${areaPart}`;
      if (streetPart) return streetPart;
      if (result.formatted_address) return result.formatted_address;
    }

    return 'Current location';
  } catch {
    return 'Current location';
  }
};

const getCoordsFromPosition = (position: Location.LocationObject): Coordinates => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
});

const tryLivePosition = async (log?: ResolveCurrentLocationOptions['log']) => {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return getCoordsFromPosition(position);
  } catch (error) {
    log?.('current location live fix failed', {
      error: String(error),
    });
    return null;
  }
};

const tryLastKnownPosition = async () => {
  const position = await Location.getLastKnownPositionAsync();
  return position ? getCoordsFromPosition(position) : null;
};

export const getCachedCurrentLocationSnapshot = () => cachedCurrentLocationSnapshot;

export const resolveCurrentLocationSnapshot = async (
  options: ResolveCurrentLocationOptions = {}
): Promise<CurrentLocationSnapshot | null> => {
  const { requestPermission = false, preferFresh = true, log } = options;
  const storedSnapshot = await hydrateStoredCurrentLocationSnapshot();

  let permission = await Location.getForegroundPermissionsAsync();

  log?.('current location permission status', {
    status: permission.status,
    canAskAgain: permission.canAskAgain,
  });

  if (permission.status !== 'granted' && requestPermission) {
    permission = await Location.requestForegroundPermissionsAsync();

    log?.('current location permission requested', {
      status: permission.status,
      canAskAgain: permission.canAskAgain,
    });
  }

  if (permission.status !== 'granted') {
    return storedSnapshot;
  }

  const coords = preferFresh
    ? (await tryLivePosition(log)) ?? (await tryLastKnownPosition())
    : (await tryLastKnownPosition()) ?? (await tryLivePosition(log));

  if (!coords) {
    return storedSnapshot;
  }

  const label = await reverseGeocodeWithGoogle(coords.latitude, coords.longitude);
  const snapshot = { coords, label };

  await persistCurrentLocationSnapshot(snapshot);

  return snapshot;
};

export const prefetchCurrentLocationSnapshot = async () => {
  if (!prefetchCurrentLocationPromise) {
    prefetchCurrentLocationPromise = resolveCurrentLocationSnapshot({
      requestPermission: false,
      preferFresh: false,
    }).finally(() => {
      prefetchCurrentLocationPromise = null;
    });
  }

  return prefetchCurrentLocationPromise;
};