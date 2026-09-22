import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import { fetchRiderTransactionById, getCachedRiderTransactionById, RiderTransactionDetail } from '../src/lib/rider-transactions';
import { formatCurrency, formatDateTime } from '../src/utils/formatters';

const formatTransactionType = (type: string) => {
  if (type === 'wallet_topup') {
    return 'OPay Card Payment';
  }

  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatStatusLabel = (status: string) => {
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const maskSenderAccount = (value: string | null) => {
  if (!value) {
    return 'Not available';
  }

  if (value.length <= 10) {
    return value;
  }

  return `${value.slice(0, 6)}******${value.slice(-4)}`;
};

type DetailRowProps = {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>['theme'];
  copyable?: boolean;
  hasArrow?: boolean;
  noWrap?: boolean;
};

function DetailRow({ label, value, theme, copyable = false, hasArrow = false, noWrap = false }: DetailRowProps) {
  const handleCopy = () => {
    if (copyable && value) {
      Clipboard.setString(value);
    }
  };

  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.colors.textSecondary || '#8E8E93' }]}>
        {label}
      </Text>
      <TouchableOpacity
        activeOpacity={copyable || hasArrow ? 0.6 : 1}
        onPress={handleCopy}
        style={[styles.detailValueContainer, noWrap && styles.detailValueNoWrap]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.detailValue,
            { color: theme.colors.text || '#000000' },
            hasArrow && styles.arrowValueText,
            noWrap && styles.detailValueNoWrapText,
          ]}
        >
          {value}
        </Text>
        {copyable && (
          <Ionicons
            name="copy-outline"
            size={14}
            color={theme.colors.textSecondary || '#8E8E93'}
            style={styles.copyIcon}
          />
        )}
        {hasArrow && (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.colors.textSecondary || '#8E8E93'}
            style={styles.arrowIcon}
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function TransactionDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { theme, isDark } = useTheme();
  const [transaction, setTransaction] = useState<RiderTransactionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadTransaction = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      setTransaction(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // Check cache first on initial load
      const cached = await getCachedRiderTransactionById(id);
      if (cached) {
        setTransaction(cached);
        setIsLoading(false);
      }

      // Fetch fresh data
      const data = await fetchRiderTransactionById(id);
      if (data) {
        setTransaction(data);
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadTransaction();
    }, [loadTransaction])
  );

  const transactionDate = transaction?.paidAt || transaction?.createdAt || null;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text || '#000'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text || '#000' }]}>
          Transaction Details
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={theme.colors.primary || '#10B981'} />
          <Text style={[styles.loadingText, { color: theme.colors.text }]}>Loading transaction...</Text>
        </View>
      ) : !transaction ? (
        <View style={[styles.emptyState, { backgroundColor: theme.colors.card }]}>
          <Ionicons name="document-text-outline" size={36} color={theme.colors.border} />
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Transaction not found</Text>
          <Text style={[styles.emptyMessage, { color: theme.colors.textSecondary }]}>
            This record is unavailable or no longer belongs to the current user.
          </Text>
        </View>
      ) : (
        <View style={styles.contentWrapper}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Main Top Card */}
            <View style={[styles.heroCard, { backgroundColor: theme.colors.card }]}>
              <View style={[styles.heroIconCircle, { backgroundColor: isDark ? 'rgba(212, 171, 45, 0.2)' : '#E6F7F0' }]}>
                <Ionicons name="card-outline" size={24} color={theme.colors.primary} />
              </View>
              <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
                {formatTransactionType(transaction.type)}
              </Text>
              <Text style={[styles.heroAmount, { color: theme.colors.text }]}>
                {formatCurrency(transaction.amount)}
              </Text>

              <View style={styles.statusBadge}>
                <Ionicons
                  name={transaction.status === 'success' ? 'checkmark-circle' : 'timer-outline'}
                  size={16}
                  color={transaction.status === 'success' ? theme.colors.primary : '#F59E0B'}
                />
                <Text
                  style={[
                    styles.statusText,
                    { color: transaction.status === 'success' ? theme.colors.primary : '#F59E0B' },
                  ]}
                >
                  {transaction.status === 'success' ? 'Successful' : formatStatusLabel(transaction.status)}
                </Text>
              </View>
            </View>

            {/* Details Card */}
            <View style={[styles.sectionCard, { backgroundColor: theme.colors.card }]}>
              <Text style={[styles.sectionTitle, { color: isDark ? '#F5F5F5' : theme.colors.text }]}>Transaction Details</Text>

              <DetailRow
                label="Ref."
                value={transaction.reference}
                theme={theme}
                copyable
                noWrap
              />
              <DetailRow
                label="Transaction Date"
                value={transactionDate ? formatDateTime(transactionDate) : 'Not available'}
                theme={theme}
              />
              <DetailRow
                label="Card Number"
                value={maskSenderAccount(transaction.senderAccount)}
                theme={theme}
              />
              <DetailRow
                label="Narration"
                value={transaction.narration || 'OPAY DIGITAL SERVICES LIMITED'}
                theme={theme}
              />
              <DetailRow
                label="Debited from"
                value="OWealth"
                theme={theme}
                hasArrow
              />
            </View>

            {/* Amount Breakdown Card */}
            <View style={[styles.sectionCard, { backgroundColor: theme.colors.card }]}>
              <Text style={[styles.sectionTitle, { color: isDark ? '#F5F5F5' : theme.colors.text }]}>Amount Breakdown</Text>

              <DetailRow
                label="Amount"
                value={formatCurrency(transaction.requestedAmount || transaction.amount)}
                theme={theme}
              />
              <DetailRow
                label="Stampduty Debit"
                value={formatCurrency(transaction.fees || 0)}
                theme={theme}
              />
              <DetailRow
                label="Credit amount"
                value={formatCurrency(transaction.amount)}
                theme={theme}
              />
            </View>
          </ScrollView>

          {/* Bottom Action Button */}
          <View style={styles.footerContainer}>
            <TouchableOpacity style={styles.reportButton} activeOpacity={0.8}>
              <Text style={styles.reportButtonText}>Report Issue</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  contentWrapper: {
    flex: 1,
    justifyContent: 'space-between',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '500',
  },
  emptyState: {
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyMessage: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

  // Hero Card Styles (theme colors applied dynamically)
  heroCard: {
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  heroIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Section Card Styles (theme colors applied dynamically)
  sectionCard: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    flexWrap: 'nowrap',
  },

  // Row Item Styles
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    gap: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '400',
    flex: 1,
    color: '#8E8E93',
  },
  detailValueContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexShrink: 1,
    maxWidth: '58%',
    justifyContent: 'flex-end',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
    flexShrink: 1,
  },
  detailValueNoWrap: {
    maxWidth: '100%',
  },
  detailValueNoWrapText: {
    flexShrink: 0,
  },
  arrowValueText: {
    marginRight: 2,
  },
  copyIcon: {
    marginLeft: 6,
  },
  arrowIcon: {
    marginLeft: 2,
  },

  // Footer Button (handled dynamically in component)
  footerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  reportButton: {
    borderRadius: 24,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});