/***
 * Generate photo pack
 * npm run photopack --config=C:/temp/pack2017.json
 * 
 * gravity : north, northeast, east, southeast, south, southwest, west, northwest, center and centre
 */
var _moment = require("moment");
var _path = require("path");
var _argv = require("yargs").argv;
var _gm = require("gm");

var jsext = require(ROOT_DIR + "/jsext");
var mediaext = require(ROOT_DIR + "/mediaext");
var ProcessProgress = require(ROOT_DIR + "/processprogress");

module.exports = PhotoPack = {};

PhotoPack.ERROR = {
    INPUTFILE : "Missing input config file to generate packs",
    CONFIGFILE : "Config file error",
    PARAMS : "Missing required params",
    GENPARAMS : "Missing required params to generate photo",
    OBJECTINSTANCE : "Missing object instance",
    ORIGINALPATH_NOTFOUND : "Can not found the specified original path directory",
    INPUTDIREMPTY : "Can not found any photos into the original path",
    MISSINGPACKS : "Missing pack config",
    NOPHOTOS : "Zero photos to generate"
};

PhotoPack.READEDFILES = ["jpg"];

PhotoPack.DEFAULTOPTIONS = {
    originaldir : "",
    outputdir : "",
    basepath : "",
    readedfiles : PhotoPack.READEDFILES,
    exportindex : "index.json",
    jsonspace : 3,
    start : function(self) {
        console.log("PHOTOPACK::start generate packs");
    },
    finish : function(self, resp) {
        console.log("PHOTOPACK::finish generate packs");
        console.log("PHOTPACK::SUCCESS: ", self.logsuccess);
        console.log("PHOTPACK::ERROR: ", self.logerror);
        logToFile(self, {success:self.logsuccess, error:self.logerror});
    }
};

PhotoPack.GeneratePacks = function (options) {
    var self = this;
    self.options = Object.assign({}, PhotoPack.DEFAULTOPTIONS, options);

    self.pp = new ProcessProgress();

    self.photoinfo = {};
    self.logerror = [];
    self.logsuccess = [];

    callinfo(self, self.options.start);

    self.pp.startProcess("config", "Read photopack config");
    var errorConfig = readConfig(self);
    self.pp.endProcess("config");
    if(errorConfig) return callinfo(self, self.options.finish);

    self.pp.startProcess("photolist", "Read photos list from basepath/originaldir");
    var errorList = readPhotoList(self);
    self.pp.endProcess("photolist");
    if(errorList) return callinfo(self, self.options.finish);

    self.pp.startProcess("photoinfo", "Read photos infos from basepath/originaldir");
    readPhotosInfo(self, function(error) {
        self.pp.endProcess("photoinfo");

        self.pp.startProcess("exportindex", "Export photo index to basepath/index.json");
        exportPhotoIndex(self);
        self.pp.endProcess("exportindex");

        self.pp.startProcess("packlist", "Prepare pack lists");
        preparePackList(self);
        self.pp.endProcess("packlist");

        self.pp.startProcess("photogeneration", "Generate photos into pack in formats");
        generatePackList(self, function(error) {
            self.pp.endProcess("photogeneration");
            return callinfo(self, self.options.finish, error);
        });
    });
}



// PRIVATE FUNCTIONS

function e (error, ext) {
    if(ext != undefined)
        console.log(error, ext);
    else
        console.log(error)
    return error;
}

function response (self, callback, resp) {
    if(callback) callback(resp);
}

function callinfo (self, callback, info) {
    if(callback) callback(self, info);
}

function readConfig (self) {
    if(!self)
        return e(PhotoPack.ERROR.OBJECTINSTANCE);

    self.configfile = _argv && _argv._ && _argv._[0] || _argv.config;
    if (!self.configfile)
        return e(PhotoPack.ERROR.INPUTFILE);

    self.packconfig = require(self.configfile);
    if(!validateConfig(self.packconfig))
        return e(PhotoPack.ERROR.CONFIGFILE);
}

function validateConfig (config) {
    if(!config || !config.basepath || !config.packs || !config.formats)
        return false;

    return true;
}

function readPhotoList (self) {
    if(!self)
        return e(PhotoPack.ERROR.OBJECTINSTANCE);

    // read photo infos from photos in pathoriginal
    var originalpath = _path.normalize(_path.join(self.packconfig.basepath, self.packconfig.originaldir));
    if(!jsext.isDir(originalpath))
        return e(PhotoPack.ERROR.ORIGINALPATH_NOTFOUND, originalpath);

    var files = jsext.listDir(originalpath, self.options.readedfiles);
    if(!files || files.length == 0)
        return e(PhotoPack.ERROR.INPUTDIREMPTY);

    self.originalphotos = files;
}

function readPhotosInfo (self, callback) {
    if(!self)
        return response(self, callback, e(PhotoPack.ERROR.OBJECTINSTANCE));

    self.pp.startIterations("photoinfo", self.originalphotos.length);
    var pending = self.originalphotos.length;
    if(!pending)
        return response(self, callback, e(PhotoPack.ERROR.INPUTDIREMPTY));

    self.originalphotos.forEach(function(file, index, arr) {
        var fileinput = _path.normalize(_path.join(self.packconfig.basepath, self.packconfig.originaldir, file));
        mediaext.readFile(fileinput, function(err, mediainfo) {
            --pending;

            if(err || !mediainfo) {
                stockError(self, file, "original", "*", err || "Info read");
            } else {
                mediainfo.filename = fileinput;
                mediainfo.path = self.packconfig.originaldir;
                mediainfo.lastscrap = Date.now();
                self.photoinfo[file] = mediainfo;
            }
            self.pp.nextIteration("photoinfo");

            if(pending <= 0) {
                self.pp.endIteration("photoinfo");
                return response(self, callback);
            }
        });
    });
}

function preparePackList (self) {
    if(!self)
        return e(PhotoPack.ERROR.OBJECTINSTANCE);

    var outPhotoCount = 0;
    var listcount = Object.keys(self.packconfig.packs).length * Object.keys(self.packconfig.formats).length;
    self.pp.startIterations("packlist", listcount);
    Object.keys(self.packconfig.packs).forEach(function(pack, pIndex) {
        var packConfig = self.packconfig.packs[pack];
        packConfig.outlist = {};
        Object.keys(self.packconfig.formats).forEach(function(format, fIndex) {
            var formatConfig = self.packconfig.formats[format];

            //TRACE console.log("PHOTOPACK::filterphotos to ", pack, "in format", format, packConfig.criteria, formatConfig.criteria);
            var outlist = filterPhotos(self.photoinfo, packConfig.criterialogic, packConfig.criteria, formatConfig.criterialogic, formatConfig.criteria);
            var outlistIds = outlist && Object.keys(outlist);
            //TRACE console.log("PHOTOPACK::outlist", outlistIds);

            if(outlistIds && outlistIds.length) {
                packConfig.outlist[format] = outlistIds;
                outPhotoCount += outlistIds && outlistIds.length;
            }
            
            self.pp.nextIteration("packlist");
        });
    });
    self.pp.endIteration("packlist");

    self.outPhotoCount = outPhotoCount;
}

function filterPhotos (photos, logic1, criteria1, logic2, criteria2) {
    if(!photos)
        return [];
    
    if((!criteria1 || !criteria1.length) && (!criteria2 || !criteria2.length))
        return photos;

    return jsext.filterObject(photos, function(photoid, photoinfo) {
        return validCriteria(photoinfo, logic1, criteria1, logic2, criteria2);
    });
}

function validCriteria (photo, logic1, criteria1, logic2, criteria2) {
    if(!photo)
        return false;

    logic1 = logic1 && logic1.toLowerCase() || "or";
    logic2 = logic2 && logic2.toLowerCase() || "or";
    if(!criteria1 || !criteria2)
        return true;
    
    var resp1 = criteria1.reduce(function(resp, criteria, index) {
        if(logic1 == "and") {
            resp = resp && validCriteriaItem(photo, criteria);
        } else if( logic1 == "or") {
            resp = resp || validCriteriaItem(photo, criteria);
        }
        return resp;
    }, logic1 == "and" ? true : false);

    var resp2 = criteria2.reduce(function(resp, criteria, index) {
        if(logic2 == "and") {
            resp = resp && validCriteriaItem(photo, criteria);
        } else if(logic2 == "or") {
            resp = resp || validCriteriaItem(photo, criteria);
        }
        return resp;
    }, logic2 == "and" ? true : false);

    return resp1 && resp2;
}

function validCriteriaItem (photo, criteria) {
    if(!photo)
        return false;

    if(!criteria || !criteria.key || criteria.value == undefined)
        return true;

    var photoCriteria = photo[criteria.key];
    if(!photoCriteria)
        return false;

    switch(criteria.key) {
        case("tags") : 
            return photoCriteria.indexOf(criteria.value) >= 0;
        case("authorrating") : 
            return photoCriteria == criteria.value;
        default:
            return false;
    }
}

function generatePackList (self, callback) {
    if(!self)
        return response(self, callback, e(PhotoPack.ERROR.OBJECTINSTANCE));

    if(!self.packconfig || !self.packconfig.packs)
        return response(self, callback, e(PhotoPack.ERROR.MISSINGPACKS));

    if(!self.outPhotoCount)
        return response(self, callback);

    self.pp.startIterations("photogeneration", self.outPhotoCount);
    var pending = self.outPhotoCount;
    Object.keys(self.packconfig.packs).forEach(function(pack, pIndex) {
        var packConfig = self.packconfig.packs[pack];
        if(!packConfig || !packConfig.outlist)
            return;

        //create directory util here
        var packDir = _path.join(self.packconfig.basepath, self.packconfig.outputdir, pack);
        jsext.mkdirRecursive(packDir);

        Object.keys(packConfig.outlist).forEach(function(format, fIndex) {
            var formatConfig = self.packconfig.formats[format];
            var outlist = packConfig.outlist[format];
            if(!formatConfig || !outlist)
                return;

            //create pack/format directory
            var outDir = _path.join(packDir, format);
            jsext.mkdirSync(outDir);

            outlist.forEach(function(photo, index) {
                var destination = _path.join(outDir, photo);
                generatePhoto(self, photo, pack, format, destination, function(error) {
                    if(error) {
                        stockError(self, photo, pack, format, error);
                    } else {
                        stockSuccess(self, photo, pack, format);
                    }
                    self.pp.nextIteration("photogeneration");
                    if(--pending <= 0) {
                        self.pp.endIteration("photogeneration");
                        response(self, callback);
                    }
                });
            });
        });
    });
}

function generatePhoto (self, photo, pack, format, destination, callback) {
    if(!self)
        return response(self, callback, e(PhotoPack.ERROR.OBJECTINSTANCE));

    var formatConfig = self.packconfig.formats[format];
    var packConfig = self.packconfig.packs[pack];
    var photoInfo = self.photoinfo[photo];
    if(!photoInfo || !formatConfig || !packConfig)
        return response(self, callback, e(PhotoPack.ERROR.GENPARAMS));

    mediaext.generateVersion(photoInfo.filename, formatConfig, destination, function(err, info) {
        if(err) return response(self, callback, e(err, info));

        if(formatConfig.watermarks) {
            var errors = [];
            formatConfig.watermarks.forEach(function(watermark, index) {
                var watermarkConfig = self.packconfig.watermarks[watermark];
                if(!watermarkConfig) return response(self, callback, e("watermark " + watermark + "not found"));

                stumpWatermark(destination, watermarkConfig, function (err) {
                    if(err) errors.push(err);
                });
            });
            if(errors.length) return response(self, callback, e(err, destination));
        }

        return response(self, callback, null);
    });
}

function stumpWatermark (destination, watermarkConfig, callback) {
    if(!destination || !watermarkConfig)
        return;

    if(watermarkConfig.img) {
        var offsetx = watermarkConfig.x || 0;
        var offsety = watermarkConfig.y || 0;
        var w = watermarkConfig.w || 0;
        var h = watermarkConfig.h || 0;
        var gravity = watermarkConfig.gravity || "SouthEast";
        var wmCommand = 'image Over ' + offsetx + ',' + offsety + ' ' + w + ',' + h + ' -dissolve 25% "' + watermarkConfig.img + '"';

        _gm(destination)
        .gravity(gravity)
        .draw([wmCommand])
        .write(destination, callback);
    } else if (watermarkConfig.text) {
        //TODO
    }
}

function stockError (self, photo, pack, format, error) {
    if(!self || !self.logerror)
        return;

    self.logerror.push({o:photo, p:pack, f:format, e:error});
}

function stockSuccess (self, photo, pack, format) {
    if(!self || !self.logsuccess)
        return;

    self.logsuccess.push({o:photo, p:pack, f:format});
}

function logToFile (self, obj) {
    var now = _moment().format("YYYYMMDDhhmmss");
    var filename = _path.join(self.packconfig.basepath, now) + ".log";
    jsext.saveJsonFile(filename, obj, self.options.jsonspace);
}

function exportPhotoIndex (self) {
    if(!self || !self.options || !self.options.exportindex || !self.photoinfo)
        return;

    var filename = _path.join(self.packconfig.basepath, self.options.exportindex);
    jsext.removeFile(filename);
    jsext.saveJsonFile(filename, self.photoinfo, self.options.jsonspace);
}