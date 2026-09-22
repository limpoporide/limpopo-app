import AsyncStorage from '@react-native-async-storage/async-storage';

const RIDER_BALANCE_VISIBILITY_KEY = 'rider_balance_visibility';

export const getStoredRiderBalanceVisibility = async () => {
  const storedValue = await AsyncStorage.getItem(RIDER_BALANCE_VISIBILITY_KEY);

  if (storedValue === null) {
    return true;
  }

  return storedValue === 'true';
};

export const setStoredRiderBalanceVisibility = async (isVisible: boolean) => {
  await AsyncStorage.setItem(RIDER_BALANCE_VISIBILITY_KEY, String(isVisible));
};