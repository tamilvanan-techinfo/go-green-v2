const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

// Only these paths are copied into the packaged app.
// Everything else (node_modules, out, .git, src, etc.) is skipped,
// which is what makes the "Copying files" step fast.
const KEEP = [
  '/package.json',
  '/.vite',
  // sqlite3 native module + its runtime dependencies
  '/node_modules/sqlite3',
  '/node_modules/bindings',
  '/node_modules/file-uri-to-path',
];

module.exports = {
  packagerConfig: {
    asar: {
      // Unpack native sqlite3 binaries so they can be loaded at runtime
      unpack: '**/node_modules/sqlite3/**',
    },
    ignore: (file) => {
      // Root path: never ignore
      if (!file) return false;

      const keep = KEEP.some(
        (k) =>
          file === k ||
          file.startsWith(k + '/') || // children of an allowed path
          k.startsWith(file + '/') // parents of an allowed path
      );

      return !keep;
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};