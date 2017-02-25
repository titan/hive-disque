"use strict";
const hiredis_1 = require("hiredis");
class Disq {
    constructor(config) {
        if (config instanceof Function)
            this.config = config;
        else
            this.config = function () { return config || { nodes: null }; };
    }
    connectAsync() {
        if (this.socket) {
            return Promise.resolve(this.socket);
        }
        else {
            return Promise.resolve(this.config()).then(config => {
                const addr = config.nodes[0];
                const parts = addr.split(':');
                this.socket = hiredis_1.createConnection(parseInt(parts[1]), parts[0]);
                this.socket.on('reply', data => {
                    if (data instanceof Error)
                        this._operations.shift()[1](data);
                    else
                        this._operations.shift()[0](data);
                })
                    .on('error', error => {
                    this._operations.shift()[1](error);
                });
                this._operations = [];
                return this.socket;
            });
        }
    }
    connect(scb, fcb) {
        if (this.socket) {
            return this.socket;
        }
        else {
            const config = this.config();
            const addr = config.nodes[0];
            const parts = addr.split(':');
            this.socket = hiredis_1.createConnection(parseInt(parts[1]), parts[0]);
            this.socket.on('reply', data => {
                if (data instanceof Error)
                    fcb(data);
                else
                    scb(data);
            })
                .on('error', error => {
                fcb(error);
            });
        }
    }
    callAsync(...params) {
        return this.connectAsync().then(() => {
            return new Promise((resolve, reject) => {
                this._operations.push([resolve, reject]);
                this.socket.write.apply(this.socket, [...params]);
            });
        });
    }
    call(scb, fcb, ...params) {
        const socket = this.connect(scb, fcb);
        socket.write.apply(this.socket, [...params]);
    }
    ackjobAsync(jobid, ...jobids) {
        return this.callAsync.apply(this, ['ackjob', jobid].concat(jobids));
    }
    ackjob(jobid, scb, fcb) {
        this.call(scb, fcb, 'ackjob', jobid);
    }
    ackjobs(jobids, scb, fcb) {
        this.call.apply(this, [scb, fcb, 'ackjob'].concat(jobids));
    }
    addjobAsync(queue, job, options) {
        if (options) {
            const timeout = options.timeout || 0;
            const keys = Object.keys(options);
            const args = keys.filter(key => key !== 'timeout').map(pairify(options)).reduce((accum, pair) => accum.concat(pair), []);
            return this.callAsync.apply(this, ['addjob', queue, job, timeout].concat(args));
        }
        else {
            return this.callAsync('addjob', queue, job, 0);
        }
    }
    addjob(queue, job, options, scb, fcb) {
        const args = [];
        for (let i = 0; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        args.shift();
        args.shift();
        const _fcb = args.pop();
        const _scb = args.pop();
        const opts = (args.length > 0) ? args.shift() : undefined;
        if (opts) {
            const timeout = opts.timeout || 0;
            const keys = Object.keys(opts);
            const args = keys.filter(key => key !== 'timeout').map(pairify(opts)).reduce((accum, pair) => accum.concat(pair), []);
            this.call.apply(this, [_scb, _fcb, 'addjob', queue, job, timeout].concat(args));
        }
        else {
            this.call(_scb, _fcb, 'addjob', queue, job, 0);
        }
    }
    getjobAsync(queue, options) {
        const keys = Object.keys(options || {});
        const args = keys.map(pairify(options)).reduce((accum, pair) => accum.concat(pair), []);
        args.push('from', queue);
        return this.callAsync.apply(this, ['getjob'].concat(args))
            .then(function (jobs) {
            return jobs.map(function (job) {
                return {
                    queue: job[0].toString(),
                    id: job[1].toString(),
                    body: job[2],
                };
            });
        });
    }
    getjob(queue, options, scb, fcb) {
        const _args = [];
        for (let i = 0; i < arguments.length; i++) {
            _args.push(arguments[i]);
        }
        _args.shift();
        const _fcb = _args.pop();
        const _scb = _args.pop();
        const opts = (_args.length > 0) ? _args.shift() : undefined;
        const keys = Object.keys(opts || {});
        const args = keys.map(pairify(opts)).reduce((accum, pair) => accum.concat(pair), []);
        args.push('from', queue);
        this.call.apply(this, [(dat) => {
                const jobs = dat;
                const data = jobs.map((job) => {
                    return {
                        queue: job[0].toString(),
                        id: job[1].toString(),
                        body: job[2],
                    };
                });
                scb(data);
            }, fcb, 'getjob'].concat(args));
    }
    infoAsync() {
        return this.callAsync('info').then(parseInfo);
    }
    info(scb, fcb) {
        this.call((dat) => {
            scb(parseInfo(dat.toString()));
        }, fcb, 'info');
    }
    end() {
        if (this.socket) {
            this.socket.end();
            this.socket = null;
        }
    }
}
exports.Disq = Disq;
function parseInfo(str) {
    const result = {};
    str.split("\r\n").forEach((line) => {
        if (line.length === 0 || line[0] === '#')
            return;
        const parts = line.split(':');
        const key = parts[0];
        const value = parts[1];
        result[key] = value;
    });
    return result;
}
function pairify(obj) {
    return (key) => {
        if (obj[key] === true)
            return [key];
        else
            return [key, obj[key]];
    };
}
