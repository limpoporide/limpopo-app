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

const TERMS_SECTIONS = [
  {
    title: '1. Scope and Acceptance',
    body:
      'These Terms govern your use of the Limpopo Ride website, Rider App, Driver App, and the car hire and chauffeur services booked through them. By creating an account, making a booking, or using the service, you agree to be bound by these Terms and by the related Privacy Policy.',
  },
  {
    title: '2. Who We Are',
    body:
      'The service is provided by Limpopo Auto Mobile Ride Nigeria Limited. Contact details published on the website include 7a Akinogun Road, Oniru, Victoria Island, Lagos, Nigeria, email info@limpoporide.com, and phone or WhatsApp numbers +234 903 995 0766 and +234 903 849 7147.',
  },
  {
    title: '3. Eligibility and Accounts',
    body:
      'You must be at least 18 years old to create an account or book a ride. You must provide complete and accurate information, keep it updated, and protect your account credentials. Automated registrations using bots or scripts are not permitted.',
  },
  {
    title: '4. Booking Formation and Ride Types',
    body:
      'A ride request is only an offer to book. A binding booking is created once Limpopo Ride sends a Booking Confirmation. Depending on availability, the service may include point-to-point rides, hourly hire, and airport pickup or drop-off, each subject to the class, route, and booking details confirmed in the app.',
  },
  {
    title: '5. Vehicle Classes, Timing, and Ride Changes',
    body:
      'Vehicle examples shown in the app are illustrative and do not guarantee a specific make or model. Pickup times are based on the Booking Confirmation, and airport pickups may be adjusted using flight tracking where reasonably possible. If a trip is extended, additional stops are added, or booked hours are exceeded, extra charges may apply based on the rates shown in the app.',
  },
  {
    title: '6. Luggage, Children, and Ride Conduct',
    body:
      'Standard luggage is included within the allowance for the booked vehicle class. Extra luggage, mobility equipment, pets, or child-seat needs should be disclosed at booking. During the ride, riders and guests must follow safety instructions, wear seatbelts, avoid dangerous behaviour, and must not smoke in the vehicle. Limpopo Ride may refuse or suspend service without refund where conduct puts drivers, passengers, or the public at risk.',
  },
  {
    title: '7. Cancellations and No-Shows',
    body:
      'Cancellations made at least 3 hours before pickup are free. Cancellations made less than 3 hours before pickup are subject to a 20% cancellation fee. A ride is treated as a no-show if the rider or guest does not appear within 20 minutes of the agreed pickup time, unless later pickup has been arranged, and a 20% no-show charge applies.',
  },
  {
    title: '8. Fares, Payments, and Waiting Time',
    body:
      'The fare shown at booking reflects the selected vehicle class, route or hours, pickup location, and special requests. Payments are processed through BudPay using the payment method linked to your account. Waiting time beyond the free period, extra distance, additional stops, and extra hours may increase the final charge beyond the original Booking Confirmation.',
  },
  {
    title: '9. Service Standards and Legal Framework',
    body:
      'Driver-Partners are expected to complete Limpopo Ride onboarding and maintain platform service standards. The website terms also state that the service operates within Nigeria’s legal and regulatory framework, including consumer protection, electronic payment, data protection, and transport rules, with unresolved consumer complaints eligible for escalation to the FCCPC.',
  },
  {
    title: '10. Liability, Availability, and Suspension',
    body:
      'Limpopo Ride is responsible for operating the app and website, issuing accurate booking confirmations, and processing payments correctly, while Driver-Partners remain responsible for the safe and lawful operation of the vehicle. The app and website may not always be uninterrupted or error-free. Accounts may be suspended or terminated for breaches, fraud, abuse, false information, or conduct that puts others at risk.',
  },
  {
    title: '11. Privacy, Legal Terms, and Contact',
    body:
      'The published terms also cover intellectual property, privacy and data protection, force majeure, changes to the terms, assignment, set-off, waiver, governing law, dispute resolution, and severability. The governing law is the law of the Federal Republic of Nigeria, with Lagos State courts having jurisdiction subject to consumer escalation rights. Questions about these Terms can be sent to info@limpoporide.com or the listed support numbers.',
  },
] as const;

export default function TermsScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Terms & Conditions</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.heroCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Terms of Service</Text>
          <Text style={[styles.heroText, { color: theme.colors.textSecondary }]}>The terms that apply when you book and take a ride with Limpopo Ride, including bookings, fares, cancellations, conduct, and liability.</Text>
        </View>

        {TERMS_SECTIONS.map((section) => (
          <View key={section.title} style={[styles.sectionCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
            <Text style={[styles.sectionBody, { color: theme.colors.textSecondary }]}>{section.body}</Text>
          </View>
        ))}

        <View style={[styles.noteCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.noteTitle, { color: theme.colors.text }]}>Important Note</Text>
          <Text style={[styles.sectionBody, { color: theme.colors.textSecondary }]}>This in-app summary has been updated to reflect the published website terms at limpoporide.com/terms.html, including Version 1.0 dated September 2026. Continued use of the platform after policy updates means you accept the revised terms.</Text>
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
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 10,
    padding: 16,
    marginTop: 6,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
});