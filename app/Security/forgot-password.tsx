import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';

const OTP_LENGTH = 6;
const MAX_RECOVERY_RETRIES = 3;
const RECOVERY_RETRY_STORAGE_KEY = 'rider_password_recovery_retries';

const normalizePhoneNumber = (value: string) => {
  const digitsOnly = value.replace(/\D/g, '');

  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return `+234${digitsOnly.slice(1)}`;
  }

  if (digitsOnly.length === 10) {
    return `+234${digitsOnly}`;
  }

  if (digitsOnly.length === 13 && digitsOnly.startsWith('234')) {
    return `+${digitsOnly}`;
  }

  if (value.startsWith('+') && digitsOnly.length >= 10) {
    return `+${digitsOnly}`;
  }

  return null;
};

const isUnregisteredPhoneError = (message: string) => {
  const normalizedMessage = message.toLowerCase();

  return normalizedMessage.includes('user not found')
    || normalizedMessage.includes('signup is disabled')
    || normalizedMessage.includes('signups not allowed');
};

const readRetryMap = async () => {
  const rawValue = await AsyncStorage.getItem(RECOVERY_RETRY_STORAGE_KEY);
  return rawValue ? JSON.parse(rawValue) as Record<string, number> : {};
};

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [normalizedPhoneNumber, setNormalizedPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [hasRequestedOtp, setHasRequestedOtp] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const trimmedPhoneNumber = phoneNumber.trim();

  const setRetryCount = async (normalizedPhone: string, count: number) => {
    const retryMap = await readRetryMap();
    retryMap[normalizedPhone] = count;
    await AsyncStorage.setItem(RECOVERY_RETRY_STORAGE_KEY, JSON.stringify(retryMap));
  };

  const clearRetryCount = async (normalizedPhone: string) => {
    const retryMap = await readRetryMap();

    if (!(normalizedPhone in retryMap)) {
      return;
    }

    delete retryMap[normalizedPhone];
    await AsyncStorage.setItem(RECOVERY_RETRY_STORAGE_KEY, JSON.stringify(retryMap));
  };

  const showRetryLimitAlert = () => {
    Alert.alert(
      'Recovery limit exceeded',
      'You have exceeded your recovery limit, please contact us to assist you further: support@limpoporide.com'
    );
  };

  const requestOtp = async (isResend: boolean) => {
    const normalizedPhone = normalizePhoneNumber(trimmedPhoneNumber);

    if (!normalizedPhone) {
      Alert.alert('Invalid details', 'Enter your registered phone number to continue.');
      return;
    }

    if (isResend) {
      const retryMap = await readRetryMap();
      const retryCount = retryMap[normalizedPhone] ?? 0;

      if (retryCount >= MAX_RECOVERY_RETRIES) {
        showRetryLimitAlert();
        return;
      }
    }

    setIsSendingOtp(true);

    const response = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
      options: { shouldCreateUser: false },
    });

    setIsSendingOtp(false);

    if (response.error) {
      if (isUnregisteredPhoneError(response.error.message)) {
        Alert.alert('Not registered', 'Phone number not registered');
        return;
      }

      Alert.alert('Unable to send OTP', response.error.message);
      return;
    }

    if (isResend) {
      const retryMap = await readRetryMap();
      const retryCount = retryMap[normalizedPhone] ?? 0;
      await setRetryCount(normalizedPhone, retryCount + 1);
    }

    setNormalizedPhoneNumber(normalizedPhone);
    setOtp('');
    setHasRequestedOtp(true);

    Alert.alert('OTP sent', `Enter the ${OTP_LENGTH}-digit OTP sent to your phone number.`);
  };

  const handleSendOtp = async () => {
    await requestOtp(false);
  };

  const handleResendOtp = async () => {
    await requestOtp(true);
  };

  const handleVerifyOtp = async () => {
    if (!normalizedPhoneNumber) {
      Alert.alert('Request OTP first', 'Send an OTP to continue with password recovery.');
      return;
    }

    if (otp.length !== OTP_LENGTH) {
      Alert.alert('Invalid OTP', `Enter the ${OTP_LENGTH}-digit OTP sent to you.`);
      return;
    }

    setIsVerifyingOtp(true);

    const response = await supabase.auth.verifyOtp({
      phone: normalizedPhoneNumber,
      token: otp,
      type: 'sms',
    });

    setIsVerifyingOtp(false);

    if (response.error) {
      Alert.alert('Verification failed', response.error.message);
      return;
    }

    await clearRetryCount(normalizedPhoneNumber);

    router.push({
      pathname: '/Security/create-password',
      params: {
        identifier: trimmedPhoneNumber,
      },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
            </TouchableOpacity>

            <Text style={[styles.title, { color: theme.colors.text }]}>Reset Password</Text>
          </View>

          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}> 
            Enter your registered phone number. We will only send an OTP if the account already exists.
          </Text>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: theme.colors.text }]}>Phone Number</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.card,
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                  },
                ]}
                value={phoneNumber}
                onChangeText={(value) => {
                  setPhoneNumber(value.replace(/\D/g, '').slice(0, 11));
                  setOtp('');
                  setNormalizedPhoneNumber('');
                  setHasRequestedOtp(false);
                }}
                placeholder="Enter your phone number"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="phone-pad"
                inputMode="tel"
              />
            </View>

            {hasRequestedOtp ? (
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: theme.colors.text }]}>OTP Code</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.card,
                      color: theme.colors.text,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  value={otp}
                  onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                  placeholder="Enter 6-digit OTP"
                  placeholderTextColor={theme.colors.textSecondary}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={OTP_LENGTH}
                />
              </View>
            ) : null}

            {!hasRequestedOtp ? (
              <TouchableOpacity
                style={[styles.button, { backgroundColor: trimmedPhoneNumber ? theme.colors.primary : theme.colors.border }]}
                onPress={handleSendOtp}
                disabled={!trimmedPhoneNumber || isSendingOtp}
              >
                {isSendingOtp ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.buttonText}>Send OTP</Text>}
              </TouchableOpacity>
            ) : null}

            {hasRequestedOtp ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.button,
                    {
                      backgroundColor: otp.length === OTP_LENGTH ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={handleVerifyOtp}
                  disabled={otp.length !== OTP_LENGTH || isVerifyingOtp}
                >
                  {isVerifyingOtp ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.buttonText}>Verify Phone</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={handleResendOtp} disabled={isSendingOtp} style={styles.resendButton}>
                  <Text style={[styles.resendText, { color: theme.colors.primary }]}>I didn't get an OTP - resend</Text>
                </TouchableOpacity>
              </>
            ) : null}
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
  keyboardAvoider: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 25,
    fontWeight: 'bold',
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
  },
  form: {
    gap: 14,
  },
  inputContainer: {
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  button: {
    marginTop: 16,
    minHeight: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 14,
    fontWeight: '600',
  },
});