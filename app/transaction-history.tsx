import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import {
  fetchRiderTransactions,
  getCachedRiderTransactions,
  RiderTransactionView,
} from '../src/lib/rider-transactions';
import { formatCurrency, formatDateTime } from '../src/utils/formatters';

type TransactionSection = {
  title: string;
  items: RiderTransactionView[];
};

const STAMP_DUTY_FEE = 50;

const formatSectionTitle = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  if (isSameDay(date, today)) {
    return 'Today';
  }

  if (isSameDay(date, yesterday)) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

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

export default function TransactionHistory() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const [transactions, setTransactions] = useState<RiderTransactionView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadTransactions = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      const cachedTransactions = await getCachedRiderTransactions();

      if (cachedTransactions.length > 0) {
        setTransactions(cachedTransactions);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    } else {
      setIsRefreshing(true);
    }

    try {
      const data = await fetchRiderTransactions();
      setTransactions(data);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTransactions('initial');
    }, [loadTransactions])
  );

  const transactionSections = useMemo<TransactionSection[]>(() => {
    const groups = transactions.reduce<Record<string, RiderTransactionView[]>>((accumulator, transaction) => {
      const key = formatSectionTitle(transaction.paidAt || transaction.createdAt);

      if (!accumulator[key]) {
        accumulator[key] = [];
      }

      accumulator[key].push(transaction);
      return accumulator;
    }, {});

    return Object.entries(groups).map(([title, items]) => ({ title, items }));
  }, [transactions]);

  const totalSuccessfulCredits = useMemo(
    () => transactions
      .filter((transaction) => transaction.status === 'success')
      .reduce((sum, transaction) => sum + transaction.amount, 0),
    [transactions]
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Transaction history</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadTransactions('refresh')}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.summaryRow}>
            <View>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Total transactions</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{transactions.length}</Text>
            </View>
            <View style={styles.summaryAmountBlock}>
              <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>Successful credits</Text>
              <Text style={[styles.summaryAmount, { color: theme.colors.primary }]}>
                {formatCurrency(totalSuccessfulCredits)}
              </Text>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[styles.stateTitle, { color: theme.colors.text }]}>Loading transactions...</Text>
          </View>
        ) : transactions.length === 0 ? (
          <View
            style={[
              styles.stateCard,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
              <Ionicons name="wallet-outline" size={28} color={theme.colors.textSecondary} />
            </View>
            <Text style={[styles.stateTitle, { color: theme.colors.text }]}>No wallet transactions yet</Text>
            <Text style={[styles.stateMessage, { color: theme.colors.textSecondary }]}>Credits to your wallet will appear here once they are processed.</Text>
          </View>
        ) : (
          transactionSections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
              {section.items.map((transaction) => {
                const tone = getStatusTone(transaction.status, isDark);
                const displayDate = transaction.paidAt || transaction.createdAt;
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
                      styles.transactionCard,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.transactionTopRow}>
                      <View style={[styles.transactionIcon, { backgroundColor: '#DAA520', borderColor: theme.colors.border }]}>
                        <Ionicons name="arrow-down-circle-outline" size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.transactionTextBlock}>
                        <Text style={[styles.transactionTitle, { color: theme.colors.text }]}>
                          {formatTransactionType(transaction.type)}
                        </Text>
                        {supportingText && (
                          <Text style={[styles.transactionSubtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                            {supportingText}
                          </Text>
                        )}
                      </View>
                      <View style={styles.amountBlock}>
                        <Text style={[styles.transactionAmount, { color: theme.colors.text }]}>
                          {formatCurrency(transaction.amount)}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: tone.backgroundColor }]}>
                          <Text style={[styles.statusText, { color: tone.textColor }]}>
                            {transaction.status}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={[styles.metaRow, { borderTopColor: theme.colors.border }]}>
                      <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>
                        {formatDateTime(displayDate)}
                      </Text>
                      <Text style={[styles.metaText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        Stamp duty fee: {formatCurrency(STAMP_DUTY_FEE)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 18,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  summaryAmountBlock: {
    alignItems: 'flex-end',
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: '800',
  },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 36,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateMessage: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  transactionCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 14,
  },
  transactionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transactionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionTextBlock: {
    flex: 1,
    gap: 4,
  },
  transactionTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  transactionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  amountBlock: {
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '42%',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 2,
    gap: 19,
  },
  metaText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 18,
  },
});
