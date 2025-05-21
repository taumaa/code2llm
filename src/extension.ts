import * as vscode from 'vscode';
import { FileSystemProvider } from './fileSystemProvider';
import { registerCommands } from './commands';

let fileSystemProvider: FileSystemProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('L\'extension "custom-file-copier" est maintenant active !');

  let rootPathUri: vscode.Uri | undefined;
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    rootPathUri = vscode.workspace.workspaceFolders[0].uri;
  } else {
    vscode.window.showInformationMessage(
      'Custom File Copier: Please open a folder to display the files.'
    );
  }

  fileSystemProvider = new FileSystemProvider(rootPathUri);

  const treeView = vscode.window.createTreeView('customFileTreeView', {
    treeDataProvider: fileSystemProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  registerCommands(context, fileSystemProvider);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      let newRootPathUri: vscode.Uri | undefined;
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        newRootPathUri = vscode.workspace.workspaceFolders[0].uri;
      }
      fileSystemProvider.updateWorkspaceRoot(newRootPathUri);
      if (!newRootPathUri) {
        vscode.window.showInformationMessage(
          'Custom File Copier: No folder opened. The view will be empty.'
        );
      }
    })
  );

  if (!rootPathUri) {
     vscode.window.showInformationMessage('Custom File Copier: Open a folder to see the list of files.');
  }
}

export function deactivate() {
  console.log('The "custom-file-copier" extension is deactivated.');
}