const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withNotificationFix(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;
    const application = androidManifest.application[0];

    // Ensure the tools namespace is available in the manifest
    if (!androidManifest.$) {
      androidManifest.$ = {};
    }
    androidManifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // Helper to add or replace meta-data tags with tools:replace override
    const addMetaDataValue = (name, value) => {
      let metaData = application['meta-data']?.find(md => md.$['android:name'] === name);
      if (metaData) {
        metaData.$['android:value'] = value;
        metaData.$['tools:replace'] = 'android:value';
      } else {
        application['meta-data'] = application['meta-data'] || [];
        application['meta-data'].push({
          $: {
            'android:name': name,
            'android:value': value,
            'tools:replace': 'android:value'
          }
        });
      }
    };

    const addMetaDataResource = (name, resource) => {
      let metaData = application['meta-data']?.find(md => md.$['android:name'] === name);
      if (metaData) {
        metaData.$['android:resource'] = resource;
        metaData.$['tools:replace'] = 'android:resource';
      } else {
        application['meta-data'] = application['meta-data'] || [];
        application['meta-data'].push({
          $: {
            'android:name': name,
            'android:resource': resource,
            'tools:replace': 'android:resource'
          }
        });
      }
    };

    // Apply tools:replace overrides to the conflicting attributes
    addMetaDataValue('com.google.firebase.messaging.default_notification_channel_id', 'default');
    addMetaDataResource('com.google.firebase.messaging.default_notification_color', '@color/notification_icon_color');

    return config;
  });
};
