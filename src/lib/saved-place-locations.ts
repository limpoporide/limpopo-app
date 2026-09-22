import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedPlaceLocationType = 'pickup' | 'dropoff';

export type SavedPlaceLocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type SavedPlaceLocation = {
  id: string;
  type: SavedPlaceLocationType;
  label: string;
  coords: SavedPlaceLocationCoordinates | null;
};

const SAVED_PLACE_LOCATIONS_KEY = 'saved_place_locations';
const MAX_SAVED_PLACE_LOCATIONS_PER_TYPE = 8;

const sanitizeCoords = (value: unknown): SavedPlaceLocationCoordinates | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const coords = value as Partial<SavedPlaceLocationCoordinates>;
  const latitude = typeof coords.latitude === 'number' ? coords.latitude : null;
  const longitude = typeof coords.longitude === 'number' ? coords.longitude : null;

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
};

const sanitizeEntry = (value: unknown): SavedPlaceLocation | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const entry = value as Partial<SavedPlaceLocation>;
  const label = typeof entry.label === 'string' ? entry.label.trim() : '';
  const type = entry.type === 'pickup' || entry.type === 'dropoff' ? entry.type : null;

  if (!label || !type) {
    return null;
  }

  return {
    id: `${type}:${label}`,
    type,
    label,
    coords: sanitizeCoords(entry.coords),
  };
};

const loadAllSavedPlaceLocations = async (): Promise<SavedPlaceLocation[]> => {
  try {
    const cachedValue = await AsyncStorage.getItem(SAVED_PLACE_LOCATIONS_KEY);

    if (!cachedValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(cachedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map(sanitizeEntry)
      .filter((entry): entry is SavedPlaceLocation => entry !== null);
  } catch {
    return [];
  }
};

export const loadSavedPlaceLocations = async (
  type: SavedPlaceLocationType
): Promise<SavedPlaceLocation[]> => {
  const allEntries = await loadAllSavedPlaceLocations();

  return allEntries.filter((entry) => entry.type === type).slice(0, MAX_SAVED_PLACE_LOCATIONS_PER_TYPE);
};

export const saveSavedPlaceLocation = async (
  type: SavedPlaceLocationType,
  label: string,
  coords: SavedPlaceLocationCoordinates | null
): Promise<SavedPlaceLocation[]> => {
  const trimmedLabel = label.trim();

  if (!trimmedLabel) {
    return loadSavedPlaceLocations(type);
  }

  const nextEntry: SavedPlaceLocation = {
    id: `${type}:${trimmedLabel}`,
    type,
    label: trimmedLabel,
    coords,
  };

  const allEntries = await loadAllSavedPlaceLocations();
  const otherTypeEntries = allEntries.filter((entry) => entry.type !== type);
  const sameTypeEntries = allEntries.filter((entry) => entry.type === type && entry.id !== nextEntry.id);
  const nextSameTypeEntries = [nextEntry, ...sameTypeEntries].slice(0, MAX_SAVED_PLACE_LOCATIONS_PER_TYPE);

  await AsyncStorage.setItem(
    SAVED_PLACE_LOCATIONS_KEY,
    JSON.stringify([...otherTypeEntries, ...nextSameTypeEntries])
  );

  return nextSameTypeEntries;
};
