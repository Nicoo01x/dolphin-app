/** JSX element factory for the guest `dolphin` module. Elements are plain data until rendered. */

export const DOLPHIN_ELEMENT = Symbol.for('dolphin.declarative.element')
export const Fragment = Symbol.for('dolphin.declarative.fragment')

export type DolphinProps = Record<string, unknown>
/** Loosely typed on purpose: author-facing prop types live in the published `dolphin` typings. */
export type DolphinComponent = (props: DolphinProps) => unknown
export type DolphinElementType = string | typeof Fragment | DolphinComponent

export type DolphinElement = {
  readonly $$typeof: typeof DOLPHIN_ELEMENT
  readonly type: DolphinElementType
  readonly props: DolphinProps
  readonly key: string | undefined
}

export function isDolphinElement(value: unknown): value is DolphinElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    value.$$typeof === DOLPHIN_ELEMENT
  )
}

function createElement(type: DolphinElementType, props: DolphinProps, key: unknown): DolphinElement {
  return Object.freeze({
    $$typeof: DOLPHIN_ELEMENT,
    type,
    props,
    key: key === undefined || key === null ? undefined : String(key)
  })
}

/** Automatic runtime (`jsx`/`jsxs`/`jsxDEV`): children arrive inside `props`. */
export function jsx(type: DolphinElementType, props: DolphinProps | null, key?: unknown): DolphinElement {
  const { key: propKey, ...rest } = props ?? {}
  return createElement(type, rest, key ?? propKey)
}

/** Classic runtime (`h`, `jsxFactory`): children arrive as trailing arguments. */
export function h(
  type: DolphinElementType,
  props: DolphinProps | null,
  ...children: unknown[]
): DolphinElement {
  const { key, ...rest } = props ?? {}
  if (children.length > 0) {
    rest.children = children.length === 1 ? children[0] : children
  }
  return createElement(type, rest, key)
}
