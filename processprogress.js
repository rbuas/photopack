var _moment = require("moment");

module.exports = ProcessProgress;

ProcessProgress.DEFAULTOPTIONS = {
    watch : function(event, info, message, stack) {
        if(event == "next-iteration")
            console.log(":: it ", message.itcurrent, "/", message.itmax, " - remaining : ", message.itpending, " about ", message.remainingtime);
        else
            console.log("::", event, info);
    }
};

function ProcessProgress (options) {
    var self = this;
    self.options = Object.assign({}, ProcessProgress.DEFAULTOPTIONS, options);
    self.watchCallback = self.options.watch;
    self.stack = {};
}

ProcessProgress.ERROR = {
    PROCESSNAME : "Missing process name parameter",
    PROCESSSTARTED : "Process already started",
    MISSINGPROCESS : "Missing process",
    MISSINGITERATION : "Missing iteration object",
    UNFINISHEDITERATIONS : "Finishing process with pending iterations",
    ITERATIONNOTSTARTED : "End iteration before start iterations"
};

ProcessProgress.prototype.broadcast = function (event, info, message) {
    var self = this;
    if(!self.watchCallback)
        return;

    self.watchCallback(event, info, message, self.stack);
}

ProcessProgress.prototype.startProcess = function (processName, comment) {
    var self = this;
    if(!processName)
        return e(ProcessProgress.ERROR.PROCESSNAME);

    if(self.stack[processName])
        return e(ProcessProgress.ERROR.PROCESSSTARTED);

    self.stack[processName] = new ProcessInfo(processName, comment);
    self.broadcast("start-process", processName, self.stack[processName]);
}

ProcessProgress.prototype.endProcess = function (processName) {
    var self = this;
    if(!processName)
        return e(ProcessProgress.ERROR.PROCESSNAME);

    var process = self.stack[processName];
    if(!process)
        return e(ProcessProgress.ERROR.MISSINGPROCESS);

    var error = process.finish();
    if(error)
        return error;

    self.broadcast("end-process", processName, self.stack[processName]);
}

ProcessProgress.prototype.startIterations = function (processName, iterationCount) {
    var self = this;
    if(!processName)
        return e(ProcessProgress.ERROR.PROCESSNAME);

    var process = self.stack[processName];
    if(!process)
        return e(ProcessProgress.ERROR.MISSINGPROCESS, processName);

    var error = process.startIterations(iterationCount);
    if(error)
        return error;

    self.broadcast("start-iteration", processName, self.stack[processName]);
}

ProcessProgress.prototype.nextIteration = function (processName) {
    var self = this;
    if(!processName)
        return e(ProcessProgress.ERROR.PROCESSNAME);

    var process = self.stack[processName];
    if(!process)
        return e(ProcessProgress.ERROR.MISSINGPROCESS, processName);

    var error = process.nextIteration();
    if(error)
        return error;

    self.broadcast("next-iteration", processName, self.stack[processName]);
}

ProcessProgress.prototype.endIteration = function (processName) {
    var self = this;
    if(!processName)
        return e(ProcessProgress.ERROR.PROCESSNAME);

    var process = self.stack[processName];
    if(!process)
        return e(ProcessProgress.ERROR.MISSINGPROCESS, processName);

    var error = process.endIteration();
    if(error)
        return error;

    self.broadcast("end-iteration", processName, self.stack[processName]);
}



/***
 * ProcessInfo
 */

function ProcessInfo (processName, comment) {
    var self = this;
    self.name = processName;
    self.start = _moment().valueOf();
    self.end = 0;
    self.duration = 0;
    self.comment = comment;
    self.itmax = 0;
    self.iterations = [];
    self.itcurrent = 0;
    self.itpending = 0;
    self.remainingtime = 0;
    self.averagetime = 0;
}

ProcessInfo.prototype.finish = function() {
    var self = this;
    self.end = _moment().valueOf();
    self.duration = self.end - self.start;
    var pendingits = self.itmax > 0 && self.itpending > 0;
    if(pendingits)
        return e(ProcessProgress.ERROR.UNFINISHEDITERATIONS, self);
}

ProcessInfo.prototype.startIterations = function(count) {
    var self = this;
    self.itmax = count;
    self.itpending = count;
    self.itcurrent = 0;
    self.iterations[self.itcurrent] = new IterationInfo();
}

ProcessInfo.prototype.endIteration = function() {
    var self = this;
    if(self.itmax <= 0)
        return e(ProcessProgress.ERROR.ITERATIONNOTSTARTED, self);

    var itcurrent = self.iterations[self.itcurrent];
    if(!itcurrent)
        return e(ProcessProgress.ERROR.MISSINGITERATION, self);

    itcurrent.finish();
}

ProcessInfo.prototype.nextIteration = function (process) {
    var self = this;
    var sum = self.iterations.reduce(function(total, currentIt) {
        return total + currentIt.duration;
    }, 0);
    self.averagetime = sum / (self.itcurrent + 1);
    self.itpending--;
    self.remainingtime = self.itpending * self.averagetime;
    self.iterations[++self.itcurrent] = new IterationInfo();
}



/***
 * IterationInfo
 */

function IterationInfo () {
    var self = this;
    self.start = _moment().valueOf();
    self.end = 0;
    self.duration = 0;
}

IterationInfo.prototype.finish = function () {
    var self = this;
    self.end = _moment().valueOf();
    self.duration = self.end - self.start;
}



// PRIVATE FUNCTIONS

function e (error, ext) {
    console.log(error, ext);
    return error;
}