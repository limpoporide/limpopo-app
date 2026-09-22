import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/context/ThemeContext';
import { formatCurrency } from '@/utils/formatters';

type InsufficientWalletPaymentModalProps = {
  visible: boolean;
  amountDue: number;
  onClose: () => void;
  onFundWallet: () => void;
  onSwitchToDirectTransfer: () => void;
};

export default function InsufficientWalletPaymentModal({
  visible,
  amountDue,
  onClose,
  onFundWallet,
  onSwitchToDirectTransfer,
}: InsufficientWalletPaymentModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={[styles.card, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}> 
          <View style={styles.headerRow}>
            <View style={[styles.iconWrap, { backgroundColor: theme.mode === 'dark' ? '#2E2410' : '#FFF4D9' }]}> 
              <Ionicons name="wallet-outline" size={24} color={theme.colors.primary} />
            </View>
            <TouchableOpacity style={[styles.closeButton, { backgroundColor: theme.colors.card }]} onPress={onClose}>
              <Ionicons name="close" size={18} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: theme.colors.text }]}>Insufficient wallet balance</Text>
          <Text style={[styles.description, { color: theme.colors.textSecondary }]}>Your wallet balance is not enough to pay for this ride. Add funds and try again, or switch to direct transfer now.</Text>

          <View style={[styles.amountCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <Text style={[styles.amountLabel, { color: theme.colors.textSecondary }]}>Amount due</Text>
            <Text style={[styles.amountValue, { color: theme.colors.text }]}>{formatCurrency(amountDue)}</Text>
          </View>

          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} onPress={onFundWallet}>
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Add funds</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            onPress={onSwitchToDirectTransfer}
          >
            <Ionicons name="card-outline" size={18} color={theme.colors.text} />
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Switch to direct transfer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  amountCard: {
    borderWidth: 1,
    borderRadius: 16,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  amountValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  primaryButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
