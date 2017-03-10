/***
 * Generate photo pack
 * npm run photopack --config=C:/temp/pack2017.json
 * 
 * gravity : NorthWest, North, NorthEast, West, Center, East, SouthWest, South, SouthEast
 */
const _moment = require("moment");
const _path = require("path");
const _argv = require("yargs").argv;
const _gm = require("gm");
const _fs = require("fs");
const _cmd = require("child_process").exec;

const jsext = require(ROOT_DIR + "/jsext");
const mediaext = require(ROOT_DIR + "/mediaext");
const ProcessProgress = require(ROOT_DIR + "/processprogress");

module.exports = PhotoPack = {};

PhotoPack.ERROR = {
    INPUTFILE : "Missing input config file to generate packs",
    INPUTFILE_EXISTS : "Can not found the specified inputfile",
    CONFIGFILE : "Config file error",
    PARAMS : "Missing required params",
    GENPARAMS : "Missing required params to generate photo",
    OBJECTINSTANCE : "Missing object instance",
    ORIGINALPATH_NOTFOUND : "Can not found the specified original path directory",
    INPUTDIREMPTY : "Can not found any photos into the original path",
    MISSINGPACKS : "Missing pack config",
    NOPHOTOS : "Zero photos to generate",
    WATERMARKCONFIG : "Missing watermark config",
    IMPROCCESS : "Error in image processing"
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

    if(!jsext.fileExists(self.configfile))
        return e(PhotoPack.ERROR.INPUTFILE_EXISTS, self.configfile);

    self.packconfig = jsext.loadJsonFile(self.configfile);
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

            if(err || !mediainfo || !mediainfo.id) {
                stockError(self, file, "original", "*", err || "Info read");
            } else {
                mediainfo.filename = fileinput;
                mediainfo.path = self.packconfig.originaldir;
                mediainfo.lastscrap = Date.now();
                self.photoinfo[mediainfo.id] = mediainfo;
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

    var filteredPhotos = jsext.filterObject(photos, function(photoid, photoinfo) {
        return validCriteria(photoinfo, logic1, criteria1, logic2, criteria2);
    });
    return filteredPhotos;
}

function validCriteria (photo, logic1, criteria1, logic2, criteria2) {
    if(!photo)
        return false;

    logic1 = logic1 && logic1.toLowerCase() || "or";
    logic2 = logic2 && logic2.toLowerCase() || "or";

    var criteria1Keys = Object.keys(criteria1);
    var resp1 = (!criteria1 || !criteria1Keys.length) ? true : criteria1Keys.reduce(function(resp, criteria, index) {
        if(logic1 == "and") {
            resp = resp && validCriteriaItem(photo, criteria, criteria1[criteria]);
        } else if( logic1 == "or") {
            resp = resp || validCriteriaItem(photo, criteria);
        }
        return resp;
    }, logic1 == "and" ? true : false);

    var criteria2Keys = Object.keys(criteria2);
    var resp2 = (!criteria2 || !criteria2Keys.length) ? true : criteria2.reduce(function(resp, criteria, index) {
        if(logic2 == "and") {
            resp = resp && validCriteriaItem(photo, criteria, criteria2[criteria]);
        } else if(logic2 == "or") {
            resp = resp || validCriteriaItem(photo, criteria, criteria2[criteria]);
        }
        return resp;
    }, logic2 == "and" ? true : false);

    return resp1 && resp2;
}

function validCriteriaItem (photo, criteria, criteriaValue) {
    if(!photo)
        return false;

    if(criteria == undefined || criteriaValue == undefined)
        return true;

    var photoCriteria = photo[criteria];
    if(!photoCriteria)
        return false;

    switch(criteriaValue) {
        case("tags") : 
            return hasAnyCriteria(photoCriteria, criteriaValue);
        case("authorrating") : 
            return hasAnyValue(photoCriteria, criteriaValue);
        default:
            return false;
    }
}

function hasAnyCriteria (props, search) {
    if(Array.isArray(search)) {
        return search.reduce(function(any, p) {
            any = any || props.indexOf(p) >= 0;
            return any;
        }, false);
    } else {
        return props.indexOf(search) >= 0;
    }
}

function hasAnyValue (prop, search) {
    if(Array.isArray(search)) {
        return search.reduce(function(any, p) {
            any = any || prop == p;
            return any;
        }, false);
    } else {
        return prop == search;
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
    var packNames = Object.keys(self.packconfig.packs);
    if(!packNames || !packNames.length)
        return response(self, callback);

    packNames.forEach(function(pack, pIndex) {
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

    destination += "." + photoInfo.type || "jpg";
    mediaext.generateVersion(photoInfo.filename, formatConfig, destination, function(err, info) {
        if(err) return response(self, callback, e(err, info));

        console.log("PHOTOPACK: photo version ", destination);
        var errors = processWatermarks(self, destination, formatConfig.watermarks, function(errors) {
            return response(self, callback, errors);
        });
    });
}

function processWatermarks (self, image, watermarks, callback, index, errors) {
    var errors = [];
    var index = 0;
    var processNext = function() {
        if(!watermarks || !watermarks.length || index >= watermarks.length)
            return callback && callback(errors.length && errors);

        stumpWatermark(self, image, watermarks, index)
        .then(function(success, error) {
            if(error) errors.push(error);

            if(error || ++index == watermarks.length)
                return callback && callback(errors.length && errors);

            processNext();
        });
    };
    processNext();
}

function stumpWatermark (self, image, watermarks, index) {
    return new Promise(function (resolve, reject) {
        index = index || 0;
        if(!self) 
            return reject(e(PhotoPack.ERROR.OBJECTINSTANCE));

        if(!image) 
            return reject(e(PhotoPack.ERROR.PARAMS, "image"));

        var im = self.packconfig.im;
        if(!im)
            return reject(e(PhotoPack.ERROR.WATERMARKCONFIG));

        if(!watermarks || !watermarks.length || index >= watermarks.length)
            return reject(e(PhotoPack.ERROR.WATERMARKCONFIG));

        var watermark = watermarks[index];
        var watermarkConfig = watermark && self.packconfig.watermarks[watermark];
        if(!watermarkConfig)
            return reject(e(PhotoPack.ERROR.WATERMARKCONFIG, watermark));

        if(!watermarkConfig.img && !watermarkConfig.text)
            return resolve(image);

        console.log("PHOTOPACK: stumping watermark " + watermark + " on " + image + "...");
        var command = im ? im : "magick";
        var commandargs = watermarkConfig.img ? buildWatermarkImageCommand(image, watermarkConfig) : buildWatermarkTextCommand(image, watermarkConfig);
        //console.log("PHOTOPACK: command : ", command, commandargs);
        var composite = _cmd(command + " " + commandargs);

        composite.stdout.on('data',function(data) {
            console.log("PHOTOPACK: watermark error", data);
            //return reject(e(PhotoPack.ERROR.IMPROCCESS, data));
        });

        composite.stderr.on('data',function(data) {
            console.log("PHOTOPACK: watermark error", data);
            //return reject(e(PhotoPack.ERROR.IMPROCCESS, data));
        });

        composite.on('close',function(code) {
            if(code != 0){
                console.log("PHOTOPACK: watermark process error :", code);
                return reject(e(PhotoPack.ERROR.IMPROCCESS, code));
            } else {
                console.log("PHOTOPACK: watermark process success");
                return resolve(image);
            }
        });
    });
}

function buildWatermarkImageCommand (image, watermarkConfig) {
    if(!watermarkConfig || !watermarkConfig.img)
        return;

    var offsetx = watermarkConfig.x || 0;
    var offsety = watermarkConfig.y || 0;
    var w = watermarkConfig.w || 0;
    var h = watermarkConfig.h || 0;
    var gravity = watermarkConfig.gravity || "southeast";
    var dissolve = watermarkConfig.dissolve || 50;
    var geometry = watermarkConfig.img ? "-geometry " + w + "x" + h + "+" + offsetx + "+" + offsety : "";

    var args = [
        "convert"
        , image
        , watermarkConfig.img
        , (gravity ? "-gravity " + gravity : "")
        , geometry
        , "-compose"
        , dissolve ? "dissolve -define compose:args=" + dissolve + ",100" : ""
        , "-composite "
        , image
    ];
    return args.join(" ");
}

function buildWatermarkTextCommand (image, watermarkConfig) {
    if(!watermarkConfig || !watermarkConfig.text)
        return;

    var offsetx = watermarkConfig.x || 0;
    var offsety = watermarkConfig.y || 0;
    var w = watermarkConfig.w || 0;
    var h = watermarkConfig.h || 0;
    var gravity = watermarkConfig.gravity || "southeast";
    var fonttype = watermarkConfig.fonttype ? "-font '" + watermarkConfig.fonttype + "'" : "";
    var fontsizeValue = watermarkConfig.fontsize || 35;
    var fontsize = "-pointsize " + fontsizeValue + " -kerning 1 -size " + w + "x" + h + " xc:none";
    var dissolve = watermarkConfig.dissolve || 50;
    var preOptions = "-stroke black -strokewidth 2 -annotate 0 '" + watermarkConfig.text + "' \
          -background none -shadow 60x3+0+0 +repage \
          -stroke none -fill white -annotate +2+5 '" + watermarkConfig.text + "'";
    var postOptions = "+swap -gravity " + gravity + " -geometry +" + offsetx + "+" + offsety;
    var args = [
        "convert"
        , fonttype
        , fontsize
        , (gravity ? "-gravity " + gravity : "")
        , preOptions
        , image
        , postOptions
        , "-compose"
        , dissolve ? "dissolve -define compose:args=" + dissolve + ",100" : ""
        , "-composite "
        , image
    ];
    return args.join(" ");
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
    if(!self || !self.packconfig) return;
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