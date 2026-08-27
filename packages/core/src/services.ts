export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface ServiceKey<T> {
  readonly id: symbol;
  readonly name: string;
  readonly __serviceType?: T;
}

export function serviceKey<T>(name: string): ServiceKey<T> {
  return Object.freeze({ id: Symbol(name), name }) as ServiceKey<T>;
}

export interface HostService<T = unknown> {
  readonly key: ServiceKey<T>;
  readonly value: T;
}

export function hostService<T>(key: ServiceKey<T>, value: T): HostService<T> {
  return { key, value };
}
