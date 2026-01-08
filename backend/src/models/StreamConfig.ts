export interface StreamConfig {
  audioFileId: string;
  audioFilePath: string;
  qualities: string[];
  segmentDuration: number;
  bitrates: number[];
}

export interface FfmpegConfig {
  inputPath: string;
  qualities: string[];
  segmentDuration: number;
  bitrates: number[];
  preset: string;
  threads: number;
}
