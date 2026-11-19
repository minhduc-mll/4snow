let filesToResume: readonly File[] | null = null;

export function rememberImportFiles(files: readonly File[] | null): void {
  filesToResume = files;
}

export function importFilesToResume(): readonly File[] | null {
  return filesToResume;
}
