import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

type BudPayCheckoutModalProps = {
  visible: boolean;
  publicKey: string;
  amount: number;
  reference: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  bookingId?: string;
  onComplete: (response: { reference?: string; status?: string; data?: unknown }) => void;
  onCancel: () => void;
};

const escapeJsString = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');

export function BudPayCheckoutModal({
  visible,
  publicKey,
  amount,
  reference,
  email,
  firstName,
  lastName,
  phone,
  bookingId,
  onComplete,
  onCancel,
}: BudPayCheckoutModalProps) {
  const [isLoading, setIsLoading] = useState(true);

  const isInlineCheckoutUrl = useCallback((url?: string | null) => {
    if (!url) {
      return false;
    }

    return /^(about:blank|https?:|data:)/i.test(url);
  }, []);

  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url?: string; navigationType?: string; title?: string }) => {
      const requestUrl = request.url ?? '';

      if (isInlineCheckoutUrl(requestUrl)) {
        return true;
      }

      console.log('[WalletTopUp] BudPay external checkout handoff', {
        url: requestUrl,
        navigationType: request.navigationType ?? null,
        title: request.title ?? null,
      });

      setIsLoading(false);

      void Linking.openURL(requestUrl).catch((error) => {
        console.log('[WalletTopUp] BudPay external checkout open failed', {
          url: requestUrl,
          error,
        });
      });

      return false;
    },
    [isInlineCheckoutUrl]
  );

  const html = useMemo(() => {
    const escapedKey = escapeJsString(publicKey);
    const escapedReference = escapeJsString(reference);
    const escapedEmail = escapeJsString(email);
    const escapedFirstName = escapeJsString(firstName);
    const escapedLastName = escapeJsString(lastName);
    const escapedPhone = escapeJsString(phone);
    const escapedBookingId = bookingId ? escapeJsString(bookingId) : '';

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>BudPay Checkout</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #ffffff;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }

            .status {
              text-align: center;
              color: #111827;
              padding: 24px;
              max-width: 280px;
            }

            .spinner {
              width: 28px;
              height: 28px;
              border: 3px solid #e5e7eb;
              border-top-color: #111827;
              border-radius: 999px;
              margin: 0 auto 16px;
              animation: spin 1s linear infinite;
            }

            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
          <script>
            function post(type, payload) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
            }

            window.onerror = function(message, source, lineno, colno) {
              post('error', { message: String(message), source: source, lineno: lineno, colno: colno });
            };

            const originalConsoleLog = console.log;
            console.log = function() {
              const args = Array.prototype.slice.call(arguments).map(function(item) {
                try {
                  return typeof item === 'string' ? item : JSON.stringify(item);
                } catch (error) {
                  return String(item);
                }
              });
              post('console', { level: 'log', args: args });
              originalConsoleLog.apply(console, arguments);
            };

            const originalConsoleError = console.error;
            console.error = function() {
              const args = Array.prototype.slice.call(arguments).map(function(item) {
                try {
                  return typeof item === 'string' ? item : JSON.stringify(item);
                } catch (error) {
                  return String(item);
                }
              });
              post('console', { level: 'error', args: args });
              originalConsoleError.apply(console, arguments);
            };

            function startCheckout() {
              post('state', { step: 'startCheckout', reference: '${escapedReference}', amount: ${amount} });

              const checkoutType = typeof BudPayCheckout;
              const windowCheckoutType = typeof window.BudPayCheckout;
              post('state', {
                step: 'checkoutSymbolCheck',
                checkoutType: checkoutType,
                windowCheckoutType: windowCheckoutType,
              });

              if (checkoutType !== 'function') {
                post('error', {
                  message: 'BudPayCheckout is unavailable after script load',
                  checkoutType: checkoutType,
                  windowCheckoutType: windowCheckoutType,
                });
                return;
              }

              BudPayCheckout({
                  key: '${escapedKey}',
                  email: '${escapedEmail}',
                amount: '${amount}',
                  first_name: '${escapedFirstName}',
                  last_name: '${escapedLastName}',
                  phone: '${escapedPhone}',
                reference: '${escapedReference}',
                  currency: 'NGN',
                debug: true,
                  ${escapedBookingId ? `metadata: { bookingId: '${escapedBookingId}' },` : ''}
                  callback: function(data) {
                  post('complete', data);
                },
                  onClose: function(data) {
                  post('cancel', data || {});
                }
              });
            }

            function loadBudPay() {
              post('state', { step: 'injectScript' });
              const script = document.createElement('script');
                script.src = 'https://inlinepay.budpay.com/budpay-inline-custom.js';
              script.async = true;
              script.onload = function() {
                post('state', { step: 'scriptLoaded' });
                startCheckout();
              };
              script.onerror = function() {
                post('error', { message: 'Failed to load BudPay inline script' });
              };
              document.body.appendChild(script);
            }

            document.addEventListener('DOMContentLoaded', function() {
              post('state', { step: 'domReady' });
              loadBudPay();
            });
          </script>
        </head>
        <body>
          <div class="status">
            <div class="spinner"></div>
            <div>Opening secure payment checkout...</div>
          </div>
        </body>
      </html>
    `;
  }, [amount, email, firstName, lastName, phone, publicKey, reference]);

  const handleMessage = (rawMessage: string) => {
    try {
      const message = JSON.parse(rawMessage) as {
        type?: string;
        payload?: { reference?: string; status?: string; args?: string[]; message?: string };
      };

      if (message.type === 'console') {
        console.log('[WalletTopUp] BudPay console', message.payload);
        return;
      }

      if (message.type === 'state') {
        console.log('[WalletTopUp] BudPay state', message.payload);
        return;
      }

      if (message.type === 'error') {
        console.log('[WalletTopUp] BudPay error', message.payload);
        return;
      }

      if (message.type === 'complete') {
        console.log('[WalletTopUp] BudPay complete payload', message.payload);
        onComplete({
          reference: message.payload?.reference,
          status: message.payload?.status,
          data: message.payload,
        });
        return;
      }

      if (message.type === 'cancel') {
        console.log('[WalletTopUp] BudPay cancel payload', message.payload);
        onCancel();
      }
    } catch (error) {
      console.log('[WalletTopUp] BudPay raw message', rawMessage);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Secure Card Payment</Text>
          <TouchableOpacity onPress={onCancel} style={styles.closeButton} activeOpacity={0.85}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>

        <WebView
          source={{ html }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onMessage={(event) => handleMessage(event.nativeEvent.data)}
          onLoadStart={(event) => {
            const requestUrl = event.nativeEvent.url;
            setIsLoading(isInlineCheckoutUrl(requestUrl));
            console.log('[WalletTopUp] BudPay WebView load start', { url: requestUrl });
          }}
          onLoadEnd={(event) => {
            setIsLoading(false);
            console.log('[WalletTopUp] BudPay WebView load end', { url: event.nativeEvent.url });
          }}
          onError={(event) => {
            console.log('[WalletTopUp] BudPay WebView error', event.nativeEvent);
          }}
          onHttpError={(event) => {
            console.log('[WalletTopUp] BudPay WebView http error', event.nativeEvent);
          }}
          onLoadProgress={(event) => {
            console.log('[WalletTopUp] BudPay WebView progress', event.nativeEvent.progress);
          }}
          startInLoadingState={false}
          style={styles.webview}
        />

        {isLoading ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#111827" />
            <Text style={styles.loadingText}>Loading checkout...</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
});