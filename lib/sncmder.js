var fs = require('fs');
var _ = require('lodash');
var path = require('path');
var shell = require('shelljs');
var jsonfile = require('jsonfile');
var snrest = require('./snrest.js');
var recordTypes = require('./sntypes.json');

var sncmder = function () {};
sncmder.prototype.init = function (vscode) {
    this.vscode = vscode;
    if (!this.vscode.workspace) {
        this.vscode.window.showErrorMessage('Workspace is required, please open up a folder!');
        return;
    }

    this.appConfig = this.getAppConfig();
    if (this.appConfig.host && this.appConfig.sncmder) {
        this.createStatusBarIndicator(this.appConfig.host);
    }

    this.outputChannel = this.vscode.window.createOutputChannel('SN-Editor');
};
sncmder.prototype.getRestClient = function () {
    var pass = this.appConfig.password;
    var restClient =  snrest({
        'host': this.appConfig.host,
        'user': this.appConfig.username,
        'pass': pass
    });
    if(!this.restClient) {
        this.restClient = restClient;
    }
    return this.restClient;
};
sncmder.prototype.createDirectory = function (path) {
    if (!fs.existsSync(path)) fs.mkdirSync(path);
    return path;
};
sncmder.prototype.minifyResult = function (result, recordType, typeName) {
    var minifiedResult = [];
    for (var i = 0; i < result.length; i++) {
        var rec = result[i];
        minifiedResult.push({
            label: rec[recordType.key],
            description: recordType.table,
            detail: rec.sys_id,
            sys_id: rec.sys_id,
            table: recordType.table,
            recordType: typeName
        });
    }
    return minifiedResult;
};
sncmder.prototype.buildDatabase = function () {
    var self = this;
    self.outputChannel.show(true);
    self.outputChannel.appendLine('Start downloading files from ' + self.appConfig.host);

    var count = 0;
    var $sn = self.getRestClient(self.appConfig);
    for (var typeName in recordTypes) {
        var recordType = recordTypes[typeName];
        var workerFunc = function (recordType, result) {
            var minifiedResult = self.minifyResult(result, recordType, recordType.name);
            jsonfile.writeFile(path.join(self.appConfig.databasepath, recordType.table + '.json'), minifiedResult);
            count++;
            self.outputChannel.appendLine('Finished downloading [' + count + '] of [' + Object.keys(recordTypes).length + ']');
        };
        $sn(recordType.table).getRecords().then(workerFunc.bind(null, recordType));
    }
};
sncmder.prototype.showInputBox = function (question, isPassword) {
    return this.vscode.window.showInputBox({
        placeHolder: question,
        ignoreFocusOut: true,
        password: isPassword
    });
};
sncmder.prototype.showQuickPick = function (data) {
    return this.vscode.window.showQuickPick(data, {
        ignoreFocusOut: true
    });
};
sncmder.prototype.createStatusBarIndicator = function (hostname) {
    var sbi = this.vscode.window.createStatusBarItem(1);
    sbi.text = hostname;
    sbi.show();
    return sbi;
};
sncmder.prototype.getAppConfig = function () {
    try {
        var rootpath = this.vscode.workspace.rootPath;
        var databasepath = this.createDirectory(path.join(rootpath, '.database'));
        var metapath = path.join(databasepath, 'meta.json');

        var configpath = path.join(rootpath, 'config.json');
        if (fs.existsSync(configpath)) {
            var config = jsonfile.readFileSync(configpath);
            config.rootpath = rootpath;
            config.databasepath = databasepath;
            config.metapath = metapath;
            config.extensionPath = this.vscode.extensions.getExtension("mak.sncmder").extensionPath;
            if (config.sncmder === true) {
                return config;
            }
        } else {
            return {
                rootpath: rootpath,
                databasepath: databasepath,
                metapath: metapath
            };
        }
    } catch (err) {}
    return {};
};
sncmder.prototype.getQuickPickRecordTypes = function () {
    var result = []
    for (var recordType in recordTypes) {
        result.push(recordType.toString());
    }
    return result;
};
sncmder.prototype.writeToMeta = function (filepath, sysId, table, field) {
    var metaArray = [];
    if (fs.existsSync(this.appConfig.metapath)) {
        try {
            metaArray = jsonfile.readFileSync(this.appConfig.metapath);
        } catch (err) {
            metaArray = [];
        }
    }
    var metaRec = _.find(metaArray, function (o) {
        return o.sys_id == sysId && o.field == field;
    });
    if (metaRec) {
        metaRec.filepath = filepath;
        metaRec.sys_id = sysId;
        metaRec.table = table;
        metaRec.field = field;
    } else {
        metaArray.push({
            filepath: filepath,
            sys_id: sysId,
            table: table,
            field: field
        });
    }
    jsonfile.writeFileSync(this.appConfig.metapath, metaArray);
};
sncmder.prototype.getMetaFromPath = function (filepath) {
    if (fs.existsSync(this.appConfig.metapath)) {
        var metaData = jsonfile.readFileSync(this.appConfig.metapath);
        return _.find(metaData, m => {
            return m.filepath == filepath;
        });
    }
    return null;
};
sncmder.prototype.getWritePath = function (subDirPattern, record, table) {
    var subDirs = '';
    var recordAttributes = /(<[a-z_]*>)/gi; // eg. "active_<active_field>".match(recordAttributes)
    subDirs = path.join(this.appConfig.rootpath, table);

    if (subDirPattern && subDirPattern !== '') {
        var subDirParts = subDirPattern.split('/'),
            subFolders = [];
        for (var j = 0; j < subDirParts.length; j++) {
            var subPart = subDirParts[j],
                field = subPart,
                prefix = '';

            // this is a mixed pattern like "active_<active>/type" so we need to evaluate the tags
            if (subPart.indexOf('<') >= 0) {
                var regExParts = subPart.match(recordAttributes);

                // todo, support multiple regex matches in one subdir path.
                // eg. "active_<active_field>_type_<type>".match(recordAttributes) gives ["<active_field>", "<type>"]
                field = regExParts[0].replace('<', '').replace('>', '');
                prefix = subPart.replace(regExParts[0], '');
            }

            if (record[field]) {
                var fieldValue = record[field];
                if(fieldValue.indexOf(' ') >= 0) {
                    fieldValue = fieldValue.toLowerCase().replace(/ /g, "_");
                }
                subFolders.push(prefix + fieldValue);
            }
        }
        for (var i = 0; i < subFolders.length; i++) {
            subDirs = path.join(subDirs, subFolders[i]);
        }
    }
    return subDirs;
};
sncmder.prototype.InitDatabase = function () {
    var self = this;
    self.appConfig = self.getAppConfig();
    self.showInputBox('Instance FQDN (makindustries.service-now.com)')
        .then(function (host) {
            self.appConfig.host = host;
            return self.showInputBox('Username');
        })
        .then(function (username) {
            self.appConfig.username = username;
            return self.showInputBox('Password');
        })
        .then(function (password) {
            self.appConfig.password = password;

            self.appConfig.sncmder = true;
            self.createStatusBarIndicator(self.appConfig.host);
            return jsonfile.writeFile(path.join(self.appConfig.rootpath, 'config.json'), self.appConfig);
        })
        .then(function () {
            if (!self.appConfig.host || !self.appConfig.username || !self.appConfig.password) {
                self.vscode.window.showErrorMessage('Please provide all parameters!');
                return;
            }
            self.buildDatabase();
        });
};
sncmder.prototype.PullRecord = function () {
    var self = this;
    var quickPickRecordTypes = self.getQuickPickRecordTypes();
    var selectedType = null;

    self.showQuickPick(quickPickRecordTypes)
        .then(function (selected) {
            if (!selected) return;

            selectedType = selected;
            var recordType = recordTypes[selected];
            var quickPickData = jsonfile.readFileSync(path.join(self.appConfig.databasepath, recordType.table + '.json'));

            return self.showQuickPick(quickPickData);
        })
        .then(function (selected) {
            if (!selected) return;

            var $sn = self.getRestClient(self.appConfig);
            $sn(selected.table).getRecord(selected.sys_id).then(rec => {
                var rt = recordTypes[selected.recordType];

                var syncDirectory = self.getWritePath(rt.subDirPattern, rec, selectedType);
                shell.mkdir('-p', syncDirectory);

                var openThis = [];
                for (var field in rt.fields) {
                    var content = rec[rt.fields[field]];
                    if(!content) content = "";
                    if(selected.label.indexOf(' ') >= 0) {
                        selected.label = selected.label.toLowerCase().replace(/ /g, "_");
                    }
                    var filePath = path.join(syncDirectory, selected.label + '.' + field);
                    openThis.push(filePath);
                    fs.writeFileSync(filePath, content, 'utf8');
                    self.writeToMeta(filePath, selected.sys_id, selected.table, rt.fields[field]);
                }
                self.outputChannel.show(true);
                for (var i = 0; i < openThis.length; i++) {
                    self.outputChannel.appendLine("Successfully pulled " + path.basename(openThis[i]));
                    // var openPath = self.vscode.Uri.file(openThis[i]);
                    // self.vscode.workspace.openTextDocument(openPath).then(doc => {
                    //     self.vscode.window.showTextDocument(doc);
                    // });
                }
            });
        });
};
sncmder.prototype.PushRecord = function () {
    var self = this;
    var $sn = this.getRestClient(this.appConfig);

    var filepath = this.vscode.window.activeTextEditor._documentData._uri.fsPath;
    var meta = this.getMetaFromPath(filepath);
    var obj = {
        sys_id: meta.sys_id
    };
    obj[meta.field] = fs.readFileSync(filepath, 'utf8');
    $sn(meta.table).updateRecord(obj).then(function() {
        self.outputChannel.show(true);
        self.outputChannel.appendLine("Successfully pushed [" + path.basename(filepath) + "]");
    });
};
module.exports = new sncmder();