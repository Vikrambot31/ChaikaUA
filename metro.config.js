const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Ограничиваем Metro только текущей папкой проекта
config.watchFolders = [__dirname];
config.resolver = {
  ...config.resolver,
  blockList: [
    // Игнорируем другие папки проекта и бекапы
    /mobile-app[^\/]*\/(?!mobile-app-short).*/,
    /\.\.\/mobile-app\/.*/,
  ],
};

// Оптимизация для загрузки изображений
config.transformer = {
  ...config.transformer,
  assetPlugins: ['expo-asset/tools/hashAssetFiles'],
};

// Увеличиваем лимиты для больших assets
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
