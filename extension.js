// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');
var sncmder = require('./lib/sncmder.js');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "sncmder" is now active!');

    sncmder.init(vscode);

    var disposableInit = vscode.commands.registerCommand('extension.snInit', function () {
        sncmder.InitDatabase();
    });

    var disposableRebuild = vscode.commands.registerCommand('extension.snRebuild', function () {
        sncmder.buildDatabase();
    });

    var disposablePull = vscode.commands.registerCommand('extension.snPull', function () {
        sncmder.PullRecord();
    });

    var disposablePush = vscode.commands.registerCommand('extension.snPush', function () {
        sncmder.PushRecord();
    });

    context.subscriptions.push(disposableInit);
    context.subscriptions.push(disposableRebuild);
    context.subscriptions.push(disposablePull);
    context.subscriptions.push(disposablePush);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}
exports.deactivate = deactivate;