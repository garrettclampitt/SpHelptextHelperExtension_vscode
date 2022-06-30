'use strict';

import * as azdata from 'azdata';
import ControllerBase from './controllerBase';
import * as vscode from 'vscode';

export default class MainController extends ControllerBase {

    public deactivate(): void {
    }

    public activate(): Promise<boolean> {
        this._context.subscriptions.push(vscode.commands.registerCommand('SpHelptextHelperExtension.run', () => this.onExecute()));

        return Promise.resolve(true);
    }

    private onExecute(): void {
        var editor = vscode.window.activeTextEditor;
        if (!editor) {
            return; // No open text editor
        }

        var selection = editor.selection;
        var selectedText = editor.document.getText(selection);

        if (!selectedText && !selectedText.trim()) {
            vscode.window.showErrorMessage('You must select text before running this command.');
            return;
        }

        selectedText = selectedText.trim();
        // vscode.window.showInformationMessage(`Selected text: ${selectedText}`);

        azdata.connection.getCurrentConnection().then(connection => {
            let connectionId = connection ? connection.connectionId : null;

            if (!connectionId) {
                vscode.window.showErrorMessage('You must be connected to a database before running this command.');
                return;
            }

            // vscode.window.showInformationMessage('running');
            if (connection) {
                azdata.connection.getUriForConnection(connection.connectionId).then(uri => {
                    var g = azdata.dataprotocol.getProvidersByType(
                        azdata.DataProviderType.QueryProvider
                    )[0] as azdata.QueryProvider;

                    var t = g.runQueryAndReturn(
                        uri,
                        `exec sp_helptext '${selectedText}'`
                    ).then(value => {

                        // vscode.window.showInformationMessage('executed successfully');
                        let text = '';

                        // loop through rows and get definition text
                        if (value && value.rows) {
                            value.rows.forEach(dataRow => {
                                text += dataRow[0].displayValue;
                            });
                        }

                        if (!editor) {
                            return;
                        }

                        const untitledFile = vscode.Uri.parse(`untitled:sp_helptext`);

                        // Show the file in a new window
                        vscode.workspace.openTextDocument(untitledFile).then(doc => {
                            vscode.window.showTextDocument(
                                doc,
                                {
                                    viewColumn: vscode.ViewColumn.Beside, // option that forces the tab to open to the side.
                                    preview: false
                                }
                            ).then(textEditor => {
                                const firstLine = textEditor.document.lineAt(0);
                                const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
                                const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);

                                textEditor.edit(editBuilder => {
                                    editBuilder.replace(textRange, text);
                                });
                            });
                        });

                    });

                }, () => {
                    vscode.window.showErrorMessage('Error occurred while running.');
                });

            }
        });
    }
}
