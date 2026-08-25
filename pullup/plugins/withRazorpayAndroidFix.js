const { withAndroidManifest } = require('expo/config-plugins');

const UPI_PACKAGES = [
  'com.google.android.apps.nbu.paisa.user',
  'com.phonepe.app',
  'net.one97.paytm',
  'in.org.npci.upiapp',
];

module.exports = function withRazorpayAndroidFix(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults.manifest;
    const application = manifest.application?.[0];

    if (application) {
      application.$['android:largeHeap'] = 'true';
    }

    const queries = manifest.queries?.[0] || {};
    const packages = queries.package || [];
    const existingPackages = new Set(packages.map((entry) => entry.$?.['android:name']));

    for (const packageName of UPI_PACKAGES) {
      if (!existingPackages.has(packageName)) {
        packages.push({ $: { 'android:name': packageName } });
      }
    }

    queries.package = packages;
    queries.intent = queries.intent || [];
    const hasSendIntent = queries.intent.some((entry) =>
      entry.action?.some((action) => action.$?.['android:name'] === 'android.intent.action.SEND')
    );

    if (!hasSendIntent) {
      queries.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      });
    }

    manifest.queries = [queries];
    return configWithManifest;
  });
};