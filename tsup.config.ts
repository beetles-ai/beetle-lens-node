import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'integrations/express': 'src/integrations/express.ts',
    'integrations/nextjs': 'src/integrations/nextjs.ts',
    'integrations/fastify': 'src/integrations/fastify.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
});
