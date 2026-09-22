import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/context/ThemeContext';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasValidNewPin = /^\d{6}$/.test(newPin);
  const hasValidConfirmPin = /^\d{6}$/.test(confirmPin);
  const passwordsMatch = hasValidNewPin && hasValidConfirmPin && newPin === confirmPin;

  const surfaceTone = useMemo(
    () => (isDark ? 'rgba(206, 160, 7, 0.12)' : '#F7F1E1'),
    [isDark]
  );

  useEffect(() => {
    const loadUserPhone = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        return;
      }

      const linkedPhone = user.phone || user.user_metadata?.phone_num || '';
      setPhoneNumber(String(linkedPhone));
    };

    loadUserPhone();
  }, []);

  const handleSubmit = async () => {
    if (!/^\d{6}$/.test(newPin)) {
      Alert.alert('Invalid password', 'Your new password must be exactly 6 digits.');
      return;
    }

    if (newPin !== confirmPin) {
      Alert.alert('Passwords do not match', 'Confirm the same 6-digit password to continue.');
      return;
    }

    setIsSubmitting(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setIsSubmitting(false);
      Alert.alert('Session expired', 'Sign in again before updating your password.');
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPin,
    });

    setIsSubmitting(false);

    if (error) {
      Alert.alert('Unable to update password', error.message);
      return;
    }

    setNewPin('');
    setConfirmPin('');

    Alert.alert('Password updated', 'Your account password has been changed successfully.', [
      {
        text: 'OK',
        onPress: () => router.replace('/(tabs)/settings'),
      },
    ]);
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={[
                styles.backButton,
                { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
              ]}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Reset Password</Text>
            <TouchableOpacity onPress={() => router.push('/Security/emergency')} activeOpacity={0.8}>
              <Text style={[styles.headerLink, { color: theme.colors.primary }]}>Tips</Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.heroCard,
              { backgroundColor: surfaceTone, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.heroTopRow}>
              <View style={[styles.heroIcon, { backgroundColor: theme.colors.primary }]}>
                <Ionicons name="shield-checkmark-outline" size={24} color="#FFFFFF" />
              </View>
              <View
                style={[
                  styles.heroChip,
                  {
                    backgroundColor: isDark ? 'rgba(206, 160, 7, 0.16)' : '#F0E2B5',
                  },
                ]}
              >
                <Text style={[styles.heroChipText, { color: isDark ? '#F7E7A8' : '#6C5100' }]}>Account security</Text>
              </View>
            </View>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Secure your account</Text>
            
          </View>

          <View
            style={[
              styles.formCard,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Reset details</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>update the password for your account</Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.colors.text }]}>Phone Number</Text>
              <View
                style={[
                  styles.inputRow,
                  styles.readOnlyInput,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Ionicons name="call-outline" size={18} color={theme.colors.textSecondary} />
                <TextInput
                  value={phoneNumber}
                  editable={false}
                  selectTextOnFocus={false}
                  style={[styles.inputField, { color: theme.colors.textSecondary }]}
                  placeholder="No phone number linked"
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.colors.text }]}>New 6-Digit Password</Text>
              <View
                style={[
                  styles.inputRow,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Ionicons name="lock-closed-outline" size={18} color={theme.colors.textSecondary} />
                <TextInput
                  value={newPin}
                  onChangeText={(value) => setNewPin(value.replace(/\D/g, '').slice(0, 6))}
                  style={[styles.inputField, { color: theme.colors.text }]}
                  placeholder="xxxxxx"
                  placeholderTextColor={theme.colors.textSecondary}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={6}
                  secureTextEntry={!showNewPin}
                />
                <TouchableOpacity
                  onPress={() => setShowNewPin((current) => !current)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={showNewPin ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.colors.text }]}>Confirm Password</Text>
              <View
                style={[
                  styles.inputRow,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor:
                      confirmPin.length > 0 && !passwordsMatch ? theme.colors.error : theme.colors.border,
                  },
                ]}
              >
                <Ionicons name="key-outline" size={18} color={theme.colors.textSecondary} />
                <TextInput
                  value={confirmPin}
                  onChangeText={(value) => setConfirmPin(value.replace(/\D/g, '').slice(0, 6))}
                  style={[styles.inputField, { color: theme.colors.text }]}
                  placeholder="xxxxxx"
                  placeholderTextColor={theme.colors.textSecondary}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={6}
                  secureTextEntry={!showConfirmPin}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPin((current) => !current)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={showConfirmPin ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {confirmPin.length > 0 && !passwordsMatch ? (
                <Text style={[styles.validationText, { color: theme.colors.error }]}>Passwords must match before you can update.</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  backgroundColor: passwordsMatch ? theme.colors.primary : theme.colors.border,
                  opacity: isSubmitting ? 0.7 : passwordsMatch ? 1 : 0.7,
                },
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting || !passwordsMatch}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? 'Updating...' : 'Update Password'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  heroCard: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: -5,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  heroChipText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 22,
  },
  formCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginHorizontal: -4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 18,
  },
  fieldGroup: {
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputRow: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 54,
    paddingLeft: 14,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  readOnlyInput: {
    opacity: 0.92,
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  primaryButton: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  validationText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});