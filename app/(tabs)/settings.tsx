import React, { useCallback, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Image,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { fetchRiderProfile, getCachedRiderProfile } from '../../src/lib/rider-profile';
import { supabase } from '../../src/lib/supabase';

type BaseSettingsItem = {
  icon: string;
  label: string;
  subtitle: string;
};

type PressableSettingsItem = BaseSettingsItem & {
  onPress?: () => void;
  hasSwitch?: false;
  switchValue?: never;
  onSwitchChange?: never;
};

type SwitchSettingsItem = BaseSettingsItem & {
  hasSwitch: true;
  switchValue: boolean;
  onSwitchChange: (value: boolean) => void;
  onPress?: never;
};

type SettingsItem = PressableSettingsItem | SwitchSettingsItem;

type SettingsSection = {
  title: string;
  items: SettingsItem[];
};

export default function Settings() {
  const router = useRouter();
  const { theme, themeMode, setThemeMode, isDark } = useTheme();
  const [profileName, setProfileName] = useState('Rider');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const loadProfile = async () => {
        const cachedProfile = await getCachedRiderProfile();

        if (cachedProfile && isMounted) {
          setProfileName(`${cachedProfile.firstName} ${cachedProfile.lastName}`.trim() || 'Rider');
          setProfileEmail(cachedProfile.email);
          setProfileImage(cachedProfile.profileImg);
        }

        const latestProfile = await fetchRiderProfile();

        if (latestProfile && isMounted) {
          setProfileName(`${latestProfile.firstName} ${latestProfile.lastName}`.trim() || 'Rider');
          setProfileEmail(latestProfile.email);
          setProfileImage(latestProfile.profileImg);
        }
      };

      loadProfile();

      return () => {
        isMounted = false;
      };
    }, [])
  );

  const handleThemeChange = (value: boolean) => {
    if (themeMode === 'system') {
      setThemeMode(value ? 'dark' : 'light');
    } else {
      setThemeMode(value ? 'dark' : 'light');
    }
  };

  const handlePrivacyModalClose = () => {
    setShowPrivacyModal(false);
  };

  const handleEmergencyPress = () => {
    setShowPrivacyModal(false);
    router.push('/Security/emergency');
  };

  const handleResetPasswordPress = () => {
    setShowPrivacyModal(false);
    router.push('/Security/reset-password');
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert('Logout failed', error.message);
      return;
    }

    await AsyncStorage.multiRemove([
      'rider_profile_cache',
      'rider_transactions_cache',
    ]);

    router.replace('/login');
  };

  const settingsSections: SettingsSection[] = [
    {
      title: 'Account',
      items: [
        {
          icon: '👤',
          label: 'Profile',
          subtitle: 'Manage your profile information',
          onPress: () => router.push('/profile'),
        },
        {
          icon: '🔐',
          label: 'Privacy & Security',
          subtitle: 'Password, biometrics, and privacy settings',
          onPress: () => setShowPrivacyModal(true),
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          icon: isDark ? '🌙' : '☀️',
          label: 'Dark Mode',
          subtitle: themeMode === 'system' ? 'System default' : isDark ? 'Enabled' : 'Disabled',
          hasSwitch: true,
          switchValue: isDark,
          onSwitchChange: handleThemeChange,
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          icon: '❓',
          label: 'Help Center',
          subtitle: 'FAQs and support articles',
          onPress: () => router.push('/support/faq'),
        },
        // {
        //   icon: '💬',
        //   label: 'Contact Support',
        //   subtitle: 'Get help from our team',
        // },
        {
          icon: '📋',
          label: 'Terms & Conditions',
          subtitle: 'Read our terms of service',
          onPress: () => router.push('/support/terms'),
        },
        {
          icon: '🔒',
          label: 'Privacy Policy',
          subtitle: 'How we handle your data',
          onPress: () => router.push('/support/privacy'),
        },
      ],
    },
    {
      title: '',
      items: [
        {
          icon: 'ℹ️',
          label: 'About',
          subtitle: 'Version 1.0.0',
        },
        {
          icon: '⭐',
          label: 'Rate App',
          subtitle: 'Share your feedback',
        },
      ],
    },
  ];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* User Profile Header */}
        <View style={styles.profileSection}>
          <View
            style={[
              styles.profileCard,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.avatarLarge}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarLargeImage} />
              ) : (
                <Text style={styles.avatarLargeText}>👤</Text>
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: theme.colors.text }]}>
                {profileName}
              </Text>
              <Text style={[styles.profileEmail, { color: theme.colors.textSecondary }]}>
                {profileEmail}
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/profile')}>
              <Text style={styles.editButton}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings Sections */}
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            {section.title ? (
              <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
                {section.title}
              </Text>
            ) : null}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
              ]}
            >
              {section.items.map((item, itemIndex) => (
                <View key={itemIndex}>
                  <TouchableOpacity
                    style={styles.settingItem}
                    onPress={item.onPress}
                    disabled={item.hasSwitch}
                  >
                    <View style={styles.settingLeft}>
                      <View style={styles.settingIcon}>
                        <Text style={styles.settingIconText}>{item.icon}</Text>
                      </View>
                      <View style={styles.settingTextContainer}>
                        <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                          {item.label}
                        </Text>
                        {item.subtitle && (
                          <Text
                            style={[styles.settingSubtitle, { color: theme.colors.textSecondary }]}
                          >
                            {item.subtitle}
                          </Text>
                        )}
                      </View>
                    </View>
                    {item.hasSwitch ? (
                      <Switch
                        value={item.switchValue}
                        onValueChange={item.onSwitchChange}
                        trackColor={{
                          false: theme.colors.border,
                          true: theme.colors.primary,
                        }}
                        thumbColor="#FFFFFF"
                      />
                    ) : (
                      <Text style={[styles.chevron, { color: theme.colors.textSecondary }]}>
                        ›
                      </Text>
                    )}
                  </TouchableOpacity>
                  {itemIndex < section.items.length - 1 && (
                    <View
                      style={[styles.divider, { backgroundColor: theme.colors.border }]}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <View style={styles.logoutSection}>
          <TouchableOpacity
            style={[
              styles.logoutButton,
              { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error },
            ]}
            onPress={handleLogout}
          >
            <Text style={[styles.logoutText, { color: theme.colors.error }]}>
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Privacy & Security Modal */}
      <Modal
        visible={showPrivacyModal}
        transparent
        animationType="fade"
        onRequestClose={handlePrivacyModalClose}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.card }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Privacy & Security</Text>
              <TouchableOpacity onPress={handlePrivacyModalClose} style={styles.modalCloseButton}>
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {/* Modal Body */}
            <View style={styles.modalBody}>
              <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
                Choose an option below
              </Text>

              {/* Option 1: Emergency Tips */}
              <TouchableOpacity
                style={[styles.optionCard, { borderColor: theme.colors.border }]}
                onPress={handleEmergencyPress}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIcon, { backgroundColor: isDark ? 'rgba(206, 160, 7, 0.2)' : '#FFE6CC' }]}>
                  <Ionicons name="shield-checkmark-outline" size={24} color={theme.colors.primary} />
                </View>
                <View style={styles.optionTextBlock}>
                  <Text style={[styles.optionLabel, { color: theme.colors.text }]}>
                    Security Tips
                  </Text>
                  <Text style={[styles.optionDescription, { color: theme.colors.textSecondary }]}>
                    Learn safety practices for every ride
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>

              {/* Option 2: Reset Password */}
              <TouchableOpacity
                style={[styles.optionCard, { borderColor: theme.colors.border }]}
                onPress={handleResetPasswordPress}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIcon, { backgroundColor: isDark ? 'rgba(206, 160, 7, 0.2)' : '#FFE6CC' }]}>
                  <Ionicons name="key-outline" size={24} color={theme.colors.primary} />
                </View>
                <View style={styles.optionTextBlock}>
                  <Text style={[styles.optionLabel, { color: theme.colors.text }]}>
                    Reset Password
                  </Text>
                  <Text style={[styles.optionDescription, { color: theme.colors.textSecondary }]}>
                    Update your account password
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarLargeImage: {
    width: '100%',
    height: '100%',
  },
  avatarLargeText: {
    fontSize: 36,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
  },
  editButton: {
    fontSize: 28,
    color: '#999',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionCard: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  settingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingIconText: {
    fontSize: 24,
  },
  settingTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
  },
  chevron: {
    fontSize: 24,
  },
  divider: {
    height: 1,
    marginLeft: 68,
  },
  logoutSection: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  logoutButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 24,
    paddingBottom: 20,
    width: '88%',
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 12,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionTextBlock: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  optionDescription: {
    fontSize: 12,
  },
});
