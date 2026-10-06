import React, { useEffect, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function VerifyResetOtpScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { phone, pinId } = useLocalSearchParams<{ phone?: string; pinId?: string }>();
  const resetPhone = typeof phone === 'string' ? phone : '';
  const [otp, setOtp] = useState('');
  const [currentPinId, setCurrentPinId] = useState(typeof pinId === 'string' ? pinId : '');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (resendCountdown <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setResendCountdown((currentValue) => Math.max(currentValue - 1, 0));
    }, 1000);

    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const getErrorMessage = (error: unknown, fallbackMessage: string) => {
    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }

    if (error && typeof error === 'object') {
      const errorRecord = error as Record<string, unknown>;

      if (typeof errorRecord.message === 'string' && errorRecord.message.trim().length > 0) {
        return errorRecord.message;
      }

      if (typeof errorRecord.error === 'string' && errorRecord.error.trim().length > 0) {
        return errorRecord.error;
      }

      if (typeof errorRecord.details === 'string' && errorRecord.details.trim().length > 0) {
        return errorRecord.details;
      }
    }

    return fallbackMessage;
  };

  const getEdgeFunctionErrorMessage = async (error: unknown, fallbackMessage: string) => {
    if (error && typeof error === 'object') {
      const errorRecord = error as Record<string, unknown>;
      const context = errorRecord.context;

      if (context instanceof Response) {
        try {
          const payload = await context.clone().json();
          return getErrorMessage(payload, fallbackMessage);
        } catch {
          try {
            const responseText = await context.clone().text();
            if (responseText.trim().length > 0) {
              return responseText.trim();
            }
          } catch {
            // Fall through to generic error handling below.
          }
        }
      }
    }

    return getErrorMessage(error, fallbackMessage);
  };

  const handleVerifyOtp = async () => {
    if (!resetPhone) {
      Alert.alert('Reset expired', 'Start password reset again from the previous screen.');
      router.replace('/Security/forgot-password');
      return;
    }

    if (!currentPinId) {
      Alert.alert('Verification expired', 'Request a new OTP to continue.');
      return;
    }

    if (otp.length !== OTP_LENGTH) {
      Alert.alert('Invalid OTP', `Enter the ${OTP_LENGTH}-digit OTP sent to you.`);
      return;
    }

    setIsVerifyingOtp(true);

    const { data, error } = await supabase.functions.invoke('verify-rider-password-reset-otp', {
      method: 'POST',
      body: {
        phone: resetPhone,
        pinId: currentPinId,
        otp,
      },
    });

    setIsVerifyingOtp(false);

    if (error) {
      Alert.alert('Verification failed', await getEdgeFunctionErrorMessage(error, 'The OTP code is invalid or has expired.'));
      return;
    }

    const resetToken = typeof data?.resetToken === 'string' ? data.resetToken : '';

    if (!resetToken) {
      Alert.alert('Verification failed', 'We could not continue with password reset right now.');
      return;
    }

    router.push({
      pathname: '/Security/create-password',
      params: {
        identifier: resetPhone,
        phone: resetPhone,
        resetToken,
      },
    });
  };

  const handleResendOtp = async () => {
    if (!resetPhone) {
      Alert.alert('Reset expired', 'Start password reset again from the previous screen.');
      router.replace('/Security/forgot-password');
      return;
    }

    if (resendCountdown > 0 || isResendingOtp) {
      return;
    }

    setIsResendingOtp(true);

    const { data, error } = await supabase.functions.invoke('start-rider-password-reset', {
      method: 'POST',
      body: { phone: resetPhone },
    });

    setIsResendingOtp(false);

    if (error) {
      Alert.alert('Unable to resend OTP', await getEdgeFunctionErrorMessage(error, 'Unable to send a new OTP right now.'));
      return;
    }

    const nextPinId = typeof data?.pinId === 'string' ? data.pinId : '';

    if (!nextPinId) {
      Alert.alert('Unable to resend OTP', 'We could not start phone verification right now. Please try again.');
      return;
    }

    setCurrentPinId(nextPinId);
    setOtp('');
    setResendCountdown(RESEND_SECONDS);
    Alert.alert('OTP sent', 'A new OTP has been sent to your phone.');
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

            <Text style={[styles.title, { color: theme.colors.text }]}>Verify OTP</Text>
          </View>

          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}> 
            {resetPhone ? `Enter the 6-digit OTP sent to ${resetPhone}.` : 'Enter the 6-digit OTP sent to your phone.'}
          </Text>

          <View style={styles.form}>
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

            <TouchableOpacity
              style={[styles.button, { backgroundColor: otp.length === OTP_LENGTH && !isVerifyingOtp ? theme.colors.primary : theme.colors.border }]}
              onPress={handleVerifyOtp}
              disabled={otp.length !== OTP_LENGTH || isVerifyingOtp}
            >
              {isVerifyingOtp ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.buttonText}>Verify OTP</Text>}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={[styles.resendPrompt, { color: theme.colors.textSecondary }]}>Didn't get the code?</Text>
              <TouchableOpacity onPress={handleResendOtp} disabled={resendCountdown > 0 || isResendingOtp}>
                <Text
                  style={[
                    styles.resendAction,
                    { color: resendCountdown > 0 || isResendingOtp ? theme.colors.textSecondary : theme.colors.primary },
                  ]}
                >
                  {isResendingOtp ? 'Sending...' : resendCountdown > 0 ? `Retry in ${resendCountdown}s` : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            </View>
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
  resendRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  resendPrompt: {
    fontSize: 14,
  },
  resendAction: {
    fontSize: 14,
    fontWeight: '600',
  },
});