// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { LabelingPanel } from './LabelingPanel';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "yolo-labeling-vs" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('yolo-labeling-vs.openLabelingPanel', async (uri?: vscode.Uri, fromContextMenu?: boolean) => {
		// If no URI is provided and it's likely called from keyboard shortcut (not from context menu)
		if (!uri && fromContextMenu !== true) {
			// Determine if the command was called from a keyboard shortcut
			// (when called from context menu, uri is provided, or fromContextMenu flag is set to true)
			const yamlFiles = await vscode.workspace.findFiles('**/*.{yaml,yml}');
			
			if (yamlFiles.length === 0) {
				vscode.window.showErrorMessage('No YAML files found in the workspace. Please open a YOLO dataset configuration file.');
				return;
			}
			
			// If there's only one YAML file in the workspace, use it directly
			if (yamlFiles.length === 1) {
				uri = yamlFiles[0];
			} else {
				// Otherwise, prompt user to select one from the list
				const fileItems = yamlFiles.map(file => ({
					label: vscode.workspace.asRelativePath(file),
					description: file.fsPath,
					file
				}));
				
				const selected = await vscode.window.showQuickPick(fileItems, {
					placeHolder: 'Select a YAML file to open with YOLO Labeling',
					ignoreFocusOut: true
				});
				
				if (!selected) {
					// User cancelled the selection
					return;
				}
				
				uri = selected.file;
			}
		} else if (!uri) {
			// If called from a context that should have a URI but doesn't
			vscode.window.showErrorMessage('Please select a YAML file to open with YOLO Labeling.');
			return;
		}
		
		// Always create a new panel instead of reusing the existing one
		LabelingPanel.createOrShow(context.extensionUri, uri);
	});

	// Register a separate command for keyboard shortcut specifically
	let shortcutDisposable = vscode.commands.registerCommand('yolo-labeling-vs.openLabelingPanelKeyboard', async () => {
		// Call the main command but indicate it's called from keyboard shortcut
		await vscode.commands.executeCommand('yolo-labeling-vs.openLabelingPanel', undefined, false);
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(shortcutDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
