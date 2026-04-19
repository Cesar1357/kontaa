/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#e7f3fcff',
    background2: '#e7f3fcff',
    graficaHistorial: '#a1ecffff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#e7f3fcff',
    tabIconSelected: tintColorLight,
    cardMain: '#5897f7ff',
    transaccionModal:'#c8f0ffff',
    cardsMain: '#a1ecffff',
    resumenRapido:'rgba(114, 83, 15, 0.57)',
    progressBg: "#a8a8a8ff"
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    background2: '#0a0a0a',
    graficaHistorial: '#141414',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#3e505fff',
    tabIconSelected: tintColorDark,
    cardMain: '#0a0a0a',
    transaccionModal: '#1e1e1e',
    cardsMain: '#1C1C1E',
    resumenRapido:'rgba(255, 229, 174, 0.57)',
    progressBg: "#2a2a2a"
  },
};
