import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  StyleSheet,
  TouchableOpacity
} from 'react-native';

import { StatusBar } from 'expo-status-bar';
import { auth } from '../../config/firebase';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useThemeColor } from '@/hooks/useThemeColor';

import BalanceHeader from '@/components/BalanceHeader';
import BudgetHeader from '@/components/BudgetHeader';
import CardComparativa from "@/components/ComparacionUsers";
import NuevaTransaccionModal from "@/components/NuevaTransaccionModal";
import ResumenRapido from '@/components/ResumenRapido';




export default function Inicio() {
  const cardMainColor = useThemeColor({light:'',dark:''},'cardMain');
  const textColor = useThemeColor({light:'',dark:''},'text');

  const [user, setUser] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      alignContent: "center",
    },
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authenticatedUser) => {
      setUser(authenticatedUser || null);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const backAction = () => { 
      if(modalVisible) {
        console.log("Modal is open, closing it");
        setModalVisible(false);
        console.log("Cerrando modal");
        return true;
      }
      console.log("Nada abierto");
      return false; // Permite el comportamiento por defecto (ir atrás)
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [modalVisible]);
  
  // 🔹 Detectar si el header ya desapareció (para deshabilitar el botón)
  useEffect(() => {
    const listener = scrollY.addListener(({ value }) => {
      setIsHeaderHidden(value > 90); // si el scroll pasa de 90, lo ocultamos
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY]);


  return (
    <ThemedView style={styles.container}>
      <StatusBar style="auto" />

      {/* 🔹 HEADER animado */}
      <Animated.View
        style={{
          marginLeft: 10,
          marginTop: 80,
          alignSelf: "flex-start",
          zIndex: 10,
          justifyContent: "space-between",
          flexDirection: "row",
          width: "94%",
          opacity: headerOpacity,
        }}
      >
        <ThemedText
          style={{
            fontSize: 30,
            fontWeight: "800",
            alignSelf: "left",
            padding: 5,
          }}
        >
          Hola {user ? user.displayName : "Usuario"}
        </ThemedText>

        <TouchableOpacity
          disabled={isHeaderHidden}
          onPress={() => router.push("/(screens)/Settings")}
          style={{
            bottom: 5,
          }}
        >
          <Ionicons name="settings" size={27} color={textColor} />
        </TouchableOpacity>
      </Animated.View>

      {/* 🔹 ScrollView animado */}
      <Animated.ScrollView
        style={{ width: "100%", zIndex: 9, marginTop: -100 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        <ThemedView
          style={{
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 10,
            marginTop: 120,
            justifyContent: "space-between",
            backgroundColor: cardMainColor,
            alignContent: "center",
            alignItems: "center",
          }}
        >
          <BalanceHeader />
          <BudgetHeader />
          <ResumenRapido />
          <CardComparativa />
          <ThemedView style={{ height: 50 }} />
        </ThemedView>
      </Animated.ScrollView>

      {/* 🔹 Botón flotante */}
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        style={{
          position: "absolute",
          zIndex: 20,
          bottom: 30,
          right: 20,
          backgroundColor: "#5c6bf2",
          borderRadius: 28,
          width: 56,
          height: 56,
          justifyContent: "center",
          alignItems: "center",
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowOffset: { width: 0, height: 3 },
          shadowRadius: 6,
          elevation: 8,

        }}
      >
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>

      <NuevaTransaccionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        userId={user ? user.uid : null}
      />
    </ThemedView>
  );
}
