const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // ─── 扩展宿主（Node.js） ─────────────────────────────
    const extensionConfig = {
        target: 'node',
        mode: isProduction ? 'production' : 'development',
        devtool: isProduction ? false : 'source-map',
        entry: {
            extension: './src/extension.ts',
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
            libraryTarget: 'commonjs2',
        },
        externals: {
            vscode: 'commonjs vscode',
        },
        resolve: {
            extensions: ['.ts', '.js'],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: 'ts-loader',
                },
            ],
        },
        optimization: {
            minimize: true,
            minimizer: [
                (compiler) => {
                    const TerserPlugin = require('terser-webpack-plugin');
                    new TerserPlugin({
                        terserOptions: {
                            compress: { reduce_vars: true, inline: true },
                            mangle: true,
                            format: { comments: false }
                        },
                    }).apply(compiler);
                }
            ]
        },
        plugins: [
            new CopyPlugin({
                patterns: [
                    {
                        from: 'src/templates',
                        to: 'templates',
                        globOptions: {
                            ignore: ['**/*.ts', '**/*.js'] // TS/JS 由 entry 处理
                        }
                    }
                ],
            }),
        ],
    };

    // ─── Webview 主线程（浏览器） ────────────────────────
    const webviewConfig = {
        target: 'web',
        mode: isProduction ? 'production' : 'development',
        devtool: isProduction ? false : 'source-map',
        entry: {
            'templates/main': ['./src/templates/ort-entry.js', './src/templates/main/main.ts'],
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
            clean: false,
        },
        resolve: {
            extensions: ['.ts', '.js'],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [{
                        loader: 'ts-loader',
                        options: {
                            compilerOptions: {
                                module: 'ES2022',
                            }
                        }
                    }],
                },
            ],
        },
        optimization: {
            minimize: isProduction,
        },
    };

    // ─── Worker 渲染线程（Web Worker） ───────────────────
    const workerConfig = {
        target: 'webworker',
        mode: isProduction ? 'production' : 'development',
        devtool: isProduction ? false : 'source-map',
        entry: {
            'templates/worker': './src/templates/worker/worker.ts',
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
            clean: false,
        },
        resolve: {
            extensions: ['.ts', '.js'],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [{
                        loader: 'ts-loader',
                        options: {
                            compilerOptions: {
                                module: 'ES2022',
                            }
                        }
                    }],
                },
            ],
        },
        optimization: {
            minimize: isProduction,
        },
    };

    return [extensionConfig, webviewConfig, workerConfig];
};
