import * as vscode from 'vscode';
import * as path from 'path';
import { FileSystemProvider, FileSystemItem } from './fileSystemProvider';

export function registerCommands(context: vscode.ExtensionContext, provider: FileSystemProvider) {
  const toggleCheckedCommand = vscode.commands.registerCommand(
    'customFileTreeView.toggleChecked',
    (item: FileSystemItem) => {
      provider.toggleItemChecked(item);
    }
  );

  const copyCheckedFilesCommand = vscode.commands.registerCommand(
    'customFileTreeView.copyCheckedFiles',
    async () => {
      const checkedFilePaths = provider.getCheckedFilePaths();
      const rootUri = provider.getWorkspaceRootUri();

      if (checkedFilePaths.length === 0) {
        vscode.window.showInformationMessage('No file selected to copy.');
        return;
      }

      let allContent = '';
      const filesReadSuccessfully: string[] = [];
      const filesFailedToRead: string[] = [];
      const filesProcessedForWhitespace: string[] = [];
      const filesProcessingFailed: string[] = [];

      for (const filePath of checkedFilePaths) {
        try {
          const fileUri = vscode.Uri.file(filePath);
          const fileContentBytes = await vscode.workspace.fs.readFile(fileUri);
          let originalFileContentString = new TextDecoder().decode(fileContentBytes);
          let contentToCopy = originalFileContentString;

          const fileExtension = path.extname(filePath).toLowerCase();

          try {
            if (fileExtension === '.json') {
              contentToCopy = JSON.stringify(JSON.parse(originalFileContentString));
              filesProcessedForWhitespace.push(path.basename(filePath) + " (JSON formatted)");
            } else {
              const lines = originalFileContentString.split(/\r\n|\r|\n/);
              const processedLines = lines.map(line => {
                const match = line.match(/^(\s*)/);
                const indentation = match ? match[0] : '';
                let lineContent = line.substring(indentation.length);

                lineContent = lineContent.replace(/ {2,}/g, ' ');
                
                lineContent = lineContent.trimEnd();

                return indentation + lineContent;
              });

              let normalizedContent = processedLines.join('\n');

              normalizedContent = normalizedContent.replace(/(\n){3,}/g, '\n\n');
              
              normalizedContent = normalizedContent.trim();

              if (normalizedContent !== originalFileContentString) {
                  filesProcessedForWhitespace.push(path.basename(filePath) + " (whitespace normalized)");
              }
              contentToCopy = normalizedContent;
            }
          } catch (processingError: any) {
            console.warn(`Error during whitespace normalization for ${filePath}:`, processingError.message, `Using original content.`);
            filesProcessingFailed.push(path.basename(filePath) + ` (normalization: ${processingError.name || 'unknown error'})`);
            contentToCopy = originalFileContentString;
          }

          let displayPath = filePath;
          if (rootUri) {
            const relativePath = path.relative(rootUri.fsPath, filePath);
            displayPath = path.normalize(relativePath === '' ? path.basename(filePath) : relativePath);
          }

          allContent += `\n\n// --- File : ${displayPath} ---\n\n`;
          allContent += contentToCopy;
          
          filesReadSuccessfully.push(path.basename(filePath));
        } catch (error: any) {
          console.error(`Error reading file ${filePath}:`, error.message);
          filesFailedToRead.push(path.basename(filePath) + ` (reading: ${error.name || 'unknown error'})`);
        }
      }

      if (allContent.startsWith("\n\n")) {
        allContent = allContent.substring(2);
      }

      if (filesReadSuccessfully.length > 0) {
        await vscode.env.clipboard.writeText(allContent);
        let successMessage = `Content of ${filesReadSuccessfully.length} file(s) copied : ${filesReadSuccessfully.join(', ')}.`;
        
        const processedCount = filesProcessedForWhitespace.length;
        const failedProcessingCount = filesProcessingFailed.length;

        const processedFilesNames = filesProcessedForWhitespace.map(f => f.replace(" (JSON formatted)", "").replace(" (whitespace normalized)", ""));
        const uniqueProcessedNames = [...new Set(processedFilesNames)];

        if (uniqueProcessedNames.length > 0 && processedFilesNames.length === filesProcessedForWhitespace.filter(f => f.includes("(JSON formatted)") || f.includes("(whitespace normalized)")).length ) {
            successMessage += `\n${uniqueProcessedNames.length} file(s) processed for whitespace optimization.`;
        }

        if (failedProcessingCount > 0) {
          successMessage += `\nFailed processing for ${failedProcessingCount} file(s) (original content used) : ${filesProcessingFailed.join(', ')}.`;
          vscode.window.showWarningMessage(successMessage, { modal: true });
        } else {
          vscode.window.showInformationMessage(successMessage);
        }

      } else if (filesFailedToRead.length > 0) {
        vscode.window.showErrorMessage(`Unable to read the content of the selected files : ${filesFailedToRead.join(', ')}.`);
      }
    }
  );

  const refreshCommand = vscode.commands.registerCommand(
    'customFileTreeView.refresh',
    () => {
      provider.refresh();
    }
  );

  context.subscriptions.push(toggleCheckedCommand, copyCheckedFilesCommand, refreshCommand);
}