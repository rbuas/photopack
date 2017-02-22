var _querystring = require("querystring");
var _fs = require("fs");
var _path = require("path");

module.exports = JsExt = {};

// JS Type Extensions

if (!Function.prototype.extends) {
    Function.prototype.extends = function(ParentClass) {
        if(ParentClass.constructor == Function) {
            this.prototype = new ParentClass;
            this.prototype.constructor = this;
            this.prototype.parent = ParentClass.prototype;
        } else {
            this.prototype = ParentClass;
            this.prototype.constructor = this;
            this.prototype.parent = ParentClass;
        }
    }
}

if (!RegExp.escape) {
    RegExp.escape = function(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    };
}

if (!Array.prototype.unique) {
    Array.prototype.unique = function() {
        var a = this.concat();
        for(var i=0; i<a.length; ++i) {
            for(var j=i+1; j<a.length; ++j) {
                if(a[i] === a[j])
                    a.splice(j--, 1);
            }
        }
        return a;
    };
}

if (!Array.prototype.removeArray) {
    Array.prototype.removeArray = function(killer) {
        var a = this.concat();
        for(var i=0; i<killer.length; ++i) {
            var val = killer[i];
            var index = a.indexOf(val);
            if(index >= 0) {
                a.splice(index, 1);
            }
        }
        return a;
    };
}

if (!String.prototype.trim) {
    String.prototype.trim = function () {
        return this.replace(/^\s+|\s+$/g, "");
    }
}

if (!String.prototype.format) {
    String.prototype.format = function() {
        var str = this.toString();
        if (!arguments.length)
            return str;
        var args = typeof arguments[0],
            args = (("string" == args || "number" == args) ? arguments : arguments[0]);
        for (arg in args)
            str = str.replace(RegExp("\\{" + arg + "\\}", "gi"), args[arg]);
        return str;
    }
}

// Extension's functions

JsExt.filterObject = function(obj, callback) {
    if(!obj)
        throw new Error("Missing object instance");
    if (typeof callback != "function")
        throw new Error("Function type");

    var response = {};
    Object.keys(obj).forEach(function(key) {
        var elem = obj[key];
        if(callback(key, elem)) response[key] = elem;
    });
    return response;
}

JsExt.getObjectValues = function (dataObject) {
    if(!dataObject)
        return;
    var dataArray = Object.keys(dataObject).map(function(k){return dataObject[k]});
    return dataArray;
}

JsExt.formatObject = function (input, format) {
    if(!input || !format)
        return input;

    var output = {};
    for(var outformat in format) {
        if(!format.hasOwnProperty(outformat)) continue;

        var informat = format[outformat];
        var value = JsExt.getObjectDeepValue(input, informat);
        JsExt.setObjectDeepValue(output, outformat, value);
    }
    return output;
}

JsExt.setObjectDeepValue = function (obj, path, value, separator) {
    if(!obj || !path)
        return;

    separator = separator || ".";
    var parts = path.split(separator);
    if (parts.length == 1) {
        obj[parts[0]] = value;
        return;
    }

    var subpath = parts.slice(1).join(separator);
    var firstkey = parts[0];
    obj[firstkey] = {};
    JsExt.setObjectDeepValue(obj[firstkey], subpath, value, separator);
}

JsExt.getObjectDeepValue = function (obj, path, separator) {
    if(!obj || !path)
        return obj;

    separator = separator || ".";
    var parts = path.split(separator);
    if (parts.length == 1)
        return obj[parts[0]];

    var subpath = parts.slice(1).join(separator);
    var firstkey = parts[0];
    return JsExt.getObjectDeepValue(obj[firstkey], subpath);
}

JsExt.serializeDictionary = function (obj, connector) {
    if(!obj)
        return;

    connector = connector || ",";
    var builder = [];
    for (var i in obj) {
        if (!obj.hasOwnProperty(i) || typeof(i) === 'function') continue;

        builder.push(i + "=" + obj[i]);
    }
    return builder.join(connector);
}

JsExt.buildUrl = function (link, params, starter) {
    var serializedParams = typeof(params) == "string" ? params : _querystring.stringify(params);
    var url = link || "";
    if(serializedParams) {
        starter = starter || "?";
        if(url.indexOf(starter) < 0) {
            url += starter + serializedParams;
        } else {
            url = url.endsWith("&") ? url + serializedParams : url + "&" + serializedParams;
        }
    }

    return url;
}

JsExt.first = function(obj) {
    for (var i in obj) {
        if (!obj.hasOwnProperty(i) || typeof(i) === 'function') continue;

        return obj[i];
    }
}

JsExt.loadJsonFile = function(file) {
    if(!file)
        return;

    var filecontent = _fs.readFileSync(file, 'utf8');
    if(!filecontent)
        return;

    var fileobject = JSON.parse(filecontent);
    if(!fileobject)
        return;

    return fileobject;
}

JsExt.isDir = function (path) {
    if(!path)
        return false;

    if(!_fs.existsSync(path))
        return false;

    var dirstats = _fs.statSync(path);
    if(!dirstats || !dirstats.isDirectory())
        return false;

    return true;
}

JsExt.listDir = function (path, extfilter) {
    path = path && _path.normalize(path);
    if(!path)
        return;

    extfilter = extfilter || [];
    if(typeof(extfilter) == "string") extfilter = [extfilter];

    if(!JsExt.isDir(path))
        return;

    var files = _fs.readdirSync(path);
    if(!files || !extfilter)
        return files;

    files = files.filter(function (file) {
        var fullfile = path + "/" + file;
        var stats = _fs.statSync(fullfile);
        if(!stats.isFile())
            return false;

        var extension = _path.extname(fullfile || "");
        extension = extension.replace(".", "");
        var inFilter = extfilter.indexOf(extension.toUpperCase()) >= 0 || extfilter.indexOf(extension.toLowerCase()) >= 0;
        return inFilter;
    });
    return files;
}

JsExt.mkdirSync = function (dir) {
    dir = _path.normalize(dir);
    try {
        _fs.mkdirSync(dir);
    } catch(e) {
        if ( e.code != 'EEXIST' ) throw e;
    }
}

JsExt.mkdirRecursive = function (dir) {
    dir = _path.normalize(dir);
    var parts = dir.split(_path.sep);
    if(!parts || !parts.length)
        return;

    var starter = "";

    //traitement for mac or linux paths
    if(!parts[0]) {
        parts.shift();
        starter = _path.sep;
    }
    for( var i = 1; i <= parts.length; i++ ) {
        var partial = parts.slice(0, i);
        var partialPath = starter + _path.join.apply(null, partial);
        JsExt.mkdirSync( partialPath );
    }
}

JsExt.listSubdir = function (path) {
    if(!path)
        return;

    if(!JsExt.isDir(path))
        return;

    var files = _fs.readdirSync(path);
    if(!files)
        return;

    files = files.filter(function (file) {
        var fullfile = path + "/" + file;
        var stats = _fs.statSync(fullfile);
        return !stats.isFile();
    });
    return files;
}

JsExt.fileToBuffer = function (filename, bufferlimit) {
    bufferlimit = bufferlimit || 1048576;
    return new Promise(function (resolve, reject) {
        _fs.open(filename, 'r', function (err, fd) {
            if (err) reject(err);
            else {
                var buffer = new Buffer(bufferlimit);
                _fs.read(fd, buffer, 0, bufferlimit, 0, function (err, bytesRead, buffer) {
                    if (err) reject(err);
                    else resolve(buffer);
                });
            }
        });
    });
}

JsExt.extractFromFile = function (filename, markBegin, markEnd, bufferlimit) {
    return new Promise( function (resolve, reject) {
        JsExt.fileToBuffer(filename, bufferlimit)
            .then(function (buffer) {
                if (!Buffer.isBuffer(buffer)) {
                    reject("input is not a buffer");
                    return;
                }
                var data = {raw: {}};
                var offsetBegin = buffer.indexOf(markBegin);
                var offsetEnd = buffer.indexOf(markEnd);
                var extractBuffer = offsetBegin && offsetEnd && buffer.slice(offsetBegin, offsetEnd + markEnd.length);
                var extract = extractBuffer && extractBuffer.toString("utf-8", 0, extractBuffer.length);
                resolve(extract);
            });
    });
}
