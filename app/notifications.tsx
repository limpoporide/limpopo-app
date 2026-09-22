import React from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import { useNotifications } from '../src/context/NotificationsContext';
import { formatDateTime } from '../src/utils/formatters';
import type { NotificationItem } from '../src/lib/notifications';

export default function NotificationsScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { notifications, isLoadingNotifications, unreadCount, refreshNotifications, markAsRead, markAllAsRead, deleteById, clearAll } =
    useNotifications();

  const handleOpenNotification = (notification: NotificationItem) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  };

  const handleDeleteNotification = (notification: NotificationItem) => {
    Alert.alert(
      'Delete notification',
      'This will remove the notification from your list.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteById(notification.id);
            } catch {
              Alert.alert('Delete failed', 'We could not delete this notification. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    if (notifications.length === 0) {
      return;
    }

    Alert.alert(
      'Clear all notifications',
      'This will permanently delete all notifications from your list.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAll();
            } catch {
              Alert.alert('Clear failed', 'We could not clear your notifications. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Notifications</Text>
        <View style={styles.headerActions}>
          {notifications.length > 0 ? (
            <TouchableOpacity onPress={handleClearAll}>
              <Text style={[styles.clearAllText, { color: theme.colors.error }]}>Clear all</Text>
            </TouchableOpacity>
          ) : null}
          {unreadCount > 0 ? (
            <TouchableOpacity onPress={markAllAsRead} style={styles.markAllReadButton}>
              <Text style={[styles.markAllRead, { color: theme.colors.primary }]}>Mark all read</Text>
            </TouchableOpacity>
          ) : notifications.length === 0 ? (
            <View style={styles.markAllReadPlaceholder} />
          ) : null}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoadingNotifications} onRefresh={refreshNotifications} tintColor={theme.colors.primary} />
        }
      >
        {isLoadingNotifications && notifications.length === 0 ? (
          <ActivityIndicator color={theme.colors.primary} style={styles.loadingIndicator} />
        ) : null}

        {notifications.map((notification) => (
          <TouchableOpacity
            key={notification.id}
            style={[
              styles.card,
              {
                backgroundColor: notification.isRead ? theme.colors.card : theme.colors.primary + '10',
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => handleOpenNotification(notification)}
          >
            <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '20' }]}>
              <Image
                source={require('../assets/Limpopo round.png')}
                style={styles.notificationLogo}
                resizeMode="cover"
              />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {notification.title}
                </Text>
                <View style={styles.cardActions}>
                  {!notification.isRead && <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} />}
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Delete notification"
                    hitSlop={10}
                    onPress={() => handleDeleteNotification(notification)}
                    style={[styles.deleteButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.cardBody, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                {notification.body}
              </Text>
              <Text style={[styles.cardTime, { color: theme.colors.textSecondary }]}>
                {formatDateTime(notification.createdAt)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {!isLoadingNotifications && notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>No notifications</Text>
            <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>You're all caught up!</Text>
          </View>
        ) : null}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  markAllRead: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  markAllReadButton: {
    marginLeft: 12,
  },
  markAllReadPlaceholder: {
    width: 34,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  loadingIndicator: {
    marginTop: 40,
  },
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  cardContent: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  cardBody: {
    fontSize: 12,
    marginTop: 4,
  },
  cardTime: {
    fontSize: 11,
    marginTop: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});
