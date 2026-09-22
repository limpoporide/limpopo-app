import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import {
  deleteAllNotifications,
  deleteNotification,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '../lib/notifications';
import { updateRiderPushToken } from '../lib/rider-profile';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type NotificationsContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoadingNotifications: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteById: (notificationId: string) => Promise<void>;
  clearAll: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: React.PropsWithChildren) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);

  const refreshNotifications = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoadingNotifications(false);
      return;
    }

    const [nextNotifications, nextUnreadCount] = await Promise.all([
      fetchNotifications(),
      fetchUnreadNotificationCount(),
    ]);

    setNotifications(nextNotifications);
    setUnreadCount(nextUnreadCount);
    setIsLoadingNotifications(false);
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, isRead: true } : notification
      )
    );
    setUnreadCount((current) => Math.max(0, current - 1));
    await markNotificationRead(notificationId);
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
    setUnreadCount(0);
    await markAllNotificationsRead();
  }, []);

  const deleteById = useCallback(async (notificationId: string) => {
    const removedNotification = notifications.find((notification) => notification.id === notificationId) ?? null;

    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));

    if (removedNotification && !removedNotification.isRead) {
      setUnreadCount((current) => Math.max(0, current - 1));
    }

    try {
      await deleteNotification(notificationId);
    } catch (error) {
      if (removedNotification) {
        setNotifications((current) => [removedNotification as NotificationItem, ...current]);

        if (!removedNotification.isRead) {
          setUnreadCount((current) => current + 1);
        }
      }

      throw error;
    }
  }, [notifications]);

  const clearAll = useCallback(async () => {
    const removedNotifications = notifications;

    setNotifications([]);
    setUnreadCount(0);

    try {
      await deleteAllNotifications();
    } catch (error) {
      setNotifications(removedNotifications);
      setUnreadCount(removedNotifications.filter((notification) => !notification.isRead).length);
      throw error;
    }
  }, [notifications]);

  useEffect(() => {
    let isActive = true;
    const channelName = `rider-notifications-${Date.now()}`;

    const registerAndStorePushToken = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (__DEV__) {
          console.log('[Notifications] Push token skipped: no authenticated rider');
        }
        return;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('ride-updates', {
          name: 'Ride updates',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }

      const permissionState = await Notifications.getPermissionsAsync();
      let finalStatus = permissionState.status;

      if (finalStatus !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        finalStatus = requested.status;
      }

      if (finalStatus !== 'granted') {
        if (__DEV__) {
          console.log('[Notifications] Push permission not granted');
        }
        return;
      }

      const easProjectId =
        Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      const tokenResponse = easProjectId
        ? await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })
        : await Notifications.getExpoPushTokenAsync();
      const expoPushToken = tokenResponse.data;

      if (!expoPushToken) {
        if (__DEV__) {
          console.log('[Notifications] Empty Expo push token response');
        }
        return;
      }

      await updateRiderPushToken(expoPushToken);

      if (__DEV__) {
        console.log('[Notifications] Rider push token saved', { token: expoPushToken });
      }
    };

    refreshNotifications();
    registerAndStorePushToken().catch((error) => {
      if (__DEV__) {
        console.warn('[Notifications] Push token setup failed', error);
      }
    });

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        registerAndStorePushToken().catch((error) => {
          if (__DEV__) {
            console.warn('[Notifications] Push token setup failed after auth event', error);
          }
        });
      }
    });

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          if (isActive) {
            refreshNotifications();
          }
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      authSubscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [refreshNotifications]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount,
      isLoadingNotifications,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
      deleteById,
      clearAll,
    }),
    [notifications, unreadCount, isLoadingNotifications, refreshNotifications, markAsRead, markAllAsRead, deleteById, clearAll]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }

  return context;
}
