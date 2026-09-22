import React from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type SecurityTipProps = {
  visible: boolean;
  onClose: () => void;
};

const SECURITY_TIPS = [
  'Confirm the pickup and drop-off locations before starting the trip.',
  'Share your ride details with a trusted contact when needed.',
  'If anything feels unsafe, cancel the ride and contact support immediately.',
];

export default function SecurityTip({ visible, onClose }: SecurityTipProps) {
  const { theme } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
          onPress={() => {}}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: theme.colors.text }]}>Security Tips</Text>
              <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Stay aware throughout your trip.</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.banner, { backgroundColor: theme.colors.card }]}> 
            <Ionicons name="shield-checkmark" size={22} color={theme.colors.primary} />
            <Text style={[styles.bannerText, { color: theme.colors.text }]}>Your safety tools are always available during the ride.</Text>
          </View>

          <View style={styles.tipList}>
            {SECURITY_TIPS.map((tip) => (
              <View key={tip} style={styles.tipRow}>
                <View style={[styles.tipDot, { backgroundColor: theme.colors.primary }]} />
                <Text style={[styles.tipText, { color: theme.colors.textSecondary }]}>{tip}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    height: SCREEN_HEIGHT * 0.8,
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    marginTop: 18,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bannerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  tipList: {
    marginTop: 20,
    gap: 14,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
});