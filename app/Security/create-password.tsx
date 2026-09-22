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
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../src/lib/supabase';

const normalizePasswordInput = (text: string) => text.replace(/\D/g, '').slice(0, 6);

export default function CreatePasswordScreen() {
  const router = useRouter();
  const { identifier } = useLocalSearchParams<{ identifier?: string }>();
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const hasValidPasswordFormat = password.length === 6;
  const hasValidConfirmPasswordFormat = confirmPassword.length === 6;
  const passwordsMatch = hasValidPasswordFormat && hasValidConfirmPasswordFormat && password === confirmPassword;

  useEffect(() => {
    if (!showSuccessToast) {
      return;
    }

    const timeout = setTimeout(() => {
      const finishRecovery = async () => {
        setShowSuccessToast(false);
        await supabase.auth.signOut();
        router.replace('/login');
      };

      finishRecovery();
    }, 1800);

    return () => clearTimeout(timeout);
  }, [router, showSuccessToast]);

  const handleConfirm = async () => {
    if (!hasValidPasswordFormat || !hasValidConfirmPasswordFormat) {
      return;
    }

    if (!passwordsMatch) {
      return;
    }

    setIsUpdatingPassword(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setIsUpdatingPassword(false);
      Alert.alert('Verification expired', 'Request and verify a new OTP before setting your password.');
      router.replace('/Security/forgot-password');
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setIsUpdatingPassword(false);

    if (error) {
      Alert.alert('Unable to update password', error.message);
      return;
    }

    if (Platform.OS === 'android') {
      ToastAndroid.show('Password updated successfully', ToastAndroid.SHORT);
    }

    setShowSuccessToast(true);
  };

  const renderPasswordField = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    isVisible: boolean,
    onToggleVisibility: () => void,
    placeholder: string
  ) => (
    <View style={styles.inputContainer}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.card,
              color: theme.colors.text,
              borderColor: theme.colors.border,
            },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textSecondary}
          secureTextEntry={!isVisible}
          keyboardType="number-pad"
          maxLength={6}
        />
        <TouchableOpacity onPress={onToggleVisibility} style={styles.eyeButton}>
          <Ionicons
            name={isVisible ? 'eye-outline' : 'eye-off-outline'}
            size={20}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {showSuccessToast && Platform.OS !== 'android' ? (
            <View style={[styles.toast, { backgroundColor: theme.colors.success }]}> 
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <Text style={styles.toastText}>Password updated successfully</Text>
            </View>
          ) : null}

          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
            </TouchableOpacity>

            <Text style={[styles.title, { color: theme.colors.text }]}>Create Password</Text>
          </View>

          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}> 
            {identifier ? `Set a new password for ${identifier}.` : 'Set your new password to continue.'}
          </Text>

          <View style={styles.form}>
            {renderPasswordField(
              'New Password',
              password,
              (text) => setPassword(normalizePasswordInput(text)),
              showPassword,
              () => setShowPassword((current) => !current),
              'Create a 6-digit password'
            )}

            {renderPasswordField(
              'Confirm Password',
              confirmPassword,
              (text) => setConfirmPassword(normalizePasswordInput(text)),
              showConfirmPassword,
              () => setShowConfirmPassword((current) => !current),
              'Confirm your 6-digit password'
            )}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: passwordsMatch ? theme.colors.primary : theme.colors.border }]}
              onPress={handleConfirm}
              disabled={!passwordsMatch || isUpdatingPassword}
            >
              {isUpdatingPassword ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.buttonText}>Confirm</Text>}
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
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24,
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
  inputShell: {
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: 14,
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
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});