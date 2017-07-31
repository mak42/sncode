var request = require('request');
var querystring = require('querystring');

function SnRestClient(config) {

    function validateResponse(error, response, body) {
        if(error) return error;
        if(response.statusCode != 200) return body;

        var obj = JSON.parse(body);
        if(obj.error) return obj.error;
        if(obj.records) {
            var errors = [];
            for(var i in obj.records) {
                if(i.__error) errors.push(i.__error);
            }
            if(errors.length > 0) {
                return errors;
            }
        }
        return null;
    }

    function restCallbackHandler(error, response, body) {
        var valError = validateResponse(error, response, body);
        if(valError) {
            return { error: valError, result: null };
        }
        var resultArray = [];
        var resultObj = JSON.parse(body);
        for(var i = 0; i < resultObj.records.length; i++) {
            var record = resultObj.records[i];
            resultArray.push(record);
        }
        return { error: null, records: resultArray };
    }

    var returnFunc = function(table) {
        return {
            config: config,
            baseUrl: (function() {
                var protocol = 'https';
                return protocol + '://' +
                config.host + '/' + table + '.do?JSONv2=&';
            })(),
            request: request.defaults({
                //proxy: 'http://192.168.1.1:3128',
                auth: {
                    user: config.user,
                    pass: config.pass,
                    sendImmediately: true
                },
                headers: {
                    'Content-Type': 'application/json',
                    'Accepts': 'application/json'
                }
            }),
            getKeys: function(query) {
                var self = this;
                var params = querystring.stringify({
                    "sysparm_action": "getKeys",
                    "sysparm_query" : query
                });
                return new Promise((resolve, reject) => {
                    self.request.get(self.baseUrl + params, (error, response, body) => {
                        var result = restCallbackHandler(error, response, body);
                        if(error !== null) reject(error);
                        resolve(result.records);
                    });
                });
            },
            getRecord: function(sysId) {
                var self = this;
                var params = querystring.stringify({
                    "sysparm_action": "get",
                    "sysparm_sys_id" : sysId
                });
                return new Promise((resolve, reject) => {
                    self.request.get(self.baseUrl + params, (error, response, body) => {
                        var result = restCallbackHandler(error, response, body);
                        if(error !== null) reject(error);
                        resolve(result.records[0]);
                    });
                });
            },
            getRecords: function(query) {
                var self = this;
                if(!query) query = '';
                var params = querystring.stringify({
                    "sysparm_action": "getRecords",
                    "sysparm_query": query
                });
                return new Promise((resolve, reject) => {
                    self.request.get(self.baseUrl + params, (error, response, body) => {
                        var result = restCallbackHandler(error, response, body);
                        if(error !== null) reject(error);
                        resolve(result.records);
                    });
                });
            },
            updateRecord: function(object) {
                var self = this;
                var params = querystring.stringify({
                    "sysparm_action": "update",
                    "sysparm_query" : "sys_id=" + object.sys_id
                });
                var opts = {
                    body: JSON.stringify(object)
                };
                return new Promise((resolve, reject) => {
                    self.request.post(self.baseUrl + params, opts, (error, response, body) => {
                        var result = restCallbackHandler(error, response, body);
                        if(error !== null) reject(error);
                        resolve(result.records);
                    });
                });
            },
            insertRecord: function(object) {
                var self = this;
                var params = querystring.stringify({
                    "sysparm_action": "insert"
                });
                var opts = {
                    body: JSON.stringify(object)
                };
                return new Promise((resolve, reject) => {
                    self.request.post(self.baseUrl + params, opts, (error, response, body) => {
                        var result = restCallbackHandler(error, response, body);
                        if(error !== null) reject(error);
                        resolve(result.records);
                    });
                });
            }
        };
    };
    return returnFunc;
}
module.exports = SnRestClient;