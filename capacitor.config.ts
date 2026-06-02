/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.maya.sleepimprovement',
  appName: 'Sleep Compass',
  webDir: 'dist',
  loggingBehavior: 'none',
  plugins: {
    FirebaseAuthentication: {
      providers: ['google.com'],
      skipNativeAuth: false,
    },
  },
};

export default config;
