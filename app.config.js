// Wraps app.json. Cloud builds get the Firebase file from EAS, local runs use the file in the project.
// The production build drops the draw over other apps permission, which only the development menu needs.
const production = process.env.EAS_BUILD_PROFILE === 'production';

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    ...(production ? { blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'] } : {}),
  },
});
