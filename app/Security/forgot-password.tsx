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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const trimmedPhoneNumber = phoneNumber.trim();

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

  const requestOtp = async () => {
    const normalizedPhone = normalizePhoneNumber(trimmedPhoneNumber);

    if (!normalizedPhone) {
      Alert.alert('Invalid details', 'Enter your registered phone number to continue.');
      return;
    }

    setIsSendingOtp(true);

    const { data, error } = await supabase.functions.invoke('start-rider-password-reset', {
      method: 'POST',
      body: { phone: normalizedPhone },
    });

    setIsSendingOtp(false);

    if (error) {
      Alert.alert('Unable to send OTP', await getEdgeFunctionErrorMessage(error, 'Unable to send OTP right now.'));
      return;
    }

    const pinId = typeof data?.pinId === 'string' ? data.pinId : '';
    const localPhone = typeof data?.phone === 'string' ? data.phone : trimmedPhoneNumber;

    if (!pinId) {
      Alert.alert('Unable to send OTP', 'We could not start phone verification right now. Please try again.');
      return;
    }

    router.push({
      pathname: '/Security/verify-reset-otp',
      params: {
        phone: localPhone,
        pinId,
      },
    });
  };

  const handleSendOtp = async () => {
    await requestOtp();
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
                }}
                placeholder="Enter your phone number"
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="phone-pad"
                inputMode="tel"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: trimmedPhoneNumber ? theme.colors.primary : theme.colors.border }]}
              onPress={handleSendOtp}
              disabled={!trimmedPhoneNumber || isSendingOtp}
            >
              {isSendingOtp ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.buttonText}>Continue</Text>}
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
});