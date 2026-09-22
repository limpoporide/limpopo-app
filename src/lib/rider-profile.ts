import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

const RIDER_PROFILE_CACHE_KEY = 'rider_profile_cache';

export type RiderProfileView = {
  uuid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  profileImg: string | null;
  walletBalance: number;
  phoneVerified: boolean;
  walletAccount: string | null;
  bankName: string | null;
  accountName: string | null;
  visibility: boolean;
};

const normalizeRiderProfile = (profile: {
  uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_num: string;
  city: string | null;
  state: string | null;
  profile_img: string | null;
  wallet_balance: number;
  phone_verified: boolean;
  wallet_account?: string | null;
  bank_name?: string | null;
  account_name?: string | null;
  visibility?: boolean | null;
}): RiderProfileView => ({
  uuid: profile.uuid,
  firstName: profile.first_name || '',
  lastName: profile.last_name || '',
  email: profile.email || '',
  phone: profile.phone_num || '',
  city: profile.city || '',
  state: profile.state || '',
  profileImg: profile.profile_img || null,
  walletBalance: Number(profile.wallet_balance || 0),
  phoneVerified: profile.phone_verified ?? false,
  walletAccount: profile.wallet_account || null,
  bankName: profile.bank_name || null,
  accountName: profile.account_name || null,
  visibility: profile.visibility ?? true,
});

export const getCachedRiderProfile = async () => {
  const cachedValue = await AsyncStorage.getItem(RIDER_PROFILE_CACHE_KEY);

  if (!cachedValue) {
    return null;
  }

  return JSON.parse(cachedValue) as RiderProfileView;
};

export const cacheRiderProfile = async (profile: RiderProfileView) => {
  await AsyncStorage.setItem(RIDER_PROFILE_CACHE_KEY, JSON.stringify(profile));
};

export const fetchRiderProfile = async () => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from('rider_profile')
    .select(
      'uuid, first_name, last_name, email, phone_num, city, state, profile_img, wallet_balance, phone_verified, wallet_account, bank_name, account_name, visibility'
    )
    .eq('uuid', user.id)
    .single();

  if (error || !data) {
    return null;
  }

  const profile = normalizeRiderProfile(data);
  await cacheRiderProfile(profile);
  return profile;
};

export const saveRiderProfile = async (updates: {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_num?: string;
  city?: string | null;
  state?: string | null;
  profile_img?: string | null;
  visibility?: boolean;
}) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Unable to get authenticated user.');
  }

  const { error } = await supabase.from('rider_profile').update(updates).eq('uuid', user.id);

  if (error) {
    throw error;
  }

  return fetchRiderProfile();
};

export const setRiderProfileVisibility = async (visibility: boolean) => {
  return saveRiderProfile({ visibility });
};

export const updateRiderPushToken = async (expoPushToken: string) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !expoPushToken.trim()) {
    return;
  }

  const { error } = await supabase
    .from('rider_profile')
    .update({
      expo_push_token: expoPushToken,
      push_token_updated_at: new Date().toISOString(),
    })
    .eq('uuid', user.id);

  if (error) {
    throw error;
  }
};

export const uploadRiderProfileImage = async () => {
  let DocumentPicker: typeof import('expo-document-picker');

  try {
    DocumentPicker = await import('expo-document-picker');
  } catch {
    throw new Error('Image upload requires a rebuilt development build with expo-document-picker included.');
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: 'image/*',
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (!asset.uri) {
    throw new Error('Unable to read the selected file.');
  }

  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = 'limpopo-asset';

  if (!cloudName) {
    throw new Error('Cloudinary cloud name is not configured.');
  }

  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    type: asset.mimeType || 'image/jpeg',
    name: asset.name || 'rider-profile.jpg',
  } as any);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', 'limpopo_rider_profiles');

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Unable to upload image to Cloudinary.');
  }

  const imageUrl = data.secure_url as string;
  await saveRiderProfile({ profile_img: imageUrl });
  return imageUrl;
};

export const createRiderVirtualAccount = async () => {
  const { data, error } = await supabase.functions.invoke('create-virtual-account', {
    method: 'POST',
  });

  if (error) {
    throw error;
  }

  return data as { walletAccount: string; bankName: string | null; accountName: string | null };
};