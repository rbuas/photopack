global.ROOT_DIR = __dirname;

var photopack = require(ROOT_DIR + "/photopack");
PhotoPack.GeneratePacks({
    watch : function(event, info, stack) {
        console.log("PHOTOPACK::", event, info);
    }
});
