const gulp = require('gulp')
const { src, dest } = gulp
const del = require('del')
const ts = require("gulp-typescript");
var sourcemaps = require('gulp-sourcemaps');
const tsProject = ts.createProject("tsconfig.json");

const paths = {
    scripts: {
        src: [
            'package.json',
        ],
        dest: 'dist/'
    }
}


function compile() {
    return gulp
        .src("src/**/*.ts")
        .pipe(sourcemaps.init())
        .pipe(tsProject()).js
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('dist'));
}

function copy() {
    return src(paths.scripts.src).pipe(dest('dist'));
}

function clean() {
    // You can use multiple globbing patterns as you would with `gulp.src`,
    // for example if you are using del 2.0 or above, return its promise
    return del(['build']);
}

exports.build = gulp.series(clean, compile)