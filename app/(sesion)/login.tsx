import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Easing,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../config/firebase';

const LEGAL_URL = 'https://emperblack.wordpress.com/konta-politica-de-privacidad/';

export default function LogIn() {
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background');
  const surfaceVariantColor = useThemeColor({ light: '', dark: '' }, 'surfaceVariant');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(20)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(heroTranslate, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        delay: 110,
        duration: 540,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslate, {
        toValue: 0,
        delay: 110,
        duration: 540,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardOpacity, cardTranslate, heroOpacity, heroTranslate]);

  const openLegalUrl = async () => {
    try {
      await Linking.openURL(LEGAL_URL);
    } catch {
      Alert.alert('Error', 'No se pudo abrir la página legal.');
    }
  };

  const handleLogin = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      Alert.alert('Te faltan campos');
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
      router.dismissTo('/(tabs)');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo iniciar sesión.');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <View pointerEvents="none" style={styles.backgroundDecor}>
        <View style={[styles.glow, { backgroundColor: `${primaryColor}22`, top: -40, right: -10 }]} />
        <View style={[styles.glow, { backgroundColor: `${primaryColor}14`, bottom: 120, left: -30 }]} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: heroOpacity, transform: [{ translateY: heroTranslate }], width: '100%' }}>
            <View style={[styles.badge, { backgroundColor: `${primaryColor}16`, borderColor: `${primaryColor}25` }]}>
              <Text style={[styles.badgeText, { color: primaryColor }]}>Finanzas claras desde el primer minuto</Text>
            </View>
            <Text style={[styles.brand, { color: textColor }]}>Konta</Text>
            <Text style={[styles.headline, { color: textColor }]}>Bienvenido de vuelta.</Text>
          </Animated.View>

          <Animated.View style={{ opacity: cardOpacity, transform: [{ translateY: cardTranslate }], width: '100%' }}>
            <View style={[styles.card, { backgroundColor: cardsMain, borderColor }]}>
              <Text style={[styles.cardTitle, { color: textColor }]}>Iniciar sesión</Text>
              <Text style={[styles.cardCaption, { color: `${textColor}90` }]}>Accede a tu espacio financiero personal.</Text>

              <View style={[styles.inputShell, { backgroundColor: surfaceVariantColor, borderColor }]}>
                <Icon type="ionicon" name="mail-outline" size={18} color={`${textColor}90`} />
                <TextInput
                  style={[styles.input, { color: textColor }]}
                  onChangeText={setEmail}
                  value={email}
                  placeholder="Correo electrónico"
                  placeholderTextColor={`${textColor}70`}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                />
              </View>

              <View style={[styles.inputShell, { backgroundColor: surfaceVariantColor, borderColor }]}>
                <Icon type="ionicon" name="lock-closed-outline" size={18} color={`${textColor}90`} />
                <TextInput
                  style={[styles.input, { color: textColor }]}
                  onChangeText={setPassword}
                  value={password}
                  maxLength={30}
                  placeholder="Contraseña"
                  placeholderTextColor={`${textColor}70`}
                  secureTextEntry={!passwordVisible}
                  textContentType="password"
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setPasswordVisible((prev) => !prev)}>
                  <Icon name={passwordVisible ? 'eye-off' : 'eye'} type="ionicon" size={20} color={textColor} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: primaryColor }]} onPress={handleLogin}>
                <Text style={styles.primaryButtonText}>Entrar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.ghostButton} onPress={() => router.push('/(sesion)/forgotPassword')}>
                <Text style={[styles.ghostButtonText, { color: primaryColor }]}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>

              <Text style={[styles.legalText, { color: `${textColor}90` }]}>Al continuar aceptas los <Text style={[styles.legalLink, { color: primaryColor }]} onPress={openLegalUrl}>Términos y condiciones</Text> y la <Text style={[styles.legalLink, { color: primaryColor }]} onPress={openLegalUrl}>Política de privacidad</Text>.</Text>

              <View style={styles.footerRow}>
                <Text style={[styles.footerText, { color: `${textColor}90` }]}>¿Aún no tienes cuenta?</Text>
                <TouchableOpacity onPress={() => router.push('/(sesion)/create')}>
                  <Text style={[styles.footerLink, { color: primaryColor }]}>Crear cuenta</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  backgroundDecor: { ...StyleSheet.absoluteFillObject },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 220 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 26,
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 16,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  brand: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.2,
    marginBottom: 10,
  },
  headline: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 34,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 24,
  },
  card: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  cardTitle: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  cardCaption: { fontSize: 13, marginBottom: 18 },
  inputShell: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 14,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  ghostButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  ghostButtonText: { fontSize: 14, fontWeight: '700' },
  legalText: {
    fontSize: 12,
    lineHeight: 20,
    marginBottom: 16,
  },
  legalLink: { fontWeight: '700' },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  footerText: { fontSize: 13 },
  footerLink: { fontSize: 14, fontWeight: '800' },
});
