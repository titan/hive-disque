import * as net from "net";
import { Reader } from "hiredis";

export interface Config {
  nodes: string[];
  auth?: string;
}

export interface AddJobOptions {
  timeout?: number;
  replicate?: number;
  delay?: number;
  retry?: number;
  ttl?: number;
  maxlen?: number;
  async?: boolean;
}

export interface GetJobOptions {
  timeout?: number;
  count?: number;
}

export interface GetJobResult {
  queue: string;
  id: string;
  body: string | number | Buffer;
}

const bufStar = new Buffer("*", "ascii");
const bufDollar = new Buffer("$", "ascii");
const bufCrlf = new Buffer("\r\n", "ascii");

function writeCommand(...params: any[]) {
  const args = arguments;
  let bufLen = new Buffer(String(args.length), "ascii"),
    parts = [bufStar, bufLen, bufCrlf],
    size = 3 + bufLen.length;

  for (let arg of args) {
    if (!Buffer.isBuffer(arg))
      arg = new Buffer(String(arg));

    bufLen = new Buffer(String(arg.length), "ascii");
    parts = parts.concat([
      bufDollar, bufLen, bufCrlf,
      arg, bufCrlf
    ]);
    size += 5 + bufLen.length + arg.length;
  }

  return Buffer.concat(parts, size);
}

function createConnection(port: number, host: string): net.Socket {
  const s = net.createConnection(port || 6379, host);
  let r = new Reader({ return_buffers: true });
  const _write = s.write;

  s.write = function() {
    const data = writeCommand.apply(this, arguments);
    return _write.call(s, data);
  }

  s.on("data", function(data) {
    let reply;
    r.feed(data);
    try {
      while((reply = r.get()) !== undefined)
        s.emit("reply", reply);
    } catch(err) {
      r = null;
      s.emit("error", err);
      s.destroy();
    }
  });

  s.on("close", function (had_error) {
    if (!had_error) {
      const error = new Error();
      error.message = `connect ECONNREFUSED ${host}:${port}`;
      s.emit("error", error);
    }
  });
  return s;
}

export class Disq {
  socket: net.Socket;
  config: (() => Config);
  //_operations: [(param: any) => any, (e: Error) => void][]
  _operations: ((e: Error, param: any) => void)[];

  constructor(config: Config | (() => Config)) {
    if (config instanceof Function)
      this.config = config;
    else
      this.config = function() { return config || { nodes: null } };
  }

  connectAsync(): Promise<net.Socket> {
    if (this.socket) {
      return Promise.resolve(this.socket);
    } else {
      return Promise.resolve(this.config()).then(config => {
        const addr  = config.nodes[0];
        const parts = addr.split(':');
        this.socket = createConnection(parseInt(parts[1]), parts[0]);
        this.socket.on('reply', data => {
          const operation = this._operations.shift();
          if (operation) {
            if (data instanceof Error)
              operation(data, null);
            else
              operation(null, data);
          }
        })
        .on('error', error => {
          const operation = this._operations.shift();
          if (operation) {
            operation(error, null);
          }
          this.socket = null;
        });
        this._operations = [];
        return this.socket;
      });
    }
  }

  connect(): net.Socket {
    if (this.socket) {
      return this.socket;
    } else {
      const config = this.config();
      const addr  = config.nodes[0];
      const parts = addr.split(':');
      this.socket = createConnection(parseInt(parts[1]), parts[0]);
      this.socket.on('reply', data => {
        const operation = this._operations.shift();
        if (operation) {
          if (data instanceof Error) {
            operation(data, null);
          } else {
            operation(null, data);
          }
        }
      })
      .on('error', error => {
        const operation = this._operations.shift();
        if (operation) {
          operation(error, null);
        }
        this.socket = null;
      });
      this._operations = [];
      return this.socket;
    }
  }

  callAsync(...params): Promise<any> {
    return this.connectAsync().then(() => {
        return new Promise((resolve, reject) => {
          this._operations.push((e: Error, param: any) => {
            if (e) {
              reject(e);
            } else {
              resolve(param);
            }
          });
          this.socket.write.apply(this.socket, [...params]);
        });
      });
  }

  call(cb: ((e: Error, dat: any) => void), ...params) {
    const socket = this.connect();
    this._operations.push(cb);
    socket.write.apply(socket, [...params]);
  }

  ackjobAsync(jobid: string, ...jobids: string[]): Promise<any> {
    return this.callAsync.apply(this, [ 'ackjob', jobid ].concat(jobids));
  }

  ackjob(jobid: string, cb: ((err: Error, dat: any) => void)) {
    this.call(cb, 'ackjob', jobid);
  }

  ackjobs(jobids: string[], cb: ((erro: Error, dat: any) => void)) {
    this.call.apply(this, [cb, 'ackjob'].concat(jobids));
  }

  addjobAsync(queue: string, job: string | number | Buffer, options?: AddJobOptions): Promise<any> {
    if (options) {
      const timeout = options.timeout || 0;
      const keys    = Object.keys(options);
      const args    = keys.filter(key => key !== 'timeout').map(pairify(options)).reduce((accum, pair) => accum.concat(pair), []);

      return this.callAsync.apply(this, [ 'addjob', queue, job, timeout ].concat(args));
    } else {
      return this.callAsync('addjob', queue, job, 0);
    }
  }

  addjob(queue: string, job: string | number | Buffer, options?: AddJobOptions, cb?: ((err: Error, dat: any) => void)) {
    if (arguments.length < 3) {
      throw new Error("Not enough parameters in addjob");
    }
    const args = [];
    for (let i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }

    args.shift(); // skip queue
    args.shift(); // skip job
    const _cb = args.pop();
    const opts = (args.length > 0) ? args.shift() : undefined;
    if (opts) {
      const timeout = opts.timeout || 0;
      const keys    = Object.keys(opts);
      const args    = keys.filter(key => key !== 'timeout').map(pairify(opts)).reduce((accum, pair) => accum.concat(pair), []);

      this.call.apply(this, [ _cb, 'addjob', queue, job, timeout ].concat(args));
    } else {
      this.call(_cb, 'addjob', queue, job, 0);
    }
  }

  getjobAsync(queue: string, options?: GetJobOptions): Promise<GetJobResult[]> {
    const keys = Object.keys(options || {});
    const args = keys.map(pairify(options)).reduce((accum, pair) => accum.concat(pair), []);

    args.push('from', queue);

    return this.callAsync.apply(this, [ 'getjob' ].concat(args))
    .then(function(jobs) {
      return jobs.map(function(job) {
        return {
          queue: job[0].toString(),
          id:    job[1].toString(),
          body:  job[2],
        };
      });
    });
  }

  getjob(queue: string, options?: GetJobOptions, cb?: ((err: Error, jobs: GetJobResult[]) => void)) {
    if (arguments.length < 2) {
      throw new Error("Not enough parameters in getjob");
    }
    const _args = [];
    for (let i = 0; i < arguments.length; i++) {
      _args.push(arguments[i]);
    }

    _args.shift(); // skip queue
    const _cb = _args.pop();
    const opts = (_args.length > 0) ? _args.shift() : undefined;
    const keys = Object.keys(opts || {});
    const args = keys.map(pairify(opts)).reduce((accum, pair) => accum.concat(pair), []);

    args.push('from', queue);

    this.call.apply(this, [_cb ? (err: Error, dat: any) => {
      if (err) {
        _cb(err, null);
        return;
      }
      const jobs = dat as Buffer[][];
      if (jobs) {
        const data = jobs.map((job: Buffer[]) => {
          return {
            queue: job[0].toString(),
            id:    job[1].toString(),
            body:  job[2],
          }
        });
        _cb(err, data);
      } else {
        _cb(err, []);
      }
    } : cb, 'getjob' ].concat(args));
  }

  infoAsync(): Promise<any> {
    return this.callAsync('info').then(parseInfo);
  }

  info(cb: ((err: Error, dat: any) => void)) {
    this.call(cb ? (err: Error, dat: Buffer): void => {
      cb(err, parseInfo(dat.toString()));
    } : cb, 'info');
  }

  qpeek(queue: string, count: number, cb: ((err: Error, dat: any) => void)) {
    this.call(cb ? (err: Error, dat: any) => {
      if (err) {
        cb(err, null);
        return;
      }
      const jobs = dat as Buffer[][];
      if (jobs) {
        const data = jobs.map((job: Buffer[]) => {
          return {
            queue: job[0].toString(),
            id:    job[1].toString(),
            body:  job[2],
          }
        });
        cb(err, data);
      } else {
        cb(err, []);
      }
    } : cb, 'qpeek', queue, count);
  }

  qlen(queue: string, cb: ((err: Error, dat: any) => void)) {
    this.call(cb, 'qlen', queue);
  }

  qscan(cb: ((err: Error, dat: any) => void)) {
    this.call(cb ? (err: Error, dat: any) => {
      if (err) {
        cb(err, null);
        return;
      }
      const rep = dat as Buffer[];
      if (rep.length === 2) {
        const tmp = dat as Buffer[][];
        const queues = tmp[1];
        cb(null, queues.map(x => x.toString()));
      } else {
        cb(new Error("Error response of qscan"), null);
      }
    } : cb, 'qscan');
  }

  jscan(queue: string, cb: ((err: Error, dat: any) => void)) {
    this.call(cb ? (err: Error, dat: any) => {
      if (err) {
        cb(err, null);
        return;
      }
      const rep = dat as Buffer[];
      if (rep.length === 2) {
        const tmp = dat as Buffer[][];
        const jobs = tmp[1] as Buffer[];
        cb(null, jobs.map(x => x.toString()));
      } else {
        cb(new Error("Error response of qscan"), null);
      }
    } : cb, 'jscan', 'queue', queue)
  }

  end() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }
}

function parseInfo(str: string): {} {
  const result = {};

  str.split("\r\n").forEach((line: string) => {
      if (line.length === 0 || line[0] === '#') return;

      const parts = line.split(':');
      const key   = parts[0];
      const value = parts[1];

      result[key] = value;
    });

  return result;
}

function pairify(obj: {}): ((key: string) => any[]) {
  return (key: string) => {
    if (obj[key] === true)
      return [ key ];
    else
      return [ key, obj[key] ];
  };
}
