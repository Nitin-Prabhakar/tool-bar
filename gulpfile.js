var $ = require('gulp');
/*
require gulp-load-plugins, and call it
gulp-load-plugins will require individually,
all the plugins installed in package.json at the root directory
these required plugins, are lazy loaded
that is, gulp-load-plugins will only require them when they are referenced in this file
plugins are available for perusal, via camelcased names, minus gulp
eg: gulp-clean-css is accessed by $$.cleanCss
*/
var $$ = require('gulp-load-plugins')();

//image lossy compression plugins
var compressJpg = require('imagemin-jpeg-recompress');
var pngquant = require('imagemin-pngquant');

//Browser-sync

var sync = require('browser-sync').create();
var reload = sync.reload;

//file/folder deletion is handled via the del plugin
var del = require('del');

//run tasks in a sequence
var sequence = require('run-sequence');

//declare the widths at which you need to resize an image
var widths = ['480', '640', '800', '960', '1280', '1600'];

var path = require('path');

/*
 *@processBuildBlocks
 *Description:takes in a glob src and sets the hrefs/sources
 *in matched html files.Does not create any minified or
 *concatenated assets.Minification of style and script assets
 *to be scheduled seperately. *
 *@src: glob pattern(eg:'/** /*.html')
 *@return returns a stream
 */


var processBuildBlocks = function(src) {
    return $.src(src)
        .pipe($$.useref({
            // Do not create minified assets(js/css) from the build path
            //schedule minification seperately
            noAssets: true
        }))
        .pipe($.dest(function(file) {
            //file is the vinyl file object that is passed to a callback on dest -
            //it describes the file being processed
            // Refer here https://github.com/gulpjs/gulp/blob/master/docs/API.md#path
            /* eg: file =
            new File(
            cwd:<path from which gulp runs>
            path:<absolute path of the file being processed
            base:<absolute path till the directory just preceding a glob passed to src
            )
            */
            //returning file.base, is telling gulp to save the modifications in the same base
            //directory as the src file being processed
            return file.base;
        }));
}

/*
 *@minifyHtml
 *Description:takes in a glob src, and minifies all '.html' files matched by the glob
 *@src - input a glob pattern - a string eg 'images/** /*' or 'images/*' or, an array eg ['glob1','glob2']
 *@dest=file.base means, the modified html file will be in the same directory as the src file being minified
 *often means, the process is just a modification on the existing src file
 *@return returns a stream
 */
var minifyHtml = function(src) {
    return $.src(src)
        .pipe($$.minifyHtml())
        .pipe($.dest(function(file) {
            //file is provided to a dest callback -
            // Refer here https://github.com/gulpjs/gulp/blob/master/docs/API.md#path
            return file.base;
        }));
}


var optimizeStyles = function(src) {

    return $.src(src).
    pipe($$.cached('styles')).
    pipe($$.autoprefixer({
        browsers: ['last 2 versions']
    })).
    pipe($.dest(function(file) {
        return file.base
    })).
    pipe($$.remember('auto-prefixed-stylesheets')).
    pipe($$.concat('app.css')).
    pipe($.dest('build/css')).
    pipe($$.cleanCss()).
    pipe($$.rename({
        suffix: '.min'
    })).
    pipe($.dest('build/css'))


}

var optimizeScripts = function(src) {

    return $.src(src).
    pipe($$.cached('scripts')).
    pipe($$.jshint()).
    pipe($$.jshint.reporter('default')).
    pipe($$.jshint.reporter('fail')).
    pipe($$.remember('linted-scripts')).
    pipe($$.concat('app.js')).
    pipe($.dest('build/js')).
    pipe($$.uglify()).
    pipe($$.rename({
        suffix: '.min'
    })).
    pipe($.dest('build/js'))


}

/*
@generateResponsiveImages
*@Description:takes in a src of globs, to stream matching image files , a width,
*@src - input a glob pattern - a string eg 'images/** /*' or 'images/*' or, an array
eg ['glob1','glob2']
*to resize the matching image to, and a dest to write the resized and minified files to
*@return returns a stream
*/
var generateResponsiveImages = function(src, width, dest) {

    //declare a default destination
    if (!dest)
        dest = 'build/images';
    //case 1: src glob -  images/**/*
    // the base is the directory immediately preceeding the glob - images/ in this case
    //case 2: images/fixed/flourish.png : the base here is images/fixed/ - we are overriding
    // that by setting base to images.This is done so that, the path beginning after images/
    // - is the path under our destination - without us setting the base, dest would be,
    //build/images/flourish.png.But with us setting the base, the destination would be
    // build/images/fixed/flourish.png
    return $.src(src, {
        base: 'images'
    })

    //generate resized images according to the width passed
    .pipe($$.responsive({
            //match all pngs within the src stream
            '**/*.png': [{
                width: width,
                rename: {
                    suffix: '-' + width
                },
                withoutEnlargement: false,
            }],
            //match all jpgs within the src stream
            '**/*.jpg': [{
                width: width,
                rename: {
                    suffix: '-' + width
                },
                progressive: true,
                withoutEnlargement: false,
            }]
        }, {

            errorOnEnlargement: false,
            errorOnUnusedConfig: false,
            errorOnUnusedImage: false

        }))
        //once the file is resized to width, minify it using the plugins available per format
        .pipe($$.if('*.jpg', compressJpg({
            min: 30,
            max: 90,
            target: 0.5
        })()))
        //use file based cache gulp-cache and it will minify only changed or new files
        //if it is not a new file and if the contents havent changed, the file is served from cache
        .pipe($$.cache($$.imagemin({
            verbose: true
        })))


    //write to destination - dest + path from base
    .pipe($.dest(dest));
}

/*
 * @rm - takes in a src glob and deletes matching files
 *@src - input a glob pattern - a string eg 'images/** /*' or 'images/*' or, an array eg ['glob1','glob2']
 */

var rm = function(src) {
    return del(src);
}


/*
Deletes a cache entry
*/
var uncache = function(cacheName, cacheKey) {
        var cache = $$.cached;
        if (cache.caches[cacheName] && cache.caches[cacheName][cacheKey])
            return delete cache.caches[cacheName][cacheKey];
        return false;
    }
    /*
    logs current cache created via gulp-cached
    */
var viewCache = function() {
    console.log($$.cached.caches)
}


//Define all your tasks

/*
* $.task('name','dependency array',function)
results in building a task object as below
task:{
'name':name,
'dep':[array of dependencies],
'fn':function
}
*/


//*@return returns a stream to notify on task completion
$.task('processBuildBlocks', function() {
    var src = ['**/*.html', '!{node_modules,bower_components}/**/*.html'];
    return processBuildBlocks(src);
});

//*@return returns a stream to notify on task completion
$.task('optimizeHtml', ['processBuildBlocks'], function() {
    var src = ['**/*.html', '!{node_modules}/**/*.html'];
    return minifyHtml(src);
});

//*@return returns a stream to notify on task completion
$.task('optimizeScripts', function() {
    var src = ['js/**/*.js'];
    return optimizeScripts(src);
});

//*@return returns a stream to notify on task completion
$.task('optimizeStyles', function() {
    var src = ['css/**/*.css', 'fonts/google/**/*.css'];
    return optimizeStyles(src);
});

//Take in a callback to ensure notifying the gulp engine, that the task is done
//required since, you are not returning a stream in this task
$.task('generateResponsiveImages', function(callback) {
    var src = ['images/**/*.{jpg,png}'];
    for (var i = widths.length - 1; i >= 0; i--) {
        generateResponsiveImages(src, widths[i]);
    }
    callback();

});

$.task('watchdog', function() {


    /*
    Initiate Browser sync
    @documentation - https://www.browsersync.io/docs/options/
    */
    sync.init({
        proxy: {
            target: 'www.myblog.com/toolbar/'
        },
        port: 8000
    });

    /*
    on addition or change or deletion of a file in the watched directories
    the change event is triggered. An event object with properties like
    path,
    event-type
    is available for perusal passed to the callback

    */
    $.watch('js/**/*', reload).on('change', function(event) {
        console.log(event.type + ':' + event.path)
        if (event.type === 'deleted') {
            uncache('scripts', event.path);
            $$.remember.forget('linted-scripts', event.path);
        }
        sequence('optimizeScripts');
    });

    $.watch(['css/**/*', 'fonts/google/**/*.css'], reload).on('change', function(event) {
        console.log(event.type + ':' + event.path)
        if (event.type === 'deleted') {
            uncache('styles', event.path);
            $$.remember.forget('auto-prefixed-stylesheets', event.path);
        }
        sequence('optimizeStyles')
    });

    $.watch(['images/**/*'], reload).on('change', function(event) {

        console.log(event.type + ':' + event.path);

        if (event.type === 'deleted') {
            var rPath = path.relative(path.resolve('.'), event.path);
            var oParsedPath = path.parse(rPath);
            var delPathDir = path.dirname(path.resolve('build', rPath));
            for (var i = widths.length - 1; i >= 0; i--) {
                var delPath = oParsedPath.name + '-' + widths[i] + oParsedPath.ext;
                rm(path.join(delPathDir, delPath));
            }
            return true
        }

        for (var i = widths.length - 1; i >= 0; i--) {
            generateResponsiveImages(event.path, widths[i]);
        }
    });

    $.watch('**/*.html', reload);
});
//Just in case you need to , run this.
$.task('build', ['clean'], function(cb) {
    sequence(
        ['optimizeStyles', 'optimizeScripts'],
        'generateResponsiveImages',
        cb
    )
});

$.task('clean', function(cb) {
    return rm('build');
});

$.task('default', ['generateResponsiveImages'], function() {
    $.start('watchdog');
    console.log('Starting Incremental Build');
});
