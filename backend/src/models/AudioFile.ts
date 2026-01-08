export interface AudioFile {
  id: string;
  title: string;
  path: string;
  duration: number;
  metadata?: {
    artist?: string;
    album?: string;
    [key: string]: string | undefined;
  };
}

export interface AudioLibraryData {
  files: AudioFile[];
}
