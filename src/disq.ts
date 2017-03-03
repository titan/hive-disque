import * as net from "net";
import { createConnection } from "hiredis";

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

export class Disq {
  socket: net.Socket;
  config: (() => Config);
  _operations: [(param: any) => any, (e: Error) => void][]

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

  connect(): net.Socket {
    if (this.socket) {
      return this.socket;
    } else {
      const config = this.config();
      const addr  = config.nodes[0];
      const parts = addr.split(':');
      this.socket = createConnection(parseInt(parts[1]), parts[0]);
      this.socket.on('reply', data => {
        if (data instanceof Error) {
          this._operations.shift()[1](data);
        } else {
          this._operations.shift()[0](data);
        }
      })
      .on('error', error => {
        this._operations.shift()[1](error);
      });
      this._operations = [];
      return this.socket;
    }
  }

  callAsync(...params): Promise<any> {
    return this.connectAsync().then(() => {
        return new Promise((resolve, reject) => {
          this._operations.push([ resolve, reject ]);
          this.socket.write.apply(this.socket, [...params]);
        });
      });
  }

  call(scb: ((dat: any) => any), fcb: ((err: Error) => void), ...params) {
    const socket = this.connect();
    this._operations.push([ scb, fcb ]);
    socket.write.apply(socket, [...params]);
  }

  ackjobAsync(jobid: string, ...jobids: string[]): Promise<any> {
    return this.callAsync.apply(this, [ 'ackjob', jobid ].concat(jobids));
  }

  ackjob(jobid: string, scb: ((dat: any) => any), fcb: ((err: Error) => void)) {
    this.call(scb, fcb, 'ackjob', jobid);
  }

  ackjobs(jobids: string[], scb: ((dat: any) => any), fcb: ((err: Error) => void)) {
    this.call.apply(this, [scb, fcb, 'ackjob'].concat(jobids));
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

  addjob(queue: string, job: string | number | Buffer, options?: AddJobOptions, scb?: ((dat: any) => any), fcb?: ((err: Error) => void)) {
    if (arguments.length < 4) {
      throw new Error("Not enough parameters in addjob");
    }
    const args = [];
    for (let i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }

    args.shift(); // skip queue
    args.shift(); // skip job
    const _fcb = args.pop();
    const _scb = args.pop();
    const opts = (args.length > 0) ? args.shift() : undefined;
    if (opts) {
      const timeout = opts.timeout || 0;
      const keys    = Object.keys(opts);
      const args    = keys.filter(key => key !== 'timeout').map(pairify(opts)).reduce((accum, pair) => accum.concat(pair), []);

      this.call.apply(this, [ _scb, _fcb, 'addjob', queue, job, timeout ].concat(args));
    } else {
      this.call(_scb, _fcb, 'addjob', queue, job, 0);
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

  getjob(queue: string, options?: GetJobOptions, scb?: ((dat: any) => any), fcb?: ((err: Error) => void)) {
    if (arguments.length < 3) {
      throw new Error("Not enough parameters in getjob");
    }
    const _args = [];
    for (let i = 0; i < arguments.length; i++) {
      _args.push(arguments[i]);
    }

    _args.shift(); // skip queue
    const _fcb = _args.pop();
    const _scb = _args.pop();
    const opts = (_args.length > 0) ? _args.shift() : undefined;
    const keys = Object.keys(opts || {});
    const args = keys.map(pairify(opts)).reduce((accum, pair) => accum.concat(pair), []);

    args.push('from', queue);

    this.call.apply(this, [ (dat: any) => {
      const jobs = dat as Buffer[][];
      const data = jobs.map((job: Buffer[]) => {
        return {
          queue: job[0].toString(),
          id:    job[1].toString(),
          body:  job[2],
        }
      });
      _scb(data);
    }, _fcb, 'getjob' ].concat(args))
  }

  infoAsync(): Promise<any> {
    return this.callAsync('info').then(parseInfo);
  }

  info(scb: ((dat: any) => any), fcb: ((err: Error) => void)) {
    this.call((dat: Buffer): void => {
      scb(parseInfo(dat.toString()));
    }, fcb, 'info');
  }

  qpeek(queue: string, count: number, scb: ((dat: any) => any), fcb: ((err: Error) => void)) {
    this.call((dat: any) => {
      const jobs = dat as Buffer[][];
      const data = jobs.map((job: Buffer[]) => {
        return {
          queue: job[0].toString(),
          id:    job[1].toString(),
          body:  job[2],
        }
      });
      scb(data);
    }, fcb, 'qpeek', queue, count);
  }

  qlen(queue: string, scb: ((dat: any) => any), fcb: ((err: Error) => void)) {
    this.call(scb, fcb, 'qlen', queue);
  }

  qscan(scb: ((dat: any) => any), fcb: ((err: Error) => void)) {
    this.call((dat: any) => {
      const rep = dat as Buffer[];
      if (rep.length === 2) {
        const tmp = dat as Buffer[][];
        const queues = tmp[1];
        scb(queues.map(x => x.toString()));
      } else {
        fcb(new Error("Error response of qscan"));
      }
    }, fcb, 'qscan');
  }

  jscan(queue: string, scb: ((dat: any) => any), fcb: ((err: Error) => void)) {
    this.call((dat: any) => {
      const rep = dat as Buffer[];
      if (rep.length === 2) {
        const tmp = dat as Buffer[][];
        const jobs = tmp[1] as Buffer[];
        scb(jobs.map(x => x.toString()));
      } else {
        fcb(new Error("Error response of qscan"));
      }
    }, fcb, 'jscan', 'queue', queue)
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
