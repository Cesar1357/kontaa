/**
 * Componente de prueba para notificaciones
 * OPCIONAL: Agregar a la pantalla de Settings durante desarrollo
 * 
 * Uso:
 * import { NotificationTestPanel } from '@/components/NotificationTestPanel';
 * <NotificationTestPanel />
 */

import { useAuth } from '@/hooks/useAuth';
import { useThemeColor } from '@/hooks/useThemeColor';
import { triggerRemoteTestNotification } from '@/services/notificationService';
import { testNotifications, useTestNotifications } from '@/utils/testNotifications';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface NotificationTestPanelProps {
  visible?: boolean;
}

export const NotificationTestPanel: React.FC<NotificationTestPanelProps> = ({
  visible = true,
}) => {
  const { sendTestNotification, sendAllTestNotifications } = useTestNotifications();
  const { uid } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background2');
  const primaryColor = '#5c6bf2';

  if (!visible) return null;

  const handleSendNotification = async (key: keyof typeof testNotifications) => {
    setLoading(key);
    try {
      await sendTestNotification(key);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(null);
    }
  };

  const handleSendAll = async () => {
    setLoading('all');
    try {
      await sendAllTestNotifications();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(null);
    }
  };

  const handleSendRemoteTest = async () => {
    if (!uid) {
      console.error('No user uid available for remote test');
      return;
    }

    setLoading('remote');
    try {
      const success = await triggerRemoteTestNotification(uid);
      if (!success) {
        console.error('No se pudo enviar la prueba remota');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(null);
    }
  };

  const notificationButtons = Object.entries(testNotifications).map(([key, notification]) => ({
    id: key,
    title: notification.title,
    subtitle: notification.body,
  }));

  return (
    <View style={{ padding: 16, marginVertical: 12 }}>
      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: '#333',
          paddingVertical: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: textColor, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
          🧪 Panel de Prueba de Notificaciones
        </Text>

        <Text style={{ color: '#999', fontSize: 12, marginBottom: 12 }}>
          Usa estas opciones para probar notificaciones durante desarrollo:
        </Text>

        <TouchableOpacity
          onPress={handleSendAll}
          disabled={loading !== null}
          style={{
            backgroundColor: primaryColor,
            paddingVertical: 10,
            borderRadius: 8,
            marginBottom: 12,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
            {loading === 'all' ? 'Enviando...' : 'Enviar Todas (6 notificaciones)'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSendRemoteTest}
          disabled={loading !== null}
          style={{
            backgroundColor: '#12b886',
            paddingVertical: 10,
            borderRadius: 8,
            marginBottom: 12,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
            {loading === 'remote' ? 'Enviando prueba remota...' : 'Enviar prueba remota al servidor'}
          </Text>
        </TouchableOpacity>

        <ScrollView>
          {notificationButtons.map((btn) => (
            <TouchableOpacity
              key={btn.id}
              onPress={() => handleSendNotification(btn.id as keyof typeof testNotifications)}
              disabled={loading !== null}
              style={{
                backgroundColor: '#222',
                padding: 12,
                borderRadius: 8,
                marginBottom: 8,
                opacity: loading ? 0.6 : 1,
              }}
            >
              <Text style={{ color: primaryColor, fontWeight: '600', marginBottom: 4 }}>
                {btn.title}
              </Text>
              <Text style={{ color: '#999', fontSize: 12 }}>
                {loading === btn.id ? 'Enviando...' : btn.subtitle}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={{ color: '#666', fontSize: 10, marginTop: 12, fontStyle: 'italic' }}>
          💡 Tip: Abre esta pantalla y toca el botón. La notificación llegará en 2 segundos.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    marginVertical: 12,
  },
  header: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  button: {
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  buttonText: {
    textAlign: 'center',
    fontWeight: '600',
  },
  notificationItem: {
    backgroundColor: '#222',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  notificationTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  notificationBody: {
    fontSize: 12,
    color: '#999',
  },
});
