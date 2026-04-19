import { useThemeColor } from "@/hooks/useThemeColor";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../hooks/useAuth";

export default function Index() {
  const { user, loading } = useAuth();
  const [authChecked, setAuthChecked] = useState(false);
  const [localAuthPassed, setLocalAuthPassed] = useState(false);
  const [authAttempted, setAuthAttempted] = useState(false);
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');

  const verifyLocalAuth = async () => {
    if (!user) return setAuthChecked(true); // si no hay usuario, no pedir nada
    
    try {
      setAuthAttempted(true);
      setAuthChecked(false);

      const localAuthEnabled = await AsyncStorage.getItem("localAuthEnabled");

      if (localAuthEnabled === "true") {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();

        if (compatible && enrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: "Autenticación requerida",
            fallbackLabel: "Usar PIN del dispositivo",
          });

          if (result.success) {
            setLocalAuthPassed(true);
          } else {
            // Si canceló o falló, mostrar botón para reintentar
            setLocalAuthPassed(false);
          }
        } else {
          // Si el dispositivo no tiene biometría, simplemente pasa
          setLocalAuthPassed(true);
        }
      } else {
        // Si no está activada la autenticación local
        setLocalAuthPassed(true);
      }
    } catch (e) {
      console.error("Error en autenticación local:", e);
      setLocalAuthPassed(true); // evita bloquear al usuario
    } finally {
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    if (!loading) verifyLocalAuth();
  }, [user, loading]);

  // Mientras carga Firebase o autenticación biométrica
  if (loading || !authChecked) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: backgroundColor }}>
        <ActivityIndicator size="large" color="#5c6bf2" />
      </View>
    );
  }

  // Si no hay usuario → ir al login/registro
  if (!user) {
    console.log("Redirigiendo a create porque no hay usuario");
    return <Redirect href="/(sesion)/create" />;
  }

  // Si hay usuario pero falló la autenticación biométrica
  if (!localAuthPassed) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 15, backgroundColor: backgroundColor }}>
        <Text style={{ fontSize: 18, textAlign: "center", marginBottom: 10, color: textColor }}>
          Autenticación biométrica requerida
        </Text>

        {authAttempted ? (
          <>
             <TouchableOpacity
                onPress={verifyLocalAuth}
                style={{
                    marginTop: 10,
                    backgroundColor:"#555",
                    borderRadius: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 20,
                }}
                >
                <Text
                    style={{
                    color: "white",
                    textAlign: "center",
                    fontWeight: "700",
                    fontSize: 16,
                    }}
                >
                    Reintentar
                </Text>
                </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator size="large" color="#f25c5c" />
        )}
      </View>
    );
  }

  // Si todo bien → ir a tabs
  return <Redirect href="/(tabs)" />;
}
