import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../config/firebase';

const LEGAL_URL = 'https://emperblack.wordpress.com/konta-politica-de-privacidad/';

export default function CreateIn() {
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background');
  const surfaceVariantColor = useThemeColor({ light: '', dark: '' }, 'surfaceVariant');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');
  const cardsMain = useThemeColor({ light: '', dark: '' }, 'cardsMain');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errorPassword, setErrorPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

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
      Alert.alert('Error', 'No se pudo abrir la página de términos y privacidad.');
    }
  };

  const checkPassword = (value: string) => {
    if (value.length < 6) {
      setErrorPassword('La contraseña debe tener mínimo 6 caracteres');
      return false;
    }

    const regex = /[0-9]/;
    if (!regex.test(value)) {
      setErrorPassword('La contraseña debe contener al menos un número');
      return false;
    }

    setErrorPassword('');
    return true;
  };

  const handleCreate = async () => {
    const normalizedEmail = email.trim();
    const normalizedName = name.trim();

    if (!normalizedName || !normalizedEmail || !password) {
      Alert.alert('Te falta completar un campo');
      return;
    }

    if (!acceptedTerms) {
      Alert.alert('Aceptación requerida', 'Debes aceptar los términos y la política para crear tu cuenta.');
      return;
    }

    if (!checkPassword(password)) {
      Alert.alert('Contraseña inválida', 'Revisa los requisitos de la contraseña para continuar.');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const user = userCredential.user;

      await updateProfile(user, {
        displayName: normalizedName,
      });

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: normalizedEmail,
        emailVerified: false,
        acceptedTermsAt: new Date(),
        presupuestos: {
          dia: 100,
          semana: 1000,
          mes: 10000,
        },
      });

      await sendEmailVerification(user);
      await signOut(auth);

      Alert.alert(
        'Verifica tu correo',
        'Te enviamos un correo de verificación. Debes confirmarlo antes de iniciar sesión. Revisa spam si no aparece en tu bandeja.',
        [{ text: 'OK', onPress: () => router.dismissTo('/(sesion)/login') }]
      );
    } catch (error: any) {
      const errorMessage = error?.message || 'No se pudo crear la cuenta.';
      Alert.alert('Error', errorMessage);
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
              <Text style={[styles.badgeText, { color: primaryColor }]}>Empieza con orden y claridad</Text>
            </View>
            <Text style={[styles.brand, { color: textColor }]}>Konta</Text>
            <Text style={[styles.headline, { color: textColor }]}>Crea tu cuenta y toma control de tu dinero.</Text>
          </Animated.View>

          <Animated.View style={{ opacity: cardOpacity, transform: [{ translateY: cardTranslate }], width: '100%' }}>
            <View style={[styles.card, { backgroundColor: cardsMain, borderColor }]}>
              <Text style={[styles.cardTitle, { color: textColor }]}>Crear cuenta</Text>
              <Text style={[styles.cardCaption, { color: `${textColor}90` }]}>Configura tus datos básicos para empezar.</Text>

              <View style={[styles.inputShell, { backgroundColor: surfaceVariantColor, borderColor }]}>
                <Icon type="ionicon" name="person-outline" size={18} color={`${textColor}90`} />
                <TextInput
                  style={[styles.input, { color: textColor }]}
                  onChangeText={setName}
                  value={name}
                  placeholder="Nombre"
                  placeholderTextColor={`${textColor}70`}
                  maxLength={15}
                  autoCapitalize="words"
                  textContentType="nickname"
                />
              </View>

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
                  onBlur={() => checkPassword(password)}
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

              <Text style={[styles.helperText, { color: errorPassword ? '#ef4444' : `${textColor}75` }]}>
                {errorPassword || 'Usa al menos 6 caracteres e incluye un número.'}
              </Text>

              <Pressable onPress={() => setAcceptedTerms((prev) => !prev)} style={styles.checkboxRow}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: acceptedTerms ? primaryColor : `${textColor}45`,
                      backgroundColor: acceptedTerms ? primaryColor : 'transparent',
                    },
                  ]}
                >
                  {acceptedTerms && <Icon type="ionicon" name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.legalText, { color: `${textColor}C0` }]}>
                  He leído y acepto los <Text style={[styles.legalLink, { color: primaryColor }]} onPress={openLegalUrl}>Términos y condiciones</Text> y la <Text style={[styles.legalLink, { color: primaryColor }]} onPress={openLegalUrl}>Política de privacidad</Text>.
                </Text>
              </Pressable>

              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: primaryColor, opacity: acceptedTerms ? 1 : 0.72 }]} onPress={handleCreate}>
                <Text style={styles.primaryButtonText}>Crear cuenta</Text>
              </TouchableOpacity>

              <Text style={[styles.bottomHint, { color: `${textColor}90` }]}>¿Ya tienes cuenta?</Text>
              <TouchableOpacity onPress={() => router.push('/(sesion)/login')}>
                <Text style={[styles.secondaryLink, { color: primaryColor }]}>Inicia sesión</Text>
              </TouchableOpacity>
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
  backgroundDecor: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
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
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: -2,
    marginBottom: 14,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  legalText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 20,
  },
  legalLink: { fontWeight: '700' },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  bottomHint: {
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 6,
  },
  secondaryLink: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
  },
});
