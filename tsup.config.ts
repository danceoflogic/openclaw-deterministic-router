import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // TypeScript 7 declarations are emitted by tsc (see tsconfig.build.json).
  dts: false,
  sourcemap: true,
  clean: true,
  external: ["openclaw"],
});
