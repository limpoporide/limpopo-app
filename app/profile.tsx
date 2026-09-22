import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import {
  fetchRiderProfile,
  getCachedRiderProfile,
  saveRiderProfile,
  uploadRiderProfileImage,
} from '../src/lib/rider-profile';

const LOCATION_OPTIONS = [
  {
    state: 'Lagos',
    cities: ['Agege', 'Ikeja', 'Lekki', 'Victoria Island', 'Ikoyi', 'Surulere', 'Yaba'],
  },
  {
    state: 'Abuja FCT',
    cities: ['Asokoro', 'Gwarinpa', 'Lugbe', 'Maitama', 'Wuse'],
  },
  {
    state: 'Ogun',
    cities: ['Abeokuta', 'Ifo', 'Ijebu Ode', 'Sango Ota'],
  },
  {
    state: 'Rivers',
    cities: ['Obio-Akpor', 'Port Harcourt'],
  },
] as const;

type ProfileData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  city: string;
};

type SelectorField = 'state' | 'city' | null;

export default function Profile() {
  const router = useRouter();
  const { theme } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [openSelector, setOpenSelector] = useState<SelectorField>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<ProfileData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    state: '',
    city: '',
  });

  const selectedState = LOCATION_OPTIONS.find((option) => option.state === profileData.state);
  const cityOptions = selectedState?.cities ?? [];

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const loadProfile = async () => {
        const cachedProfile = await getCachedRiderProfile();

        if (cachedProfile && isMounted) {
          setProfileData({
            firstName: cachedProfile.firstName,
            lastName: cachedProfile.lastName,
            email: cachedProfile.email,
            phone: cachedProfile.phone,
            state: cachedProfile.state,
            city: cachedProfile.city,
          });
          setProfileImage(cachedProfile.profileImg);
        }

        const latestProfile = await fetchRiderProfile();

        if (latestProfile && isMounted) {
          setProfileData({
            firstName: latestProfile.firstName,
            lastName: latestProfile.lastName,
            email: latestProfile.email,
            phone: latestProfile.phone,
            state: latestProfile.state,
            city: latestProfile.city,
          });
          setProfileImage(latestProfile.profileImg);
        }
      };

      loadProfile();

      return () => {
        isMounted = false;
      };
    }, [])
  );

  const updateField = (field: keyof ProfileData, value: string) => {
    setProfileData((current) => ({ ...current, [field]: value }));
  };

  const handleSelectState = (state: string) => {
    setProfileData((current) => ({
      ...current,
      state,
      city: current.state === state ? current.city : '',
    }));
    setOpenSelector(null);
  };

  const handleSelectCity = (city: string) => {
    setProfileData((current) => ({
      ...current,
      city,
    }));
    setOpenSelector(null);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      const latestProfile = await saveRiderProfile({
        first_name: profileData.firstName.trim(),
        last_name: profileData.lastName.trim(),
        email: profileData.email.trim().toLowerCase(),
        phone_num: profileData.phone.trim(),
        city: profileData.city || null,
        state: profileData.state || null,
      });

      if (latestProfile) {
        setProfileData({
          firstName: latestProfile.firstName,
          lastName: latestProfile.lastName,
          email: latestProfile.email,
          phone: latestProfile.phone,
          state: latestProfile.state,
          city: latestProfile.city,
        });
        setProfileImage(latestProfile.profileImg);
      }

      setIsEditing(false);
      setOpenSelector(null);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      Alert.alert('Unable to save profile', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async () => {
    const cachedProfile = await getCachedRiderProfile();

    setProfileData({
      firstName: cachedProfile?.firstName || '',
      lastName: cachedProfile?.lastName || '',
      email: cachedProfile?.email || '',
      phone: cachedProfile?.phone || '',
      state: cachedProfile?.state || '',
      city: cachedProfile?.city || '',
    });
    setProfileImage(cachedProfile?.profileImg || null);
    setIsEditing(false);
    setOpenSelector(null);
  };

  const handleUploadImage = async () => {
    try {
      setIsUploadingImage(true);
      const imageUrl = await uploadRiderProfileImage();

      if (imageUrl) {
        setProfileImage(imageUrl);
      }
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload image.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleChangePassword = () => {
    router.push('/Security/reset-password');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.backIcon, { color: theme.colors.text }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Profile</Text>
          <TouchableOpacity onPress={() => (isEditing ? handleCancel() : setIsEditing(true))} style={styles.editButton}>
            <Text style={[styles.editText, { color: theme.colors.primary }]}>{isEditing ? 'Cancel' : 'Edit Profile'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={[
              styles.avatarContainer,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
            activeOpacity={0.85}
            onPress={handleUploadImage}
            disabled={isUploadingImage}
          >
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                style={styles.avatarImage}
                onError={() => setProfileImage(null)}
              />
            ) : (
              <Text style={styles.avatarEmoji}>👤</Text>
            )}
            <View style={[styles.avatarPlusBadge, { backgroundColor: theme.colors.primary }]}> 
              <Ionicons name={isUploadingImage ? 'hourglass-outline' : 'camera-outline'} size={16} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.changePhotoButton} onPress={handleUploadImage} disabled={isUploadingImage}>
            <Text style={[styles.changePhotoText, { color: theme.colors.primary }]}>
              {isUploadingImage ? 'Uploading photo...' : 'Change Photo'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formSection}>
          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>First Name</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isEditing ? theme.colors.card : 'transparent',
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              value={profileData.firstName}
              onChangeText={(value) => updateField('firstName', value)}
              editable={isEditing}
              placeholder="Enter first name"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Last Name</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isEditing ? theme.colors.card : 'transparent',
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              value={profileData.lastName}
              onChangeText={(value) => updateField('lastName', value)}
              editable={isEditing}
              placeholder="Enter last name"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isEditing ? theme.colors.card : 'transparent',
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              value={profileData.email}
              onChangeText={(value) => updateField('email', value)}
              editable={isEditing}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="Enter email address"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Phone Number</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isEditing ? theme.colors.card : 'transparent',
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              value={profileData.phone}
              onChangeText={(value) => updateField('phone', value)}
              editable={isEditing}
              keyboardType="phone-pad"
              placeholder="Enter phone number"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>City</Text>
            <TouchableOpacity
              style={[
                styles.selector,
                {
                  backgroundColor: isEditing ? theme.colors.card : 'transparent',
                  borderColor: theme.colors.border,
                  opacity: !profileData.state && isEditing ? 0.6 : 1,
                },
              ]}
              onPress={() =>
                isEditing && profileData.state && setOpenSelector((current) => (current === 'city' ? null : 'city'))
              }
              activeOpacity={isEditing && profileData.state ? 0.85 : 1}
              disabled={!isEditing || !profileData.state}
            >
              <Text style={[styles.selectorText, { color: profileData.city ? theme.colors.text : theme.colors.textSecondary }]}> 
                {profileData.city || (profileData.state ? 'Select city' : 'Select state first')}
              </Text>
              <Ionicons name={openSelector === 'city' ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            {isEditing && openSelector === 'city' && cityOptions.length > 0 ? (
              <View style={[styles.dropdownCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
                {cityOptions.map((city, index) => (
                  <View key={city}>
                    <TouchableOpacity style={styles.dropdownOption} onPress={() => handleSelectCity(city)} activeOpacity={0.85}>
                      <Text style={[styles.dropdownOptionText, { color: theme.colors.text }]}>{city}</Text>
                      {profileData.city === city ? (
                        <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                      ) : null}
                    </TouchableOpacity>
                    {index < cityOptions.length - 1 ? (
                      <View style={[styles.dropdownDivider, { backgroundColor: theme.colors.border }]} />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>State</Text>
            <TouchableOpacity
              style={[
                styles.selector,
                {
                  backgroundColor: isEditing ? theme.colors.card : 'transparent',
                  borderColor: theme.colors.border,
                },
              ]}
              onPress={() => isEditing && setOpenSelector((current) => (current === 'state' ? null : 'state'))}
              activeOpacity={isEditing ? 0.85 : 1}
              disabled={!isEditing}
            >
              <Text style={[styles.selectorText, { color: profileData.state ? theme.colors.text : theme.colors.textSecondary }]}> 
                {profileData.state || 'Select state'}
              </Text>
              <Ionicons name={openSelector === 'state' ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            {isEditing && openSelector === 'state' ? (
              <View style={[styles.dropdownCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
                {LOCATION_OPTIONS.map((option, index) => (
                  <View key={option.state}>
                    <TouchableOpacity style={styles.dropdownOption} onPress={() => handleSelectState(option.state)} activeOpacity={0.85}>
                      <Text style={[styles.dropdownOptionText, { color: theme.colors.text }]}>{option.state}</Text>
                      {profileData.state === option.state ? (
                        <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                      ) : null}
                    </TouchableOpacity>
                    {index < LOCATION_OPTIONS.length - 1 ? (
                      <View style={[styles.dropdownDivider, { backgroundColor: theme.colors.border }]} />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.sectionDivider, { backgroundColor: theme.colors.border }]} />

        <View style={styles.optionsSection}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Account Actions</Text>
          <TouchableOpacity
            style={[
              styles.optionButton,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
            activeOpacity={0.85}
            onPress={handleChangePassword}
          >
            <Ionicons name="lock-closed-outline" size={20} color={theme.colors.text} style={styles.optionIcon} />
            <Text style={[styles.optionText, { color: theme.colors.text }]}>Change Password</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {isEditing ? (
        <View style={[styles.footer, { backgroundColor: theme.colors.background, borderTopColor: theme.colors.border }]}> 
          <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.colors.primary }]} onPress={handleSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editText: {
    fontSize: 16,
    fontWeight: '600',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarEmoji: {
    fontSize: 60,
  },
  avatarPlusBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  changePhotoButton: {
    marginTop: 12,
  },
  changePhotoText: {
    fontSize: 14,
    fontWeight: '600',
  },
  formSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  selector: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {
    fontSize: 16,
    flex: 1,
    paddingRight: 12,
  },
  dropdownCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  dropdownOption: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownOptionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dropdownDivider: {
    height: 1,
    opacity: 0.45,
  },
  sectionDivider: {
    height: 1,
    opacity: 0.5,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  optionsSection: {
    paddingHorizontal: 20,
    marginBottom: 100,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  optionIcon: {
    marginRight: 16,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  saveButton: {
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
