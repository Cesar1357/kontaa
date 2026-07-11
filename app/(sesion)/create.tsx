import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut, updateProfile } from "firebase/auth";
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Icon } from 'react-native-elements';
import { RFValue } from 'react-native-responsive-fontsize';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../config/firebase';

import { doc, setDoc } from "firebase/firestore";


export default function CreateIn() {
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background');
  const surfaceVariantColor = useThemeColor({ light: '', dark: '' }, 'surfaceVariant');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errorPassword, setErrorPassword] = useState("");

  const checkPassword = (value: string) => {
  // Mínimo 6 caracteres
  if (value.length < 6) {
    setErrorPassword("La contraseña debe de tener mínimo 6 carácteres")
    return false;
  }

  // Al menos un número
  const regex = /[0-9]/;
  if (!regex.test(value)) {
    setErrorPassword("La contraseña debe contener al menos un número");
    return false;
  }
  setErrorPassword("");
  // Puedes agregar más reglas aquí (mayúsculas, símbolos, etc.)

  return true; // ✅ contraseña válida
};
  const handleCreate = async () => {
    const email2 = email.trim();
    const name2 = name.trim();

    if (!name2 || !email2 || !password) {
      Alert.alert('Te falta completar un campo');
      return;
    }

    if (!checkPassword(password)) {
      Alert.alert('Contraseña inválida', 'Revisa los requisitos de la contraseña para continuar.');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email2, password);
      const user = userCredential.user;

      await updateProfile(user, {
        displayName: name2,
      });

      const p = doc(db, "users", user.uid);
      await setDoc(p, {
        uid: user.uid,
        email: email2,
        emailVerified: false,
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
        'Te enviamos un correo de verificación. Debes confirmarlo antes de iniciar sesión. Revisa tu bandeja de spam si no lo ves en tu bandeja de entrada.',
        [{ text: 'OK', onPress: () => router.dismissTo('/(sesion)/login') }]
      );
    } catch (error: any) {
      const errorMessage = error?.message || 'No se pudo crear la cuenta.';
      Alert.alert('Error', errorMessage);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
    <KeyboardAvoidingView style={{width:"100%",alignItems:"center",flex:1,justifyContent:"center"}}>
      <View style={styles.appTitleTextContainer}>
        <Text style={[styles.appTitleText, { color: textColor }]}>Konta</Text>
      </View>
        <TextInput
          style={[styles.input, { backgroundColor: surfaceVariantColor, color: textColor, borderColor }]}
          onChangeText={(text) => setEmail(text)}
          placeholder={'Email'}
          placeholderTextColor={'white'}
          keyboardType='email-address'
        />
        <View style={{flexDirection:'row',alignItems:'center', width:'85%', backgroundColor: surfaceVariantColor,marginTop: 10,borderRadius:20, borderWidth:1, borderColor}}>
        <TextInput
          style={[styles.input2, { backgroundColor: surfaceVariantColor, color: textColor }]}
          onChangeText={(text) => setPassword(text)}
          onBlur={() => checkPassword(password)}
          maxLength={15}
          placeholder={'Contraseña'}
          placeholderTextColor={'white'}
          secureTextEntry={!passwordVisible}
          textContentType={'password'}
        />
        <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
          <Icon
            name={passwordVisible ? 'eye-off' : 'eye'}
            type='ionicon'
            size={24}
            color={textColor}
            style={{marginLeft:10}}
          />
        </TouchableOpacity>
      </View>
        <TextInput
          style={[styles.input, { backgroundColor: surfaceVariantColor, color: textColor, borderColor }]}
          onChangeText={(text) => setName(text)}
          placeholder={'Nombre'}
          maxLength={15}
          placeholderTextColor={textColor}
          textContentType={"nickname"}
        />
        <Text adjustsFontSizeToFit style={{color:"red",marginTop:5,width:"80%"}}>{errorPassword}</Text>
        <TouchableOpacity
          style={[styles.createAccountButton, { backgroundColor: primaryColor }]}
          onPress={() => handleCreate()}>
          <Text style={[styles.buttonText2, { color: 'white' }]}>Crear Cuenta</Text>
        </TouchableOpacity>
        
      </KeyboardAvoidingView>
      <View style={styles.loginLinkContainer}>
        <Text style={[styles.loginText, { color: textColor }]}>¿Ya tienes cuenta?</Text>
        <TouchableOpacity onPress={() => router.push("/(sesion)/login")}>
          <Text style={[styles.loginLink, { color: primaryColor }]}>Inicia sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appTitleTextContainer: {
    justifyContent: 'center',
    marginBottom: 20,
  },
  appTitleText: {
    fontSize: RFValue(40),
    fontWeight: 'bold',
  },
  input: {
    borderRadius: 20,
    width: '85%',
    paddingLeft: 10,
    height:50,
    marginTop:10,
    borderWidth: 1,
  },
  input2: {
    borderRadius: 20,
    width: '85%',
    paddingLeft: 10,
    height:50,
  },
  createAccountButton: {
    width: '70%',
    height: 50,
    borderRadius: 50,
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 30,
  },
  loginLinkContainer: {
    flexDirection: 'row',
    paddingBottom: 10,
    alignSelf: 'center',
    marginBottom: 0,
  },
  loginText: {
    fontSize: 16,
    marginRight: 5,
  },
  loginLink: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonText2: {
    fontSize: 25,
    fontWeight: 'bold',
    alignSelf: 'center',
  },
  checkboxContainer: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    marginTop: 5,
  },
  checkboxText: {
    fontSize: 14,
  },
  linkText: {
    color: '#57BBE3',
    fontSize: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  optionText: {
    fontSize: 16,
    marginLeft: 15,
  },
});
