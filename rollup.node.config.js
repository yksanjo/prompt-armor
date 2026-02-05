import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

export default [
  // CommonJS build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/node/index.js',
      format: 'cjs',
      sourcemap: true
    },
    plugins: [
      resolve({ preferBuiltins: true }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.node.json',
        declaration: true,
        declarationDir: 'dist/node'
      })
    ],
    external: ['onnxruntime-node', 'openai', '@anthropic-ai/sdk', 'langchain']
  },
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/node/index.mjs',
      format: 'es',
      sourcemap: true
    },
    plugins: [
      resolve({ preferBuiltins: true }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.node.json',
        declaration: false
      })
    ],
    external: ['onnxruntime-node', 'openai', '@anthropic-ai/sdk', 'langchain']
  }
];
