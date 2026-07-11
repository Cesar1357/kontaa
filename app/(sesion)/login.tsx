// app/login.tsx
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';
import { auth } from '../../config/firebase';

import { useState } from 'react';
import {
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { RFValue } from 'react-native-responsive-fontsize';

import { signInWithEmailAndPassword } from "firebase/auth";


export default function LogIn()  {
  const backgroundColor = useThemeColor({ light: '', dark: '' }, 'background');
  const surfaceVariantColor = useThemeColor({ light: '', dark: '' }, 'surfaceVariant');
  const textColor = useThemeColor({ light: '', dark: '' }, 'text');
  const borderColor = useThemeColor({ light: '', dark: '' }, 'border');
  const primaryColor = useThemeColor({ light: '', dark: '' }, 'primary');

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false);

  const handleLogin = async()=>{
    var email2 = email.trimEnd()
    if(email2 !=="" && password !==""){
        signInWithEmailAndPassword(auth, email2, password)
        .then(async(userCredential) => {
          router.dismissTo("/(tabs)");
        })
        .catch((error) => {
          const errorCode = error.code;
          const errorMessage = error.message;
          Alert.alert(errorMessage)
        });
      }else{
        alert("Te faltan campos")
      }
  };

  


    return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.appTitleTextContainer}>
        <Text style={[styles.appTitleText, { color: textColor }]}>Konta</Text>
      </View>

      <TextInput
          style={[styles.input, { backgroundColor: surfaceVariantColor, color: textColor, borderColor }]}
          onChangeText={(text) => setEmail(text)}
          placeholder={'Email'}
          placeholderTextColor={textColor}
          keyboardType='email-address'
        />
        <View style={{flexDirection:'row',alignItems:'center', width:'85%', backgroundColor: surfaceVariantColor,marginTop: 10,borderRadius:20,borderWidth:1,borderColor}}>
        <TextInput
          style={[styles.input2, { backgroundColor: surfaceVariantColor, color: textColor }]}
          onChangeText={(text) => setPassword(text)}
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

      <TouchableOpacity
        style={[styles.loginButton, { backgroundColor: primaryColor }]}
        onPress={() => handleLogin()}>
        <Text style={[styles.buttonText, { color: 'white' }]}>Iniciar sesión</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.forgotPasswordButton}
        onPress={() => router.push("/(sesion)/forgotPassword")}>
        <Text style={[styles.forgotPasswordText, { color: primaryColor }]}> 
          ¿Olvidaste tu contraseña?
        </Text>
      </TouchableOpacity>
    </View>
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
  loginButton: {
    width: '80%',
    height: 38,
    borderRadius: 50,
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buttonText: {
    fontSize: 20,
    fontWeight: 'bold',
    alignSelf: 'center',
  },
  forgotPasswordButton: {
    width: '60%',
    height: 38,
    borderRadius: 50,
    alignSelf: 'center',
    marginTop: 20,
  },
  forgotPasswordText: {
    fontSize: 15,
    fontWeight: 'bold',
    alignSelf: 'center',
  },
});
