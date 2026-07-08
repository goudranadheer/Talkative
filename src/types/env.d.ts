// Babel (babel-preset-expo) inlines EXPO_PUBLIC_* env vars at build time.
declare var process: {
  env: { [key: string]: string | undefined };
};
