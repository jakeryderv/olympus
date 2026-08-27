import { serviceKey } from "./services.js";

export class SecretValue {
  readonly #value: string;

  constructor(value: string) {
    if (value.length === 0) {
      throw new Error("Secret values must not be empty.");
    }
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  toString(): string {
    return "[REDACTED]";
  }
}

export interface CredentialBroker {
  get(name: string): SecretValue;
}

export const CREDENTIAL_BROKER = serviceKey<CredentialBroker>("olympus.host.credential-broker");

export class EnvironmentCredentialBroker implements CredentialBroker {
  readonly #environment: Readonly<Record<string, string | undefined>>;

  constructor(environment: Readonly<Record<string, string | undefined>>) {
    this.#environment = environment;
  }

  get(name: string): SecretValue {
    const value = this.#environment[name];
    if (value === undefined || value.length === 0) {
      throw new Error(`Required credential is unavailable: ${name}`);
    }
    return new SecretValue(value);
  }
}
