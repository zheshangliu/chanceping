export interface IchProductionCycleRemoteCommandOptions {
  manifestPath?: string;
  workingDirectory?: string;
  timerOverrideSource?: string;
  timerOverridePath?: string;
  timerBackupDirectory?: string;
}

export function buildIchProductionCycleRemoteCommand(options?: IchProductionCycleRemoteCommandOptions): string;
