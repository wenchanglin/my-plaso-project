// Plasmo can bundle global CSS side-effect imports, but TypeScript needs an
// ambient module declaration to recognize them during editor type checking.
declare module "*.css"
