'use strict';

import * as vscode from 'vscode';

export default abstract class ControllerBase implements vscode.Disposable {
	protected _context: vscode.ExtensionContext;

	public constructor(context: vscode.ExtensionContext) {
		this._context = context;
	}

	abstract activate(): Promise<boolean>;

	abstract deactivate(): void;

	public dispose(): void {
		this.deactivate();
	}
}