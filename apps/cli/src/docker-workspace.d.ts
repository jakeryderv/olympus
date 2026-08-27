declare module "@olympus/docker" {
  import type { OlympusPlugin } from "@olympus/core";

  export interface DockerToolPluginOptions {
    readonly image: string;
    readonly workspaceRoot: string;
    readonly approvalId?: string;
  }

  export function createDockerToolPlugin(options: DockerToolPluginOptions): OlympusPlugin;
}
