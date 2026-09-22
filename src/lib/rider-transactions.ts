import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

const RIDER_TRANSACTIONS_CACHE_KEY = 'rider_transactions_cache';
const RIDER_TRANSACTION_DETAIL_CACHE_PREFIX = 'rider_transaction_detail_';

export type RiderTransactionView = {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  senderName: string | null;
  narration: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type RiderTransactionDetail = RiderTransactionView & {
  channel: string | null;
  gateway: string | null;
  fees: number;
  requestedAmount: number | null;
  senderAccount: string | null;
  rawPayload: unknown;
};

const normalizeRiderTransaction = (transaction: {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  sender_name: string | null;
  narration: string | null;
  paid_at: string | null;
  created_at: string;
}): RiderTransactionView => ({
  id: transaction.id,
  reference: transaction.reference,
  type: transaction.type,
  status: transaction.status,
  amount: Number(transaction.amount),
  currency: transaction.currency,
  senderName: transaction.sender_name,
  narration: transaction.narration,
  paidAt: transaction.paid_at,
  createdAt: transaction.created_at,
});

const getAuthenticatedUser = async () => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  return user;
};

export const getCachedRiderTransactions = async (): Promise<RiderTransactionView[]> => {
  const cachedValue = await AsyncStorage.getItem(RIDER_TRANSACTIONS_CACHE_KEY);

  if (!cachedValue) {
    return [];
  }

  return JSON.parse(cachedValue) as RiderTransactionView[];
};

export const cacheRiderTransactions = async (transactions: RiderTransactionView[]) => {
  await AsyncStorage.setItem(RIDER_TRANSACTIONS_CACHE_KEY, JSON.stringify(transactions));
};

export const getCachedRiderTransactionById = async (transactionId: string): Promise<RiderTransactionDetail | null> => {
  const cacheKey = `${RIDER_TRANSACTION_DETAIL_CACHE_PREFIX}${transactionId}`;
  const cachedValue = await AsyncStorage.getItem(cacheKey);

  if (!cachedValue) {
    return null;
  }

  return JSON.parse(cachedValue) as RiderTransactionDetail;
};

export const cacheRiderTransactionById = async (transaction: RiderTransactionDetail) => {
  const cacheKey = `${RIDER_TRANSACTION_DETAIL_CACHE_PREFIX}${transaction.id}`;
  await AsyncStorage.setItem(cacheKey, JSON.stringify(transaction));
};

export const fetchRiderTransactions = async (): Promise<RiderTransactionView[]> => {
  const user = await getAuthenticatedUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('rider_transaction')
    .select('id, reference, type, status, amount, currency, sender_name, narration, paid_at, created_at')
    .eq('rider_uuid', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  const transactions = data.map(normalizeRiderTransaction);
  await cacheRiderTransactions(transactions);
  return transactions;
};

export const fetchRiderTransactionById = async (
  transactionId: string
): Promise<RiderTransactionDetail | null> => {
  const user = await getAuthenticatedUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('rider_transaction')
    .select(
      'id, reference, type, status, channel, gateway, currency, amount, fees, requested_amount, sender_name, sender_account, narration, paid_at, raw_payload, created_at'
    )
    .eq('rider_uuid', user.id)
    .eq('id', transactionId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const transaction: RiderTransactionDetail = {
    id: data.id,
    reference: data.reference,
    type: data.type,
    status: data.status,
    channel: data.channel,
    gateway: data.gateway,
    currency: data.currency,
    amount: Number(data.amount),
    fees: Number(data.fees ?? 0),
    requestedAmount: data.requested_amount == null ? null : Number(data.requested_amount),
    senderName: data.sender_name,
    senderAccount: data.sender_account,
    narration: data.narration,
    paidAt: data.paid_at,
    rawPayload: data.raw_payload,
    createdAt: data.created_at,
  };

  await cacheRiderTransactionById(transaction);
  return transaction;
};
