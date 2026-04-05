type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined

export type DeepImmutable<T> = T extends Primitive | ((...args: never[]) => unknown)
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepImmutable<K>, DeepImmutable<V>>
    : T extends Set<infer U>
      ? ReadonlySet<DeepImmutable<U>>
      : T extends Array<infer U>
        ? ReadonlyArray<DeepImmutable<U>>
        : T extends object
          ? { readonly [K in keyof T]: DeepImmutable<T[K]> }
          : T

export type Permutations<T> = readonly T[]
