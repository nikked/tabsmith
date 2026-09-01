/**
 * The File System Access API is not in TypeScript's DOM library yet, so the one
 * call this app makes is declared here rather than cast away where it is used.
 * Optional, because Firefox and Safari do not implement it.
 */
interface FileSystemWritableFileStream {
  write(data: string): Promise<void>
  close(): Promise<void>
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

interface Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}
