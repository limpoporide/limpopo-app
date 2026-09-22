import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';

const PRIVACY_SECTIONS = [
  {
    title: 'Information We Collect',
    body:
      'We may collect account details, trip information, device signals, and payment-related records needed to provide bookings, support, safety, and fraud prevention.',
  },
  {
    title: 'How We Use Data',
    body:
      'Your information helps us match riders and drivers, improve trip accuracy, process payments, deliver support, and keep the platform secure and reliable.',
  },
  {
    title: 'Location Data',
    body:
      'Location access is used to show nearby pickup points, support trip tracking, and improve ride coordination. Some location features may not work properly if access is turned off.',
  },
  {
    title: 'Sharing and Protection',
    body:
      'We share only the minimum data required to complete rides, support operations, and comply with legal obligations. Reasonable safeguards are applied to protect stored information.',
  },
  {
    title: 'Your Choices',
    body:
      'You may review or update parts of your account profile, adjust device permissions, and contact support if you need help with privacy-related questions or requests.',
  },
] as const;

export default function PrivacyScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Privacy Policy</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.heroCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Your Privacy Matters</Text>
          <Text style={[styles.heroText, { color: theme.colors.textSecondary }]}>This page explains what information Limpopo collects, why it is used, and the choices available to you inside the app.</Text>
        </View>

        {PRIVACY_SECTIONS.map((section) => (
          <View key={section.title} style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
            <Text style={[styles.sectionBody, { color: theme.colors.textSecondary }]}>{section.body}</Text>
          </View>
        ))}

        <View style={[styles.noteCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.noteTitle, { color: theme.colors.text }]}>Privacy Requests</Text>
          <Text style={[styles.sectionBody, { color: theme.colors.textSecondary }]}>If you have questions about your data or need account assistance, contact support through the app or email support@limpopo.app.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroText: {
    fontSize: 14,
    lineHeight: 22,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  noteCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 6,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
});