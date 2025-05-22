import * as vscode from 'vscode';
import * as path from 'path';

export class FileSystemItem extends vscode.TreeItem {
  public isDirectory: boolean;
  public isChecked: boolean;

  constructor(
    public readonly resourceUri: vscode.Uri,
    label: string,
    isDirectory: boolean,
    isChecked: boolean,
    collapsibleState?: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState || (isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None));
    this.isDirectory = isDirectory;
    this.isChecked = isChecked;
    this.tooltip = `${this.resourceUri.fsPath}`;
    this.description = isDirectory ? 'Dossier' : '';

    this.updateLabel();

    this.command = {
      command: 'customFileTreeView.toggleChecked',
      title: 'Basculer la sélection',
      arguments: [this],
    };
  }

  updateLabel(): void {
    const baseName = path.basename(this.resourceUri.fsPath);
    this.label = `${this.isChecked ? '[x]' : '[ ]'} ${baseName}`;
  }
}

export class FileSystemProvider implements vscode.TreeDataProvider<FileSystemItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileSystemItem | undefined | null | void> = new vscode.EventEmitter<FileSystemItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FileSystemItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private checkedFilePaths: Set<string> = new Set();

  constructor(private workspaceRootUri?: vscode.Uri) {}

  public getWorkspaceRootUri(): vscode.Uri | undefined {
    return this.workspaceRootUri;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileSystemItem): vscode.TreeItem {
    return element;
  }

  private async _getAllFileDescendants(dirUri: vscode.Uri): Promise<vscode.Uri[]> {
    const allFiles: vscode.Uri[] = [];
    const queue: vscode.Uri[] = [dirUri];
    const visitedDirs: Set<string> = new Set();
    const ignoredNames = new Set([
      'node_modules',
      '.git',
      '.vscode',
      'package-lock.json',
      'yarn.lock',
      'yarn-lock.json',
      'env',
      'venv',
      '__pycache__',
    ]);

    while (queue.length > 0) {
      const currentDirUri = queue.shift()!;
      if (visitedDirs.has(currentDirUri.fsPath)) {
        continue;
      }
      visitedDirs.add(currentDirUri.fsPath);

      try {
        const entries = await vscode.workspace.fs.readDirectory(currentDirUri);
        for (const [name, type] of entries) {
          if (ignoredNames.has(name)) {
            continue;
          }
          const resourceUri = vscode.Uri.joinPath(currentDirUri, name);
          if (type === vscode.FileType.Directory) {
            queue.push(resourceUri);
          } else if (type === vscode.FileType.File) {
            allFiles.push(resourceUri);
          }
        }
      } catch (error) {
        console.error(`Erreur lors de la lecture du dossier ${currentDirUri.fsPath} dans _getAllFileDescendants:`, error);
      }
    }
    return allFiles;
  }

  private async _calculateDirectoryCheckedState(dirUri: vscode.Uri): Promise<boolean> {
    const files = await this._getAllFileDescendants(dirUri);
    if (files.length === 0) {
      return false;
    }
    return files.every(fileUri => this.checkedFilePaths.has(fileUri.fsPath));
  }

  async getChildren(element?: FileSystemItem): Promise<FileSystemItem[]> {
    if (!this.workspaceRootUri) {
      return [];
    }

    const parentUri = element ? element.resourceUri : this.workspaceRootUri;
    const items: FileSystemItem[] = [];
    const ignoredNames = new Set([
      'node_modules',
      '.git',
      '.vscode',
      'package-lock.json',
      'yarn.lock',
      'yarn-lock.json',
      'env',
      'venv',
      '__pycache__',
    ]);

    try {
      const entries = await vscode.workspace.fs.readDirectory(parentUri);
      entries.sort((a, b) => {
        if (a[1] === vscode.FileType.Directory && b[1] !== vscode.FileType.Directory) return -1;
        if (a[1] !== vscode.FileType.Directory && b[1] === vscode.FileType.Directory) return 1;
        return a[0].localeCompare(b[0]);
      });

      for (const [name, type] of entries) {
        if (ignoredNames.has(name)) {
          continue;
        }

        const resourceUri = vscode.Uri.joinPath(parentUri, name);
        const isDirectory = type === vscode.FileType.Directory;
        let isChecked: boolean;

        if (isDirectory) {
          isChecked = await this._calculateDirectoryCheckedState(resourceUri);
        } else {
          isChecked = this.checkedFilePaths.has(resourceUri.fsPath);
        }
        
        items.push(new FileSystemItem(resourceUri, name, isDirectory, isChecked));
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Erreur lors de la lecture du dossier ${parentUri.fsPath}: ${error}`);
    }
    return items;
  }

  async toggleItemChecked(item: FileSystemItem): Promise<void> {
    if (item.isDirectory) {
      const allDescendantFiles = await this._getAllFileDescendants(item.resourceUri);
      const newCheckedStatusForFiles = !item.isChecked;

      if (allDescendantFiles.length > 0) {
        for (const fileUri of allDescendantFiles) {
          if (newCheckedStatusForFiles) {
            this.checkedFilePaths.add(fileUri.fsPath);
          } else {
            this.checkedFilePaths.delete(fileUri.fsPath);
          }
        }
      }
      this.refresh();
    } else {
      if (this.checkedFilePaths.has(item.resourceUri.fsPath)) {
        this.checkedFilePaths.delete(item.resourceUri.fsPath);
      } else {
        this.checkedFilePaths.add(item.resourceUri.fsPath);
      }
      this.refresh();
    }
  }

  getCheckedFilePaths(): string[] {
    return Array.from(this.checkedFilePaths);
  }

  updateWorkspaceRoot(workspaceRootUri?: vscode.Uri) {
    this.workspaceRootUri = workspaceRootUri;
    this.checkedFilePaths.clear();
    this.refresh();
  }
}