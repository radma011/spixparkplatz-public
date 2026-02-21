const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Base path für Unterordner-Deployment (z.B. '/apps/spixparkplatz' oder '' für Root)
// Kann über Umgebungsvariable WEB_BASE_PATH gesetzt werden
const BASE_PATH = process.env.WEB_BASE_PATH || '';
// publicPath: Wenn BASE_PATH gesetzt ist, muss es mit / enden (außer wenn leer)
// Wenn BASE_PATH leer ist, verwende '/' (Root)
const publicPath = BASE_PATH ? (BASE_PATH.endsWith('/') ? BASE_PATH : BASE_PATH + '/') : '/';

// Development when running dev server (no --mode), production when building with --mode production
const isProduction = process.env.NODE_ENV === 'production';
const mode = isProduction ? 'production' : 'development';

module.exports = {
  mode,
  entry: './index.web.js',
  output: {
    path: path.resolve(__dirname, 'web-build'),
    filename: 'bundle.js',
    publicPath: publicPath,
  },
  resolve: {
    extensions: ['.web.js', '.js', '.web.ts', '.ts', '.web.tsx', '.tsx', '.json'],
    alias: {
      'react-native$': 'react-native-web',
      // Use Firebase Web SDK wrapper on web
      '@react-native-firebase/app$': path.resolve(__dirname, 'web/firebase-wrapper.js'),
      '@react-native-firebase/auth$': path.resolve(__dirname, 'web/firebase-wrapper.js'),
      '@react-native-firebase/firestore$': path.resolve(__dirname, 'web/firebase-wrapper.js'),
      '@react-native-firebase/functions$': path.resolve(__dirname, 'web/mocks/firebase-functions.js'),
      '@react-native-firebase/messaging$': path.resolve(__dirname, 'web/firebase-wrapper.js'),
    },
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        // Include node_modules for react-native packages that need transpilation
        include: [
          path.resolve(__dirname, 'src'),
          path.resolve(__dirname, 'web'),
          path.resolve(__dirname, 'index.web.js'),
          path.resolve(__dirname, 'App.tsx'),
          path.resolve(__dirname, 'node_modules/@react-native-community'),
          path.resolve(__dirname, 'node_modules/react-native-qrcode-svg'),
          path.resolve(__dirname, 'node_modules/react-native-vector-icons'),
          path.resolve(__dirname, 'node_modules/react-native-web'),
        ],
        use: {
          loader: 'babel-loader',
          options: {
            // Use the existing babel.config.js
            configFile: path.resolve(__dirname, 'babel.config.js'),
            plugins: [
              ['@babel/plugin-transform-flow-strip-types'],
              ['@babel/plugin-transform-private-methods', { loose: true }],
              ['@babel/plugin-transform-private-property-in-object', { loose: true }],
            ],
          },
        },
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.ttf$/,
        type: 'asset/resource',
        include: path.resolve(__dirname, 'node_modules/react-native-vector-icons'),
      },
    ],
  },
  plugins: [
    // Note: Webpack automatically sets process.env.NODE_ENV based on --mode flag
    // No need to manually define it with DefinePlugin
    new HtmlWebpackPlugin({
      template: './web/index.html',
      filename: 'index.html',
      templateParameters: {
        basePath: BASE_PATH,
      },
    }),
    // Copy font files to build directory
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'node_modules/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
          to: path.resolve(__dirname, 'web-build/fonts/[name][ext]'),
          noErrorOnMissing: true,
        },
        // Copy favicons if they exist
        {
          from: path.resolve(__dirname, 'web/favicons'),
          to: path.resolve(__dirname, 'web-build/favicons'),
          noErrorOnMissing: true,
          globOptions: {
            ignore: ['**/.DS_Store'],
          },
        },
      ],
    }),
  ],
  performance: {
    hints: false,
    maxEntrypointSize: 2 * 1024 * 1024,
    maxAssetSize: 2 * 1024 * 1024,
  },
  devServer: {
    static: [
      {
        directory: path.join(__dirname, 'web-build'),
      },
      {
        directory: path.join(__dirname, 'web'),
        publicPath: '/',
      },
    ],
    compress: true,
    port: 3000,
    hot: true,
    historyApiFallback: true,
  },
};
