const webpack = require('webpack');

module.exports = {
  webpack: {
    plugins: {
      add: [
        new webpack.ProgressPlugin({
          handler(percentage, message, ...args) {
            process.stdout.write(`\r  Build progress: ${(percentage * 100).toFixed(0)}% - ${message} ${args.length > 0 ? args[0] : ''}    `);
            if (percentage === 1) {
              process.stdout.write('\n');
            }
          },
        }),
      ],
    },
  },
  devServer: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
};