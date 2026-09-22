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

const FAQ_ITEMS = [
  {
    question: 'How do I book a ride?',
    answer:
      'Open the home screen, choose your ride type, confirm your pickup and destination, then select a vehicle to continue.',
  },
  {
    question: 'How do I fund my wallet?',
    answer:
      'Go to Wallet, copy your wallet account details for direct funding, or add a bank card when card funding is available.',
  },
  {
    question: 'Can I change my pickup point after booking?',
    answer:
      'If a driver has not yet accepted the trip, you can go back and update your trip details. After acceptance, contact support for assistance.',
  },
  {
    question: 'How do I contact support?',
    answer:
      'Use the Contact Support option in Settings or reach out through the support channels listed below for trip, payment, or account help.',
  },
  {
    question: 'When will my refund be processed?',
    answer:
      'Eligible refunds are reviewed first. Once approved, wallet reversals are usually completed faster than card or bank settlement timelines.',
  },
] as const;

export default function FaqScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.heroCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Frequently Asked Questions</Text>
          <Text style={[styles.heroText, { color: theme.colors.textSecondary }]}>Quick answers to the most common questions about rides, payments, and account support.</Text>
        </View>

        <View style={styles.section}>
          {FAQ_ITEMS.map((item, index) => (
            <View key={item.question} style={[styles.itemCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <View style={styles.itemHeader}>
                <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.badgeText}>{index + 1}</Text>
                </View>
                <Text style={[styles.question, { color: theme.colors.text }]}>{item.question}</Text>
              </View>
              <Text style={[styles.answer, { color: theme.colors.textSecondary }]}>{item.answer}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.footerCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.footerTitle, { color: theme.colors.text }]}>Need more help?</Text>
          <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>Email: support@limpoporide.com</Text>
          
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
    paddingHorizontal: 12,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  section: {
    gap: 12,
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  question: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  answer: {
    fontSize: 14,
    lineHeight: 22,
  },
  footerCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
  },
  footerTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  footerText: {
    fontSize: 14,
    lineHeight: 22,
  },
});