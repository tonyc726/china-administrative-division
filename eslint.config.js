// ESLint flat config（替代旧 .eslintrc）：基于 typescript-eslint，真正能解析并校验 TS。
// 仅 lint 各包 src 下的 TS 源码；dist/legacy/docs/node_modules 全部忽略。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'legacy/**',
      'docs/**',
      'docs-site/**', // 独立工具链(--ignore-workspace)+ VitePress cache 产物，根 eslint 不扫
      '**/*.tsbuildinfo',
    ],
  },
  {
    files: ['packages/*/src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // TS 编译器负责未定义符号检查，关掉 no-undef 避免对 process/Buffer 等误报
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // 必须放最后：关闭所有与 Prettier 冲突的格式化规则
  prettier,
);
