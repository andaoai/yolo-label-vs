const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
        target: 'node',
        mode: isProduction ? 'production' : 'development',
        devtool: isProduction ? false : 'source-map',
        entry: {
            extension: './src/extension.ts',
            'templates/labeling-panel': './src/templates/labeling-panel.js',
            'templates/config': './src/templates/config.js',
            'templates/LabelingState': './src/templates/LabelingState.js'
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
            libraryTarget: 'commonjs2',
            clean: true,
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
                {
                    test: /\.css$/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'templates/[name][ext]'
                    }
                },
                {
                    test: /\.html$/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'templates/[name][ext]'
                    }
                }
            ],
        },
        optimization: {
            minimize: true,
            minimizer: [
                (compiler) => {
                    // 自定义最小化配置，排除模板文件的压缩
                    const TerserPlugin = require('terser-webpack-plugin');
                    new TerserPlugin({
                        terserOptions: {
                            compress: {
                                reduce_vars: true,
                                inline: true
                            },
                            mangle: true,
                            format: {
                                comments: false
                            }
                        },
                        exclude: /templates\//
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
                            ignore: ['**/*.js'] // JS 文件已经通过 entry 配置处理
                        }
                    }
                ],
            }),
        ],
    };
};
