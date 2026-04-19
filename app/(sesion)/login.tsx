// app/login.tsx
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
    <View style={styles.container}>
      <View style={styles.appTitleTextContainer}>
        <Text style={styles.appTitleText}>Konta</Text>
      </View>

      <TextInput
          style={styles.input}
          onChangeText={(text) => setEmail(text)}
          placeholder={'Email'}
          placeholderTextColor={'white'}
          keyboardType='email-address'
        />
        <View style={{flexDirection:'row',alignItems:'center', width:'85%', backgroundColor:"#323232",marginTop: 10,borderRadius:20}}>
        <TextInput
          style={[styles.input2]}
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
            color="white"
            style={{marginLeft:10}}
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.loginButton}
        onPress={() => handleLogin()}>
        <Text style={styles.buttonText}>Iniciar sesión</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.forgotPasswordButton}
        onPress={() => router.push("/(sesion)/forgotPassword")}>
        <Text style={styles.forgotPasswordText}>
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
    backgroundColor: '#111111',
  },
  appTitleTextContainer: {
    justifyContent: 'center',
    marginBottom: 20,
  },
  appTitleText: {
    fontSize: RFValue(40),
    fontWeight: 'bold',
    color: 'white',
  },
  input: {
    backgroundColor: '#323232',
    borderRadius: 20,
    width: '85%',
    color: 'white',
    paddingLeft: 10,
    height:50,
    marginTop:10
  },
  input2: {
    backgroundColor: '#323232',
    borderRadius: 20,
    width: '85%',
    color: 'white',
    paddingLeft: 10,
    height:50,
  },
  loginButton: {
    width: '80%',
    height: 38,
    backgroundColor: '#6A6F66',
    borderRadius: 50,
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buttonText: {
    fontSize: 20,
    fontWeight: 'bold',
    alignSelf: 'center',
    color: 'black',
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
    color: 'red',
  },
});
