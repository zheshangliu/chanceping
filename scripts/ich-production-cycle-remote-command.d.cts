export interface IchProductionCycleRemoteCommandOptions {
  manifestPath?: string;
  workingDirectory?: string;
}

export function buildIchProductionCycleRemoteCommand(options?: IchProductionCycleRemoteCommandOptions): string;
