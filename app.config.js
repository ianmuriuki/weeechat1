// Wraps app.json. Cloud builds get the Firebase file from EAS, local runs use the file in the project.
// Every build drops the draw over other apps permission, which only the development menu needs.
// Only a development build keeps it, selected with APP_VARIANT=development, so laptop and EAS agree.
const dev = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    ...(dev ? {} : { blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'] }),
  },
});
