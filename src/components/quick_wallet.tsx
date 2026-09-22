import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../context/ThemeContext';
import { cacheRiderProfile, fetchRiderProfile, getCachedRiderProfile, RiderProfileView } from '../lib/rider-profile';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../utils/formatters';

type QuickWalletProps = {
  visible: boolean;
  onClose: () => void;
};

export default function QuickWallet({ visible, onClose }: QuickWalletProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<RiderProfileView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasCopiedWalletNumber, setHasCopiedWalletNumber] = useState(false);

  const formatAccountNameForDisplay = useCallback((fullName: string) => {
    const parts = fullName.split('/');

    if (parts.length === 2) {
      const companyPart = parts[0].trim().split(/\s+/)[0];
      return `${companyPart} / ${parts[1].trim()}`;
    }

    return fullName;
  }, []);

  const applyProfile = useCallback((nextProfile: RiderProfileView | null) => {
    if (!nextProfile) {
      return;
    }

    setProfile(nextProfile);
  }, []);

  const displayAccountName = useMemo(() => {
    return formatAccountNameForDisplay(profile?.accountName || 'Limpopo Limited/Rider');
  }, [formatAccountNameForDisplay, profile?.accountName]);

  const handleCopyWalletNumber = useCallback(async () => {
    const walletNumber = profile?.walletAccount?.trim();

    if (!walletNumber) {
      return;
    }

    await Clipboard.setStringAsync(walletNumber);
    setHasCopiedWalletNumber(true);
    Alert.alert('Copied', 'Wallet number copied to clipboard.');
  }, [profile?.walletAccount]);

  useEffect(() => {
    if (!visible) {
      setHasCopiedWalletNumber(false);
      return;
    }

    let isMounted = true;

    const loadProfile = async () => {
      setIsLoading(true);

      try {
        const cachedProfile = await getCachedRiderProfile();

        if (cachedProfile && isMounted) {
          applyProfile(cachedProfile);
        }

        const latestProfile = await fetchRiderProfile();

        if (latestProfile && isMounted) {
          applyProfile(latestProfile);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [applyProfile, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let isActive = true;
    let walletChannel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToWalletBalance = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user || !isActive) {
        return;
      }

      const channelName = `quick-wallet-balance-${user.id}-${Date.now()}`;

      walletChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rider_profile',
            filter: `uuid=eq.${user.id}`,
          },
          async (payload) => {
            const currentProfile = await getCachedRiderProfile();

            if (!currentProfile) {
              const latestProfile = await fetchRiderProfile();

              if (isActive) {
                applyProfile(latestProfile);
              }

              return;
            }

            const updatedProfile = {
              ...currentProfile,
              walletBalance: Number(payload.new.wallet_balance || 0),
              walletAccount: (payload.new.wallet_account as string | null | undefined) ?? currentProfile.walletAccount,
              bankName: (payload.new.bank_name as string | null | undefined) ?? currentProfile.bankName,
              accountName: (payload.new.account_name as string | null | undefined) ?? currentProfile.accountName,
            };

            await cacheRiderProfile(updatedProfile);

            if (isActive) {
              applyProfile(updatedProfile);
            }
          }
        )
        .subscribe();
    };

    subscribeToWalletBalance();

    return () => {
      isActive = false;

      if (walletChannel) {
        supabase.removeChannel(walletChannel);
      }
    };
  }, [applyProfile, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={[styles.card, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Quick Wallet</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: theme.colors.card }]}>
              <Ionicons name="close" size={18} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {isLoading && !profile ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : (
            <View style={styles.content}>
              <View style={[styles.balanceCard, { backgroundColor: theme.colors.card }]}>
                <Text style={[styles.balanceLabel, { color: theme.colors.textSecondary }]}>Wallet Balance</Text>
                <Text style={[styles.balanceValue, { color: theme.colors.text }]}>
                  {formatCurrency(Number(profile?.walletBalance || 0))}
                </Text>
              </View>

              <View style={styles.detailBlock}>
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Account Number</Text>
                <View style={styles.walletNumberRow}>
                  <Text style={[styles.detailValue, styles.walletNumberValue, { color: theme.colors.text }]}>
                    {profile?.walletAccount || '-----'}
                  </Text>
                  <TouchableOpacity
                    onPress={handleCopyWalletNumber}
                    disabled={!profile?.walletAccount}
                    style={[
                      styles.copyButton,
                      {
                        backgroundColor: hasCopiedWalletNumber ? theme.colors.primary : theme.colors.card,
                        borderColor: hasCopiedWalletNumber ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={hasCopiedWalletNumber ? 'checkmark' : 'copy-outline'}
                      size={16}
                      color={hasCopiedWalletNumber ? '#FFFFFF' : theme.colors.text}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.detailBlock}>
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Account Name</Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>{displayAccountName}</Text>
              </View>

              <View style={styles.detailBlock}>
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>Bank</Text>
                <Text style={[styles.detailValue, { color: theme.colors.text }]}>
                  {profile?.bankName || '-----'}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    paddingTop: 24,
  },
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingState: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: 14,
  },
  balanceCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  detailBlock: {
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  walletNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  walletNumberValue: {
    flex: 1,
  },
  copyButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '700',
  },
});