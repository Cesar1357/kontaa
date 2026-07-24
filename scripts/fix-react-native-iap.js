const fs = require('fs');
const path = require('path');

const filePath = path.join(
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

const marker = '            renewalInfoIOS = null,';
const anchor = '            webOrderLineItemIdIOS = null,\n';

if (!fs.existsSync(filePath)) {
  console.warn('[fix-react-native-iap] File not found, skipping:', filePath);
  process.exit(0);
}

const content = fs.readFileSync(filePath, 'utf8');

if (content.includes(marker)) {
  console.log('[fix-react-native-iap] Patch already applied.');
  process.exit(0);
}

if (!content.includes(anchor)) {
  console.error('[fix-react-native-iap] Anchor not found; aborting patch.');
  process.exit(1);
}

const updated = content.replace(anchor, `${anchor}${marker}\n`);
fs.writeFileSync(filePath, updated, 'utf8');
console.log('[fix-react-native-iap] Applied local Android constructor fix.');
