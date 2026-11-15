/** Remotion sirve los SVG importados como una URL; esto es solo para que TypeScript lo sepa. */
declare module '*.svg' {
  const src: string
  export default src
}
