const fs = require('fs');
const path = require('path');

const hybridFilePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-iap',
  'android',
  'src',
  'main',
  'java',
  'com',
  'margelo',
  'nitro',
  'iap',
  'HybridRnIap.kt'
);

const playModuleFilePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-iap',
  'android',
  'src',
  'play',
  'java',
  'com',
  'dooboolab',
  'rniap',
  'RNIapModule.kt'
);

const androidGradleFilePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-iap',
  'android',
  'build.gradle'
);

const marker = '            renewalInfoIOS = null,';
const anchor = '            webOrderLineItemIdIOS = null,\n';

let changed = false;
let touched = false;

if (fs.existsSync(hybridFilePath)) {
  touched = true;
  const content = fs.readFileSync(hybridFilePath, 'utf8');

  if (!content.includes(marker) && content.includes(anchor)) {
    const updated = content.replace(anchor, `${anchor}${marker}\n`);
    fs.writeFileSync(hybridFilePath, updated, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied HybridRnIap patch.');
  }
}

if (fs.existsSync(playModuleFilePath)) {
  touched = true;
  const playContent = fs.readFileSync(playModuleFilePath, 'utf8');
  const oldLine = '        val activity = currentActivity';
  const newLine = '        val activity = reactContext.currentActivity';

  if (playContent.includes(oldLine)) {
    const updatedPlayContent = playContent.replace(oldLine, newLine);
    fs.writeFileSync(playModuleFilePath, updatedPlayContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied Play module patch.');
  }
}

if (fs.existsSync(androidGradleFilePath)) {
  touched = true;
  let gradleContent = fs.readFileSync(androidGradleFilePath, 'utf8');
  const pluginConditional = `if (isNewArchitectureEnabled()) {\n  apply plugin: "com.facebook.react"\n}`;
  const pluginDirect = 'apply plugin: "com.facebook.react"';
  const reactConditional = `if (isNewArchitectureEnabled()) {\n  react {\n    jsRootDir = file("../src/")\n    libraryName = "RNIap"\n    codegenJavaPackageName = "com.reactnativeiap"\n  }\n}`;
  const reactDirect = `react {\n  jsRootDir = file("../src/")\n  libraryName = "RNIap"\n  codegenJavaPackageName = "com.reactnativeiap"\n}`;

  let gradleChanged = false;
  if (gradleContent.includes(pluginConditional)) {
    gradleContent = gradleContent.replace(pluginConditional, pluginDirect);
    gradleChanged = true;
  }

  if (gradleContent.includes(reactConditional)) {
    gradleContent = gradleContent.replace(reactConditional, reactDirect);
    gradleChanged = true;
  }

  if (gradleChanged) {
    fs.writeFileSync(androidGradleFilePath, gradleContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied Android codegen patch.');
  }
}

if (!touched) {
  console.log('[fix-react-native-iap] react-native-iap not found; skipping.');
  process.exit(0);
}

if (!changed) {
  console.log('[fix-react-native-iap] No patch needed.');
}
