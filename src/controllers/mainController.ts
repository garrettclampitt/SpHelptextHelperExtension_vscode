import * as azdata from 'azdata';
import ControllerBase from './controllerBase';
import * as vscode from 'vscode';

export default class MainController extends ControllerBase {
    public deactivate(): void {}

    public activate(): Promise<boolean> {
        const extensionUri = this._context.extensionUri;
        this._context.subscriptions.push(
            vscode.commands.registerCommand('SpHelptextHelperExtension.run', () =>
                this.showSpHelpTextPanel(extensionUri)
            ),
            vscode.commands.registerCommand('SpHelptextHelperExtension.copy', () => this.copySpHelpTextToClipboard()),
            vscode.commands.registerCommand('SpHelptextHelperExtension.openInTextDocument', () =>
                this.openInTextDocument(extensionUri)
            )
        );

        // if (vscode.window.registerWebviewPanelSerializer) {
        //     // Make sure we register a serializer in activation event
        //     vscode.window.registerWebviewPanelSerializer(CatCodingPanel.viewType, {
        //         async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
        //             console.log(`Got state: ${state}`);
        //             // Reset the webview options so we use latest uri for `localResourceRoots`.
        //             webviewPanel.webview.options = getWebviewOptions(extensionUri);
        //             CatCodingPanel.revive(webviewPanel, extensionUri);
        //         },
        //     });
        // }
        return Promise.resolve(true);
    }

    private openInTextDocument(extensionUri: vscode.Uri): PromiseLike<void> {
        return this.getSpHelpText().then((textModel) => {
            if (textModel?.Text) {
                //show panel
                const untitledFile = vscode.Uri.parse(`untitled:sp_helptext`);

                // Show the file in a new window
                vscode.workspace.openTextDocument({ content: '', language: 'sql' }).then((doc) => {
                    vscode.window
                        .showTextDocument(doc, {
                            viewColumn: vscode.ViewColumn.Beside, // option that forces the tab to open to the side.
                            preview: false,
                        })
                        .then((textEditor) => {
                            const firstLine = textEditor.document.lineAt(0);
                            const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
                            const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);

                            textEditor.edit((editBuilder) => {
                                editBuilder.replace(textRange, textModel?.Text);
                            });
                        });
                });
            }
        });
    }

    private showSpHelpTextPanel(extensionUri: vscode.Uri): PromiseLike<void> {
        return this.getSpHelpText().then((textModel) => {
            if (textModel?.Text) {
                CatCodingPanel.createOrShow(extensionUri, textModel);
            }
        });
    }

    private copySpHelpTextToClipboard(): PromiseLike<void> {
        return this.getSpHelpText().then((textModel) => {
            if (textModel?.Text) {
                //copy to clipboard
                vscode.env.clipboard.writeText(textModel.Text).then(
                    () => vscode.window.showInformationMessage('SpHelptext has copied to your clipboard.'),
                    () => vscode.window.showErrorMessage('An error occurred when copying the text to your clipboard.')
                );
            }
        });
    }

    private getSpHelpText(): PromiseLike<HelpTextModel | undefined | null | void> {
        var editor = vscode.window.activeTextEditor;
        if (!editor) {
            return Promise.resolve(); // No open text editor
        }

        var selection = editor.selection;
        var selectedText = editor.document.getText(selection);

        if (!selectedText && !selectedText.trim()) {
            vscode.window.showErrorMessage('You must select text before running this command.');
            return Promise.resolve();
        }

        selectedText = selectedText.trim();
        const HelpTextModel: HelpTextModel = { Title: selectedText, Text: '' };

        return azdata.connection.getCurrentConnection().then((connection) => {
            let connectionId = connection ? connection.connectionId : null;

            if (!connectionId) {
                vscode.window.showErrorMessage('You must be connected to a database before running this command.');
                return;
            }

            // vscode.window.showInformationMessage('running');
            if (connection) {
                return azdata.connection.getUriForConnection(connection.connectionId).then(
                    (uri) => {
                        var g = azdata.dataprotocol.getProvidersByType(
                            azdata.DataProviderType.QueryProvider
                        )[0] as azdata.QueryProvider;

                        return g.runQueryAndReturn(uri, `exec sp_helptext '${selectedText}'`).then((value) => {
                            // vscode.window.showInformationMessage('executed successfully');
                            let text = '';

                            // loop through rows and get definition text
                            if (value && value.rows) {
                                value.rows.forEach((dataRow) => {
                                    text += dataRow[0].displayValue;
                                });
                            }
                            HelpTextModel.Text = text;
                            return HelpTextModel;
                        });
                    },
                    () => {
                        vscode.window.showErrorMessage('Error occurred while running.');
                    }
                );
            }
        });
    }
}
interface HelpTextModel {
    Title: string;
    Text: string;
}

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return {
        // Enable javascript in the webview
        enableScripts: true,

        // And restrict the webview to only loading content from our extension's `media` directory.
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    };
}

/**
 * Manages cat coding webview panels
 */
class CatCodingPanel {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: CatCodingPanel | undefined;

    public static readonly viewType = 'helpTextPage';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, model: HelpTextModel | undefined) {
        const column = vscode.ViewColumn.Beside; //vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
        // If we already have a panel, show it.
        if (CatCodingPanel.currentPanel) {
            CatCodingPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            CatCodingPanel.viewType,
            'Cat Coding',
            column || vscode.ViewColumn.One,
            getWebviewOptions(extensionUri)
        );

        CatCodingPanel.currentPanel = new CatCodingPanel(panel, extensionUri, model);
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        CatCodingPanel.currentPanel = new CatCodingPanel(panel, extensionUri, undefined);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, model: HelpTextModel | undefined) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update(model);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            (e) => {
                if (this._panel.visible) {
                    this._update(model);
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showErrorMessage(message.text);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        CatCodingPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(model: HelpTextModel | undefined) {
        const webview = this._panel.webview;
        this._panel.title = model?.Title || '';
        // Local path to main script run in the webview
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');

        // And the uri we use to load this script in the webview
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

        // Local path to css styles
        const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
        const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');

        // Uri to load styles into webview
        const stylesResetUri = webview.asWebviewUri(styleResetPath);
        const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        this._panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        
				<!--
                Use a content security policy to only allow loading images from https or from our extension directory,
                and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${
            webview.cspSource
        } https:; script-src 'nonce-${nonce}';">
                
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
                
				<link href="${stylesResetUri}" rel="stylesheet">
				<link href="${stylesMainUri}" rel="stylesheet">
                
				<title>Cat Coding</title>
                </head>
                <body>
                <pre><code>${model?.Text || 'No text selected.'}</code></pre>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
        return;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
