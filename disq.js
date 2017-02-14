"use strict";
const hiredis_1 = require("hiredis");
class Disq {
    constructor(config) {
        if (config instanceof Function)
            this.config = config;
        else
            this.config = function () { return config || { nodes: null }; };
    }
    connect() {
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
    call(...params) {
        return this.connect().then(() => {
            return new Promise((resolve, reject) => {
                this._operations.push([resolve, reject]);
                this.socket.write.apply(this.socket, [...params]);
            });
        });
    }
    ackjob(jobid, ...jobids) {
        return this.call.apply(this, ['ackjob', jobid].concat(jobids));
    }
    addjob(queue, job, options) {
        if (options) {
            const timeout = options.timeout || 0;
            const keys = Object.keys(options);
            const args = keys.filter(key => key !== 'timeout').map(pairify(options)).reduce((accum, pair) => accum.concat(pair), []);
            return this.call.apply(this, ['addjob', queue, job, timeout].concat(args));
        }
        else {
            return this.call('addjob', queue, job, 0);
        }
    }
    getjob(queue, options) {
        const keys = Object.keys(options || {});
        const args = keys.map(pairify(options)).reduce((accum, pair) => accum.concat(pair), []);
        args.push('from', queue);
        return this.call.apply(this, ['getjob'].concat(args))
            .then(function (jobs) {
            return jobs.map(function (job) {
                return {
                    queue: job[0],
                    id: job[1],
                    body: job[2],
                };
            });
        });
    }
    info() {
        return this.call('info').then(parseInfo);
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
