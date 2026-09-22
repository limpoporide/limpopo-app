import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedRouteCoordinates = {
  latitude: number;
  longitude: number;
};

export type ScheduledSavedRoute = {
  id: string;
  label: string;
  dropoff: string;
  dropoffCoords: SavedRouteCoordinates | null;
};

const SCHEDULED_SAVED_ROUTES_KEY = 'scheduled_saved_routes';
const MAX_SCHEDULED_SAVED_ROUTES = 8;

const normalizeStreet = (value: string) => value.replace(/\s+/g, ' ').trim();

export const toSavedStreet = (address: string) => {
  const trimmedAddress = address.trim();

  if (!trimmedAddress) {
    return '';
  }

  const normalizedAddress = normalizeStreet(trimmedAddress);
  const parts = normalizedAddress
    .split(',')
    .map((part) => normalizeStreet(part))
    .filter(Boolean);

  if (parts.length === 0) {
    return normalizedAddress;
  }

  return parts.slice(0, 2).join(', ');
};

const sanitizeSavedRouteCoordinates = (value: unknown): SavedRouteCoordinates | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const coords = value as Partial<SavedRouteCoordinates>;
  const latitude = typeof coords.latitude === 'number' ? coords.latitude : null;
  const longitude = typeof coords.longitude === 'number' ? coords.longitude : null;

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
};

const sanitizeSavedRoute = (value: unknown): ScheduledSavedRoute | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const route = value as Partial<ScheduledSavedRoute> & {
    pickup?: string;
    stops?: string[];
    pickupCoords?: SavedRouteCoordinates | null;
  };
  const dropoffSource = typeof route.dropoff === 'string' ? route.dropoff : '';
  const dropoff = toSavedStreet(dropoffSource);

  if (!dropoff) {
    return null;
  }

  const label = typeof route.label === 'string' && route.label.trim() ? toSavedStreet(route.label) : dropoff;

  return {
    id: label,
    label,
    dropoff,
    dropoffCoords: sanitizeSavedRouteCoordinates(route.dropoffCoords),
  };
};

export const loadScheduledSavedRoutes = async (): Promise<ScheduledSavedRoute[]> => {
  try {
    const cachedValue = await AsyncStorage.getItem(SCHEDULED_SAVED_ROUTES_KEY);

    if (!cachedValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(cachedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map(sanitizeSavedRoute)
      .filter((route): route is ScheduledSavedRoute => route !== null)
      .slice(0, MAX_SCHEDULED_SAVED_ROUTES);
  } catch {
    return [];
  }
};

export const saveScheduledSavedRoute = async (
  pickupAddress: string,
  dropoffAddress: string,
  stops: string[] = [],
  coords?: {
    pickupCoords?: SavedRouteCoordinates | null;
    dropoffCoords?: SavedRouteCoordinates | null;
  }
): Promise<ScheduledSavedRoute[]> => {
  const dropoff = toSavedStreet(dropoffAddress);

  if (!dropoff) {
    return loadScheduledSavedRoutes();
  }

  const nextRoute: ScheduledSavedRoute = {
    id: dropoff,
    label: dropoff,
    dropoff,
    dropoffCoords: sanitizeSavedRouteCoordinates(coords?.dropoffCoords),
  };

  const currentRoutes = await loadScheduledSavedRoutes();
  const nextRoutes = [nextRoute, ...currentRoutes.filter((route) => route.id !== nextRoute.id)].slice(0, MAX_SCHEDULED_SAVED_ROUTES);

  await AsyncStorage.setItem(SCHEDULED_SAVED_ROUTES_KEY, JSON.stringify(nextRoutes));

  return nextRoutes;
};