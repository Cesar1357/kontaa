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

const datetimePickerGradleFilePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-community',
  'datetimepicker',
  'android',
  'build.gradle'
);

const expoConstantsGradleFilePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-constants',
  'scripts',
  'get-app-config-android.gradle'
);

const expoModulesCoreGradleFilePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-modules-core',
  'android',
  'build.gradle'
);

const nitroModulesGradleFilePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-nitro-modules',
  'android',
  'build.gradle'
);

const nitroPrefabGradleFilePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-nitro-modules',
  'android',
  'fix-prefab.gradle'
);

const webviewGradleFilePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-webview',
  'android',
  'build.gradle'
);

const asyncStorageGradleFilePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-async-storage',
  'async-storage',
  'android',
  'build.gradle'
);

const asyncStorageNextSourcePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-async-storage',
  'async-storage',
  'android',
  'src',
  'main',
  'java',
  'com',
  'reactnativecommunity',
  'asyncstorage',
  'next'
);

const asyncStorageDisabledNextSourcePath = `${asyncStorageNextSourcePath}.disabled`;
const asyncStorageDisabledNextStoragePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-async-storage',
  'async-storage',
  'android',
  'async-storage-next-disabled'
);

const nitroModulesGradleFilePathForSources = nitroModulesGradleFilePath;

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

if (fs.existsSync(datetimePickerGradleFilePath)) {
  touched = true;
  let datetimePickerContent = fs.readFileSync(datetimePickerGradleFilePath, 'utf8');
  const legacyKotlinOptions = `    kotlinOptions {\n        jvmTarget = '17'\n    }`;
  const modernKotlinOptions = `    kotlin {\n        compilerOptions {\n            jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17\n        }\n    }`;

  if (datetimePickerContent.includes(legacyKotlinOptions)) {
    datetimePickerContent = datetimePickerContent.replace(
      legacyKotlinOptions,
      modernKotlinOptions
    );
    fs.writeFileSync(datetimePickerGradleFilePath, datetimePickerContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied datetimepicker Kotlin compiler patch.');
  }
}

if (fs.existsSync(expoConstantsGradleFilePath)) {
  touched = true;
  let expoConstantsContent = fs.readFileSync(expoConstantsGradleFilePath, 'utf8');
  const legacyVariants = 'project.android.libraryVariants.all { variant ->';
  const modernVariants = 'project.android.buildTypes.each { buildType ->\n    def variantName = buildType.name';

  if (expoConstantsContent.includes(legacyVariants)) {
    expoConstantsContent = expoConstantsContent.replace(
      new RegExp(legacyVariants, 'g'),
      modernVariants
    );
    expoConstantsContent = expoConstantsContent
      .replaceAll('variant.name', 'variantName')
      .replaceAll('variant.buildType.name', 'buildType.name')
      .replaceAll(
        'variant.preBuildProvider.configure',
        'tasks.named("pre${variantName.capitalize()}Build").configure'
      )
      .replaceAll(
        'if (!variant.buildType.debuggable)',
        'if (!buildType.debuggable)'
      );
    fs.writeFileSync(expoConstantsGradleFilePath, expoConstantsContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied expo-constants AGP 9 variant patch.');
  }
}

if (fs.existsSync(expoModulesCoreGradleFilePath)) {
  touched = true;
  let expoModulesCoreContent = fs.readFileSync(expoModulesCoreGradleFilePath, 'utf8');
  const legacyNdkDirectories = [
    'PrebuiltNativeLibs.findLlvmStrip(android.ndkDirectory)',
    'PrebuiltNativeLibs.findLlvmStrip(new File(android.sdkDirectory, "ndk/${android.ndkVersion}"))'
  ];
  const modernNdkDirectory = 'PrebuiltNativeLibs.findLlvmStrip(new File(System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT"), "ndk/${android.ndkVersion}"))';

  if (legacyNdkDirectories.some((value) => expoModulesCoreContent.includes(value))) {
    for (const legacyNdkDirectory of legacyNdkDirectories) {
      expoModulesCoreContent = expoModulesCoreContent.replace(
        legacyNdkDirectory,
        modernNdkDirectory
      );
    }
    fs.writeFileSync(expoModulesCoreGradleFilePath, expoModulesCoreContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied expo-modules-core AGP 9 NDK path patch.');
  }
}

if (fs.existsSync(nitroModulesGradleFilePath)) {
  touched = true;
  let nitroModulesContent = fs.readFileSync(nitroModulesGradleFilePath, 'utf8');
  const directKotlinPlugin = "apply plugin: 'org.jetbrains.kotlin.android'";
  const conditionalKotlinPlugin = `def shouldApplyKotlinPlugin() {
  def agpMajor = com.android.Version.ANDROID_GRADLE_PLUGIN_VERSION.tokenize('.')[0].toInteger()
  if (agpMajor <= 8) {
    return true
  }
  def propertyVal = providers.gradleProperty("android.builtInKotlin").orNull
  def builtInKotlinEnabled = propertyVal != null ? propertyVal.toBoolean() : true
  return !builtInKotlinEnabled
}

if (shouldApplyKotlinPlugin()) {
  apply plugin: 'org.jetbrains.kotlin.android'
}`;

  const kotlinBlockStart = nitroModulesContent.indexOf('def shouldApplyKotlinPlugin()');
  const kotlinBlockEnd = nitroModulesContent.indexOf('apply from: "./fix-prefab.gradle"');
  const kotlinBlockCount = nitroModulesContent.split('def shouldApplyKotlinPlugin()').length - 1;
  if (kotlinBlockStart >= 0 && kotlinBlockEnd > kotlinBlockStart && kotlinBlockCount > 1) {
    nitroModulesContent = `${nitroModulesContent.slice(0, kotlinBlockStart)}${conditionalKotlinPlugin}\n${nitroModulesContent.slice(kotlinBlockEnd)}`;
    fs.writeFileSync(nitroModulesGradleFilePath, nitroModulesContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied Nitro Modules AGP 9 Kotlin patch.');
  } else if (kotlinBlockStart < 0 && nitroModulesContent.includes(directKotlinPlugin)) {
    nitroModulesContent = nitroModulesContent.replace(directKotlinPlugin, conditionalKotlinPlugin);
    fs.writeFileSync(nitroModulesGradleFilePath, nitroModulesContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied Nitro Modules AGP 9 Kotlin patch.');
  }

  const newArchSourceMarker = '        kotlin.srcDirs += ["src/newarch"]';
  const newArchJavaSource = '          "src/newarch"\n        ]';
  if (!nitroModulesContent.includes(newArchSourceMarker) && nitroModulesContent.includes(newArchJavaSource)) {
    nitroModulesContent = nitroModulesContent.replace(
      newArchJavaSource,
      `${newArchJavaSource}\n        kotlin.srcDirs += ["src/newarch"]`
    );
    fs.writeFileSync(nitroModulesGradleFilePathForSources, nitroModulesContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied Nitro Modules Kotlin source-set patch.');
  }
}

if (fs.existsSync(nitroPrefabGradleFilePath)) {
  touched = true;
  let nitroPrefabContent = fs.readFileSync(nitroPrefabGradleFilePath, 'utf8');
  const legacyVariants = "def variants = proj.android.hasProperty('applicationVariants') ? proj.android.applicationVariants : proj.android.libraryVariants";
  const compatibleVariants = `def variants
    if (proj.android.hasProperty('applicationVariants')) {
      variants = proj.android.applicationVariants
    } else if (proj.android.hasProperty('libraryVariants')) {
      variants = proj.android.libraryVariants
    } else {
      return
    }`;

  if (nitroPrefabContent.includes(legacyVariants)) {
    nitroPrefabContent = nitroPrefabContent.replace(legacyVariants, compatibleVariants);
    fs.writeFileSync(nitroPrefabGradleFilePath, nitroPrefabContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied Nitro Prefab AGP 9 variant patch.');
  }
}

if (fs.existsSync(webviewGradleFilePath)) {
  touched = true;
  let webviewContent = fs.readFileSync(webviewGradleFilePath, 'utf8');
  const directKotlinPlugin = "apply plugin: 'kotlin-android'";
  const conditionalKotlinPlugin = `def shouldApplyKotlinPlugin() {
    def agpMajor = com.android.Version.ANDROID_GRADLE_PLUGIN_VERSION.tokenize('.')[0].toInteger()
    if (agpMajor <= 8) {
        return true
    }
    def propertyVal = providers.gradleProperty("android.builtInKotlin").orNull
    def builtInKotlinEnabled = propertyVal != null ? propertyVal.toBoolean() : true
    return !builtInKotlinEnabled
}

if (shouldApplyKotlinPlugin()) {
    apply plugin: 'kotlin-android'
}`;

  const webviewKotlinBlockStart = webviewContent.indexOf('def shouldApplyKotlinPlugin()');
  const webviewKotlinBlockEnd = webviewContent.indexOf('\nandroid {', webviewKotlinBlockStart);
  const webviewKotlinBlockCount = webviewContent.split('def shouldApplyKotlinPlugin()').length - 1;
  if (webviewKotlinBlockStart >= 0 && webviewKotlinBlockEnd > webviewKotlinBlockStart && webviewKotlinBlockCount > 1) {
    webviewContent = `${webviewContent.slice(0, webviewKotlinBlockStart)}${conditionalKotlinPlugin}\n${webviewContent.slice(webviewKotlinBlockEnd + 1)}`;
    fs.writeFileSync(webviewGradleFilePath, webviewContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied WebView AGP 9 Kotlin patch.');
  } else if (webviewKotlinBlockStart < 0 && webviewContent.includes(directKotlinPlugin)) {
    webviewContent = webviewContent.replace(directKotlinPlugin, conditionalKotlinPlugin);
    fs.writeFileSync(webviewGradleFilePath, webviewContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied WebView AGP 9 Kotlin patch.');
  }
}

if (fs.existsSync(asyncStorageGradleFilePath)) {
  touched = true;
  let asyncStorageContent = fs.readFileSync(asyncStorageGradleFilePath, 'utf8');
  const sourceSetBlock = `            if (!isNewArchitectureEnabled) {
                srcDirs += 'src/oldarch/java'
            }`;
  const compatibleSourceSetBlock = `${sourceSetBlock}

            if (!useNextStorage) {
                exclude '**/next/**'
            }`;
  const androidBlockEnd = `    }
}

repositories {`;
  const compatibleAndroidBlockEnd = `    }

    if (!useNextStorage) {
        sourceSets.main.kotlin.exclude '**/next/**'
    }
}

repositories {`;

  if (asyncStorageContent.includes(sourceSetBlock) && !asyncStorageContent.includes("exclude '**/next/**'")) {
    asyncStorageContent = asyncStorageContent.replace(sourceSetBlock, compatibleSourceSetBlock);
    fs.writeFileSync(asyncStorageGradleFilePath, asyncStorageContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied AsyncStorage AGP 9 source-set patch.');
  } else if (asyncStorageContent.includes("exclude '**/next/**'") && asyncStorageContent.includes(androidBlockEnd) && !asyncStorageContent.includes("sourceSets.main.kotlin.exclude")) {
    asyncStorageContent = asyncStorageContent.replace(androidBlockEnd, compatibleAndroidBlockEnd);
    fs.writeFileSync(asyncStorageGradleFilePath, asyncStorageContent, 'utf8');
    changed = true;
    console.log('[fix-react-native-iap] Applied AsyncStorage Kotlin source-set patch.');
  }
}

if (fs.existsSync(asyncStorageNextSourcePath) && !fs.existsSync(asyncStorageDisabledNextStoragePath)) {
  fs.renameSync(asyncStorageNextSourcePath, asyncStorageDisabledNextStoragePath);
  touched = true;
  changed = true;
  console.log('[fix-react-native-iap] Disabled unused AsyncStorage next source set.');
}

if (fs.existsSync(asyncStorageDisabledNextSourcePath) && !fs.existsSync(asyncStorageDisabledNextStoragePath)) {
  fs.renameSync(asyncStorageDisabledNextSourcePath, asyncStorageDisabledNextStoragePath);
  touched = true;
  changed = true;
  console.log('[fix-react-native-iap] Relocated disabled AsyncStorage next source set.');
}

if (!touched) {
  console.log('[fix-react-native-iap] react-native-iap not found; skipping.');
  process.exit(0);
}

if (!changed) {
  console.log('[fix-react-native-iap] No patch needed.');
}
