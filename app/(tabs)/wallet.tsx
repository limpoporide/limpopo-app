import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { BudPayCheckoutModal } from '../../src/components/BudPayCheckoutModal';
import { useTheme } from '../../src/context/ThemeContext';
import { fetchRiderProfile, getCachedRiderProfile, cacheRiderProfile, setRiderProfileVisibility } from '../../src/lib/rider-profile';
import { fetchRiderTransactions, getCachedRiderTransactions, RiderTransactionView } from '../../src/lib/rider-transactions';
import { supabase } from '../../src/lib/supabase';
import { formatCurrency, formatDateTime } from '../../src/utils/formatters';

const BUDPAY_PUBLIC_KEY = process.env.EXPO_PUBLIC_BUDPAY_PUBLIC_KEY || '';

const RECENT_TRANSACTION_LIMIT = 5;

const formatTransactionType = (type: string) => {
  if (type === 'wallet_topup') {
    return 'Wallet top up';
  }

  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getStatusTone = (status: string, isDark: boolean) => {
  if (status === 'success') {
    return {
      backgroundColor: isDark ? '#163220' : '#E7F7EE',
      textColor: isDark ? '#9DE2B0' : '#177245',
    };
  }

  if (status === 'pending') {
    return {
      backgroundColor: isDark ? '#33280F' : '#FFF4D9',
      textColor: isDark ? '#F6D47A' : '#9A6B00',
    };
  }

  return {
    backgroundColor: isDark ? '#3B1B1B' : '#FDECEC',
    textColor: isDark ? '#FFB1B1' : '#B42318',
  };
};

export default function Wallet() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const [isBalanceVisible, setIsBalanceVisible] = useState(true);
  const [hasCopiedWalletNumber, setHasCopiedWalletNumber] = useState(false);
  const [accountName, setAccountName] = useState('Limpopo Limited/Rider');
  const [walletNumber, setWalletNumber] = useState('-----');
  const [bankName, setBankName] = useState('-----');
  const [walletBalance, setWalletBalance] = useState(0);
  const [riderEmail, setRiderEmail] = useState('');
  const [riderFirstName, setRiderFirstName] = useState('Rider');
  const [riderLastName, setRiderLastName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [isTopUpModalVisible, setIsTopUpModalVisible] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [activeCheckout, setActiveCheckout] = useState<{ reference: string; amount: number } | null>(null);
  const [isVerifyingTopUp, setIsVerifyingTopUp] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<RiderTransactionView[]>([]);
  const [isLoadingRecentTransactions, setIsLoadingRecentTransactions] = useState(true);

  const formatAccountNameForDisplay = useCallback((fullName: string) => {
    const parts = fullName.split('/');
    if (parts.length === 2) {
      const companyPart = parts[0].trim().split(/\s+/)[0]; // First word
      return `${companyPart} / ${parts[1].trim()}`;
    }
    return fullName;
  }, []);

  const displayAccountName = useMemo(
    () => formatAccountNameForDisplay(accountName),
    [accountName, formatAccountNameForDisplay]
  );

  const applyProfile = useCallback(
    (profile: Awaited<ReturnType<typeof getCachedRiderProfile>>) => {
      if (!profile) {
        return;
      }

      const fullName = `${profile.firstName} ${profile.lastName}`.trim() || 'Rider';
      setAccountName(profile.accountName || `Limpopo Limited/${fullName}`);
      setWalletBalance(Number(profile.walletBalance || 0));
      setRiderEmail(profile.email || '');
      setRiderFirstName(profile.firstName || 'Rider');
      setRiderLastName(profile.lastName || '');
      setRiderPhone(profile.phone || '');
      setIsBalanceVisible(!profile.visibility);

      if (profile.walletAccount) {
        setWalletNumber(profile.walletAccount);
      }

      if (profile.bankName) {
        setBankName(profile.bankName);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const loadProfile = async () => {
        const cachedProfile = await getCachedRiderProfile();

        if (cachedProfile && isMounted) {
          applyProfile(cachedProfile);
        }

        const latestProfile = await fetchRiderProfile();

        if (latestProfile && isMounted) {
          applyProfile(latestProfile);
        }
      };

      loadProfile();

      return () => {
        isMounted = false;
      };
    }, [applyProfile])
  );

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const loadRecentTransactions = async () => {
        const cachedTransactions = await getCachedRiderTransactions();

        if (cachedTransactions.length > 0 && isMounted) {
          setRecentTransactions(cachedTransactions.slice(0, RECENT_TRANSACTION_LIMIT));
          setIsLoadingRecentTransactions(false);
        } else if (isMounted) {
          setIsLoadingRecentTransactions(true);
        }

        const latestTransactions = await fetchRiderTransactions();

        if (!isMounted) {
          return;
        }

        setRecentTransactions(latestTransactions.slice(0, RECENT_TRANSACTION_LIMIT));
        setIsLoadingRecentTransactions(false);
      };

      loadRecentTransactions();

      return () => {
        isMounted = false;
      };
    }, [])
  );

  useEffect(() => {
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

      const channelName = `wallet-balance-${user.id}-${Date.now()}`;

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
              visibility: (payload.new.visibility as boolean | undefined) ?? currentProfile.visibility,
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
  }, [applyProfile]);

  const visibleBalance = useMemo(() => {
    return formatCurrency(walletBalance).replace('₦', '').trim();
  }, [walletBalance]);

  const handleCopyWalletNumber = async () => {
    await Clipboard.setStringAsync(walletNumber);
    setHasCopiedWalletNumber(true);
    Alert.alert('Copied', 'Wallet number copied to clipboard.');
  };

  const handleBalanceVisibilityToggle = async () => {
    const nextValue = !isBalanceVisible;
    setIsBalanceVisible(nextValue);

    try {
      const updatedProfile = await setRiderProfileVisibility(!nextValue);

      if (updatedProfile) {
        setIsBalanceVisible(!updatedProfile.visibility);
      }
    } catch {
      setIsBalanceVisible(!nextValue);
    }
  };

  const handleOpenTopUpModal = () => {
    setTopUpAmount('');
    setIsTopUpModalVisible(true);
  };

  const handleCloseTopUpModal = () => {
    setIsTopUpModalVisible(false);
    setTopUpAmount('');
  };

  const handleProceedToCheckout = () => {
    const parsedAmount = Number(topUpAmount);

      console.log('[WalletTopUp] Proceed pressed', {
        rawAmount: topUpAmount,
        parsedAmount,
        riderEmail,
      });

    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount to top up.');
      return;
    }

    if (!riderEmail) {
      Alert.alert('Profile incomplete', 'We could not find your email. Please update your profile and try again.');
      return;
    }

    const reference = `BUD_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    console.log('[WalletTopUp] Starting BudPay checkout', {
      reference,
      amount: parsedAmount,
      email: riderEmail,
      firstName: riderFirstName,
      lastName: riderLastName,
      phone: riderPhone,
    });

    setIsTopUpModalVisible(false);
    setActiveCheckout({ reference, amount: parsedAmount });
  };

  const handleCheckoutComplete = async (response: { reference?: string; status?: string }) => {
    const reference = response?.reference || activeCheckout?.reference;
    console.log('[WalletTopUp] BudPay onComplete', response);
    setActiveCheckout(null);

    if (!reference) {
      console.log('[WalletTopUp] Missing reference on complete');
      return;
    }

    setIsVerifyingTopUp(true);

    try {
      console.log('[WalletTopUp] Verifying transaction with webhook', { reference });
      await supabase.functions.invoke('budpay-webhook', {
        method: 'POST',
        body: {
          notify: 'transaction',
          notifyType: 'successful',
          data: { reference, channel: 'card' },
        },
      });

      console.log('[WalletTopUp] Webhook verification complete', { reference });

      Alert.alert('Payment Successful', 'Your wallet has been funded successfully.');
    } catch (error) {
      console.log('[WalletTopUp] Webhook verification failed', error);
      Alert.alert(
        'Payment received',
        'Your payment was completed. If your balance does not update shortly, please contact support.'
      );
    } finally {
      setIsVerifyingTopUp(false);
    }
  };

  const handleCheckoutCancel = () => {
    console.log('[WalletTopUp] BudPay onCancel');
    setActiveCheckout(null);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      <View style={styles.fixedTopSection}>
        {/* Balance Overview */}
        <View
          style={[
            styles.balanceCard,
            {
              backgroundColor: isDark ? '#111111' : '#040300',
              borderColor: isDark ? '#FFFFFF' : '#DAA520',
            },
          ]}
        >
          <Text style={styles.balanceLabel}>Wallet Balance</Text>

          <View style={styles.balanceRow}>
            <Text style={styles.nairaSymbol}>₦</Text>
            <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {isBalanceVisible ? visibleBalance : '••••••'}
            </Text>
            <TouchableOpacity
              onPress={handleBalanceVisibilityToggle}
              style={styles.visibilityButton}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isBalanceVisible ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Direct Funding Details */}
        <View
          style={[
            styles.directFundingCard,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.walletNumberRow}>
            <View style={styles.walletNumberCopy}>
              <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>Wallet Number</Text>
              <Text style={[styles.walletNumberValue, { color: theme.colors.text }]}>{walletNumber}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.copyButton,
                {
                  backgroundColor: hasCopiedWalletNumber ? theme.colors.primary : theme.colors.background,
                  borderColor: hasCopiedWalletNumber ? theme.colors.primary : theme.colors.border,
                },
              ]}
              onPress={handleCopyWalletNumber}
              activeOpacity={0.85}
            >
              <Ionicons
                name={hasCopiedWalletNumber ? 'checkmark' : 'copy-outline'}
                size={18}
                color={hasCopiedWalletNumber ? '#FFFFFF' : theme.colors.text}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>Account Name</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text }]}>{displayAccountName}</Text>
          </View>

          <View style={styles.detailRowLast}>
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>Bank Name</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text }]}>{bankName}</Text>
          </View>
        </View>

        {/* Section Divider */}
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View
          style={[
            styles.recentTransactionsCard,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.recentTransactionsHeader}>
            <Text style={[styles.recentTransactionsTitle, { color: theme.colors.text }]}>Recent transactions</Text>
            <View style={styles.recentTransactionsActions}>
              <TouchableOpacity onPress={() => router.push('/transaction-history')} activeOpacity={0.8}>
                <Text style={[styles.recentTransactionsLink, { color: theme.colors.primary }]}>See all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert('CBN Stamp Duty', 'In accordance with CBN stamp duties, N50 will be debited for every transaction')}
                activeOpacity={0.7}
              >
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {isLoadingRecentTransactions ? (
            <View style={styles.recentTransactionsState}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.recentTransactionsStateText, { color: theme.colors.textSecondary }]}>Loading recent transactions...</Text>
            </View>
          ) : recentTransactions.length === 0 ? (
            <View style={styles.recentTransactionsState}>
              <Text style={[styles.recentTransactionsStateText, { color: theme.colors.textSecondary }]}>No Transaction found</Text>
            </View>
          ) : (
            recentTransactions.map((transaction, index) => {
              const tone = getStatusTone(transaction.status, isDark);
              const displayDate = formatDateTime(transaction.paidAt || transaction.createdAt);
              const supportingText = transaction.senderName || transaction.narration;

              return (
                <TouchableOpacity
                  key={transaction.id}
                  activeOpacity={0.82}
                  onPress={() => router.push({
                    pathname: '/transaction-details',
                    params: { id: transaction.id },
                  })}
                  style={[
                    styles.recentTransactionRow,
                    index < recentTransactions.length - 1
                      ? { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
                      : null,
                  ]}
                >
                  <View style={[styles.recentTransactionIcon, { backgroundColor: '#DAA520' }]}>
                    <Ionicons name="arrow-down-circle-outline" size={18} color="#FFFFFF" />
                  </View>

                  <View style={styles.recentTransactionTextBlock}>
                    <Text style={[styles.recentTransactionTitle, { color: theme.colors.text }]} numberOfLines={1}>
                      {formatTransactionType(transaction.type)}
                    </Text>
                    <Text style={[styles.recentTransactionSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {displayDate}
                    </Text>
                    {supportingText ? (
                      <Text style={[styles.recentTransactionMetaText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {supportingText}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.recentTransactionAmountBlock}>
                    <Text style={[styles.recentTransactionAmount, { color: theme.colors.text }]} numberOfLines={1}>
                      {formatCurrency(transaction.amount)}
                    </Text>
                    <View style={[styles.recentTransactionStatusBadge, { backgroundColor: tone.backgroundColor }]}>
                      <Text style={[styles.recentTransactionStatusText, { color: tone.textColor }]}>
                        {transaction.status}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* <Modal visible={isTopUpModalVisible} transparent animationType="fade" onRequestClose={handleCloseTopUpModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Fund Wallet with Card</Text>
            <Text style={[styles.modalLabel, { color: theme.colors.textSecondary }]}>Amount (NGN)</Text>
            <TextInput
              style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder="Enter amount"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="numeric"
              value={topUpAmount}
              onChangeText={setTopUpAmount}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={handleCloseTopUpModal} activeOpacity={0.85}>
                <Text style={[styles.modalCancelText, { color: theme.colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalProceedButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleProceedToCheckout}
                activeOpacity={0.85}
              >
                <Text style={styles.modalProceedText}>Proceed</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal> */}

      {isVerifyingTopUp ? (
        <View style={styles.verifyingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      ) : null}

      {activeCheckout ? (
        <BudPayCheckoutModal
          visible
          publicKey={BUDPAY_PUBLIC_KEY}
          amount={activeCheckout.amount}
          reference={activeCheckout.reference}
          email={riderEmail}
          firstName={riderFirstName || 'Rider'}
          lastName={riderLastName || 'Limpopo'}
          phone={riderPhone || ''}
          onComplete={handleCheckoutComplete}
          onCancel={handleCheckoutCancel}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedTopSection: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 14,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 16,
    gap: 10,
  },
  balanceCard: {
    borderRadius: 8,
    borderWidth: 0.5,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  balanceLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    opacity: 0.88,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nairaSymbol: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginRight: 5,
  },
  balanceAmount: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  visibilityButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  directFundingCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  walletNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  walletNumberCopy: {
    flex: 1,
    paddingRight: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  walletNumberValue: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  copyButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailRow: {
    marginBottom: 12,
  },
  detailRowLast: {
    marginBottom: 0,
  },
  infoValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalProceedButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  modalProceedText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  verifyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    opacity: 0.5,
    marginVertical: 2,
  },
  recentTransactionsCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  recentTransactionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  recentTransactionsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recentTransactionsTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  recentTransactionsLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  recentTransactionsState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  recentTransactionsStateText: {
    fontSize: 13,
    textAlign: 'center',
  },
  recentTransactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  recentTransactionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentTransactionTextBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  recentTransactionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  recentTransactionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  recentTransactionMetaText: {
    fontSize: 11,
    lineHeight: 16,
  },
  recentTransactionAmountBlock: {
    alignItems: 'flex-end',
    gap: 7,
    maxWidth: '42%',
  },
  recentTransactionAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  recentTransactionStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  recentTransactionStatusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
