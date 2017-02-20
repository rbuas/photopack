/***
 * Generate photo pack
 * npm run photopack --config=C:/temp/pack2017.json
 */
var _moment = require("moment");
var _path = require("path");
var _argv = require("yargs").argv;

var jsext = require(ROOT_DIR + "/jsext");
var mediaext = require(ROOT_DIR + "/mediaext");
var ProcessProgress = require(ROOT_DIR + "/processprogress");

module.exports = PhotoPack = {};

PhotoPack.ERROR = {
    INPUTFILE : "Missing input config file to generate packs",
    CONFIGFILE : "Config file error",
    PARAMS : "Missing required params",
    OBJECTINSTANCE : "Missing object instance",
    ORIGINALPATH_NOTFOUND : "Can not found the specified original path directory",
    INPUTDIREMPTY : "Can not found any photos into the original path",
    MISSINGPACKS : "Missing pack config"
};

PhotoPack.READEDFILES = ["jpg"];

PhotoPack.DEFAULTOPTIONS = {
    originaldir : "",
    basepath : "",
    readedfiles : PhotoPack.READEDFILES,
    watch : function(event, info, stack) {
        console.log("PHOTOPACK::", event, info);
    }
};

PhotoPack.GeneratePacks = function (options) {
    var self = this;
    self.options = Object.assign({}, PhotoPack.DEFAULTOPTIONS, options);

    self.pp = new ProcessProgress({watch : self.options.watch});

    self.pp.startProcess("config", "Read photopack config");
    var errorConfig = readConfig(self);
    self.pp.endProcess("config");
    if(errorConfig) return finishGeneration(self);

    self.pp.startProcess("photolist", "Read photos list from basepath/originaldir");
    var errorList = readPhotoList(self);
    self.pp.endProcess("photolist");
    if(errorList) return finishGeneration(self);

    self.pp.startProcess("photoinfo", "Read photos infos from basepath/originaldir");
    readPhotosInfo(self, function(resp) {
        self.pp.endProcess("photoinfo");

        self.pp.startProcess("packlist", "Prepare pack lists");
        preparePackList(self);
        self.pp.endProcess("packlist");

        self.pp.startProcess("photogeneration", "Generate photos into pack in formats");
        generatePackList(self, function(resp) {
            //TOKEN
            self.pp.endProcess("photogeneration");
        });
    });
}



// PRIVATE FUNCTIONS

function e (error, ext) {
    console.log(error, ext);
    return error;
}

function response (self, callback, resp) {
    if(callback) callback(resp);
}

function finishGeneration (self) {
    if(!self)
        return;

    console.log("PHOTOPACK::", self);
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
        return e(PhotoPack.ERROR.ORIGINALPATH_NOTFOUND);

    var files = jsext.listDir(originalpath, self.options.readedfiles);
    if(!files || files.length == 0)
        return e(PhotoPack.ERROR.INPUTDIREMPTY);

    self.originalphotos = files;
}

function readPhotosInfo (self, callback) {
    if(!self)
        return e(PhotoPack.ERROR.OBJECTINSTANCE);

    self.photoinfo = {};
    self.photoerror = {};

    self.pp.startIterations("photoinfo", self.originalphotos.length);
    var pending = self.originalphotos.length;
    self.originalphotos.forEach(function(file, index, arr) {
        var fileinput = _path.normalize(_path.join(self.packconfig.basepath, self.packconfig.originaldir, file));
        mediaext.readFile(fileinput, function(err, mediainfo) {
            --pending;

            if(err || !mediainfo) {
                stockError(self.photoerror, file, err || "Info read");
            } else {
                mediainfo.path = self.packconfig.originaldir;
                mediainfo.lastscrap = Date.now();
                self.photoinfo[file] = mediainfo;
            }
            self.pp.endIteration("photoinfo");

            if(pending <= 0) response(self, callback);
        });
    });
}

function stockError (stock, ref, error) {
    if(!stock)
        return;

    stock[ref] = stock[ref] || [];
    stock[ref].push(error);
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

            console.log("PHOTOPACK::filterphotos to ", pack, "in format", format, packConfig.criteria, formatConfig.criteria);
            var outlist = filterPhotos(self.photoinfo, packConfig.criterialogic, packConfig.criteria, formatConfig.criterialogic, formatConfig.criteria);
            var outlistIds = outlist && Object.keys(outlist);
            console.log("PHOTOPACK::outlist", outlistIds);

            if(outlistIds && outlistIds.length) {
                packConfig.outlist[format] = outlistIds;
                outPhotoCount += outlistIds && outlistIds.length;
            }
            
            self.pp.endIteration("packlist");
        });
    });

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

function buildPacks (self, callback) {
    if(!self)
        return e(PhotoPack.ERROR.OBJECTINSTANCE);

    self.pp.startIterations("photogeneration", self.outPhotoCount);
    self.outerror = {};
    self.outsuccess = {};
    var pending = self.outPhotoCount;
    Object.keys(self.packconfig.packs).forEach(function(pack, pIndex) {
        var packConfig = self.packconfig.packs[pack];
        Object.keys(packConfig.outlist).forEach(function(format, fIndex) {
            packConfig.outlist[format].forEach(function(photo) {
                generatePhoto(self, photo, pack, format, function(err, info) {
                    --pending;

                    if(err || !info) {
                        stockError(self.outerror, photo, err || "Generate");
                    } else {
                        stockSuccess(self.outsuccess, photo, pack, format);
                    }
                    self.pp.endIteration("photogeneration");

                    if(pending <= 0) response(self, callback);
                });
            });
        });
    });
}

function generatePackList (self, callback) {
    if(!self)
        return response(self, callback, e(PhotoPack.ERROR.OBJECTINSTANCE));
    
    if(!self.packconfig || !self.packconfig.packs)
        return response(self, callback, e(PhotoPack.ERROR.MISSINGPACKS));

    if(!self.outPhotoCount)
        return response(self, callback);

    self.pp.startIterations("photogeneration", self.outPhotoCount);
    //TODO
}

function generatePhoto (self, photo, pack, format, callback) {
    if(!self)
        return e(PhotoPack.ERROR.OBJECTINSTANCE);

    var formatConfig = self.packconfig.formats[format];
    var packConfig = self.packconfig.packs[pack];
    var photoInfo = self.photoinfo[photo];

    // generate photo into path pathdestination/pack/format/
    var destination = _path.join(self.packconfig.basepath, pack, format);
    mediaext.generateVersion(photoInfo.filename, formatConfig, destination, callback);
}

function stockSuccess (successlist, photo, pack, format) {
    successlist.push({o:photo, p:pack, f:format});
}