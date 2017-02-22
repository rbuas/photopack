var _util = require("util");
var _fs = require("fs");
var _path = require("path");
var _exif = require("fast-exif");
var _imagesize = require("image-size");
var _sax = require("sax");
var _sharp = require("sharp");
var _color = require("color-thief-jimp");

module.exports = MediaExt = {};

//DEFINES

MediaExt.EXPORT_FORMAT = {
    id : "file.basename",
    type : "file.type",
    height : "file.height",
    width : "file.width",
    orientation : "file.orientation",

    xres : "media.XResolution",
    yres : "media.YResolution",
    model : "media.Model",
    modelserial : "exif.BodySerialNumber",
    focal : "exif.FocalLength",
    lens : "exif.LensModel",
    iso : "exif.ISO",
    ex : "exif.ExposureTime",
    fn : "exif.FNumber",
    creation : "exif.DateTimeOriginal",//"xmp.createdate"
    temperature : "xmp.temperature",
    wb : "xmp.wb",
    profile : "xmp.profile",

    author : "xmp.author",
    usageterms : "xmp.usageterms",
    authoremail : "xmp.authoremail",
    authorsite : "xmp.authorsite",
    copyright : "xmp.copyright",
    authorrating : "xmp.authorrating",
    title : "xmp.title",
    caption : "xmp.description",
    label : "xmp.label",
    tags : "xmp.tags",
    city : "xmp.city",
    state : "xmp.state",
    country : "xmp.country",
    countrycode : "xmp.countrycode",

    latitude : "gps.GPSLatitude",
    longitude : "gps.GPSLongitude",
    altitude : "gps.GPSAltitude",
};

MediaExt.XMP_PROPERTIES = {
    "x:xmpmeta/rdf:RDF/rdf:Description/dc:creator/rdf:Seq/rdf:li" : "author",
    "x:xmpmeta/rdf:RDF/rdf:Description/dc:title/rdf:Alt/rdf:li" : "title",
    "x:xmpmeta/rdf:RDF/rdf:Description/dc:rights/rdf:Alt/rdf:li" : "copyright",
    "x:xmpmeta/rdf:RDF/rdf:Description/dc:description/rdf:Alt/rdf:li" : "description",
    "x:xmpmeta/rdf:RDF/rdf:Description/dc:subject/rdf:Bag/rdf:li" : "tags",
    "x:xmpmeta/rdf:RDF/rdf:Description/xmpRights:UsageTerms/rdf:Alt/rdf:li" : "usageterms",
    "x:xmpmeta/rdf:RDF/rdf:Description/xmp:CreateDate" : "createdate",
    "x:xmpmeta/rdf:RDF/rdf:Description/xmp:Rating" : "authorrating",
    "x:xmpmeta/rdf:RDF/rdf:Description/xmp:Label" : "label",
    "x:xmpmeta/rdf:RDF/rdf:Description/photoshop:City" : "city",
    "x:xmpmeta/rdf:RDF/rdf:Description/photoshop:State" : "state",
    "x:xmpmeta/rdf:RDF/rdf:Description/photoshop:Country" : "country",
    "x:xmpmeta/rdf:RDF/rdf:Description/Iptc4xmpCore:CountryCode" : "countrycode",
    "x:xmpmeta/rdf:RDF/rdf:Description/crs:WhiteBalance" : "wb",
    "x:xmpmeta/rdf:RDF/rdf:Description/crs:Temperature" : "temperature",
    "x:xmpmeta/rdf:RDF/rdf:Description/crs:CameraProfile" : "profile",
    "x:xmpmeta/rdf:RDF/rdf:Description/Iptc4xmpCore:CreatorContactInfo/Iptc4xmpCore:CiEmailWork" : "authoremail",
    "x:xmpmeta/rdf:RDF/rdf:Description/Iptc4xmpCore:CreatorContactInfo/Iptc4xmpCore:CiUrlWork" : "authorsite",
};

MediaExt.CONVERTION = {
    authorrating : function(val) { return val && Number(val); }
}

MediaExt.VERSIONAMSTER = "web";
MediaExt.VERSIONS = {
    web : {quality : 100, width : 2048},
    low : {quality : 100, width : 1024},
    mob : {quality : 90, width : 480},
    thumb : {quality : 80, width : 120},
    tiny : {quality : 60, width : 3}
};



// PUBLIC

MediaExt.readFile = function (mediafile, callback) {
    if(!mediafile)
        return response(callback, "missing parameter", null);

    var pending = 3;
    var info = {};
    var error = [];

    MediaExt.readFileinfo(mediafile, function (err, data) {
        if(err) error.push(err);
        info.file = data;
        if(--pending == 0) formatedResponse(callback, err, info);
    });

    MediaExt.readExif(mediafile, function (err, data) {
        if(err) error.push(err);
        info.exif = data && data.exif;
        info.media = data && data.image;
        info.gps = data && data.gps;
        if(--pending == 0) formatedResponse(callback, err, info);
    });

    MediaExt.readXMP(mediafile, function (err, data) {
        if(err) error.push(err);
        info.xmp = data;
        if(--pending == 0) formatedResponse(callback, err, info);
    });
}

MediaExt.readFileinfo = function (mediafile, callback) {
    mediafile = _path.normalize(mediafile);
    if(!mediafile)
        return response(callback, "Missing media file name parameter.", null);

    var extension = _path.extname(mediafile);
    var filetype = extension.replace(".", "");
    var basename = _path.basename(mediafile, extension);
    var filedir = _path.dirname(mediafile);

    var stats = _fs.statSync(mediafile);
    if(!stats || !stats.isFile())
        return response(callback, mediafile + " is not a file.", null);

    var filecreation = stats.birthtime;

    var dimensions = _imagesize(mediafile);
    var width = dimensions && dimensions.width;
    var height = dimensions && dimensions.height;
    var orientation = width && height && width > height ? "L" : "P";

    var info = {
        path : filedir,
        basename : basename,
        type : filetype,
        filecreation : filecreation,
        width : width,
        height : height,
        orientation : orientation,
    };
    response(callback, null, info);
}

MediaExt.readExif = function (mediafile, callback) {
    mediafile = _path.normalize(mediafile);
    if(!mediafile)
        return response(callback, "Missing media file name parameter.", null);

    _exif.read(mediafile, true)
    .then(function (data) {
        response(callback, null, data);
    })
    .catch(function (error) {
        response(callback, error, null);
    });
}

MediaExt.readXMP = function (mediafile, callback) {
    mediafile = _path.normalize(mediafile);
    if(!mediafile)
        return response(callback, "Missing media file name parameter.", null);

    JsExt.extractFromFile(mediafile, "<x:xmpmeta", "</x:xmpmeta>")
    .then(function (data) {
        parseXMP(data, callback);
    })
    .catch(function (error) {
        response(callback, error, info);
    });
}

MediaExt.generateVersion = function (filepath, version, destination, callback) {
    if(!filepath || !version || !destination)
        return response(callback, "missing params", null);

    var config = typeof(version) == "object" ? version : MediaExt.VERSIONS[version];
    if(!config)
        return response(callback, "unknown config", null);

    var destinationDir = _path.dirname(destination);
    try {
        var stats = _fs.statSync(destinationDir);
    } catch (e) {
        _fs.mkdirSync(destinationDir);
    }

    var sharpfile = _sharp(filepath);
    if(config.width) sharpfile.resize(config.width);
    sharpfile.jpeg({quality:config.quality || 100});
    sharpfile.withMetadata();
    sharpfile.toFile(destination, function (err, info) {
        return response(callback, err, {version:version, info:info});
    });
}

MediaExt.generateVersions = function (dir, file, callback) {
    if(!dir || !file)
        return response(callback, "missing params", null);

    var filepath = _path.normalize(_path.join(dir, MediaExt.VERSIONAMSTER, file));
    var pending = 0;
    var error = [];

    var versions = [];
    for(var version in MediaExt.VERSIONS) {
        if(!MediaExt.VERSIONS.hasOwnProperty(version) || version == MediaExt.VERSIONAMSTER) continue;

        pending++;
        var destination = _path.normalize(_path.join(dir, version, file));
        MediaExt.generateVersion(filepath, version, destination, function (err, data) {
            var vers = data && data.version ? data.version : null;
            if(err) error.push(err);
            else versions.push(vers);
            if(--pending == 0) response(callback, error, versions); 
        });
    }
    if(pending == 0) return response(callback, "no versions", null);
}


// PRIVATE

function response (callback, err, info) {
    if(callback) callback(err, info);

    return info;
}

function formatedResponse (callback, err, info) {
    var formatedinfo = JsExt.formatObject(info, MediaExt.EXPORT_FORMAT);

    if(callback) callback(err, formatedinfo);

    return formatedinfo;
}

function parseXMP (data, callback) {
    var parserstrict = true;
    var parser = _sax.parser(parserstrict);

    var nodepath = [];
    var currentnode = null;
    var outdata = {};

    parser.onerror = function (err) { response(callback, err, null)};
    parser.onopentag = function (node) {
        nodepath.push(node.name);
        if(node.attributes) {
            for(var att in node.attributes) {
                if(!node.attributes.hasOwnProperty(att))
                    continue;

                var value = node.attributes[att];
                nodepath.push(att);
                setOutdata(nodepath, value, outdata);
                nodepath.pop();
            }
        }
        currentnode = node;
    }
    parser.onclosetag = function (node) {
        nodepath.pop();
        currentnode = null;
    }
    parser.ontext = function (value) {
        setOutdata(nodepath, value, outdata);
    }
    parser.onend = function (data) { response(callback, null, outdata) };
    parser.write(data).close();
}

function setOutdata (nodepath, value, outdata) {
    value = value && value.trim();
    if(!nodepath || !outdata || !value)
        return;

    var currentpath = nodepath.join("/");
    var prop = currentpath && MediaExt.XMP_PROPERTIES[currentpath];
    if(!currentpath || !prop)
        return;

    var convertion = MediaExt.CONVERTION[prop];
    if(convertion) {
        value = convertion(value);
    }

    var old = outdata[prop];
    if(!old)
        outdata[prop] = value;
    else if(Array.isArray(old))
        outdata[prop].push(value);
    else
        outdata[prop] = [old, value];
}