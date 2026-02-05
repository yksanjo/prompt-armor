import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/browser/content-script.ts',
  output: {
    file: 'dist/browser/prompt-armor.browser.js',
    format: 'iife',
    sourcemap: true,
    name: 'PromptArmor'
  },
  plugins: [
    resolve({ browser: true }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.browser.json',
      declaration: false
    })
  ],
  external: []
};
