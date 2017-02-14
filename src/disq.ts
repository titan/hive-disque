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

  connect(): Promise<net.Socket> {
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

  call(...params): Promise<any> {
    return this.connect().then(() => {
        return new Promise((resolve, reject) => {
          this._operations.push([ resolve, reject ]);
          this.socket.write.apply(this.socket, [...params]);
        });
      });
  }

  ackjob(jobid: string, ...jobids: string[]): Promise<any> {
    return this.call.apply(this, [ 'ackjob', jobid ].concat(jobids));
  }

  addjob(queue: string, job: string | number | Buffer, options?: AddJobOptions): Promise<any> {
    if (options) {
      const timeout = options.timeout || 0;
      const keys    = Object.keys(options);
      const args    = keys.filter(key => key !== 'timeout').map(pairify(options)).reduce((accum, pair) => accum.concat(pair), []);

      return this.call.apply(this, [ 'addjob', queue, job, timeout ].concat(args));
    } else {
      return this.call('addjob', queue, job, 0);
    }
  }

  getjob(queue: string, options?: GetJobOptions): Promise<GetJobResult> {
    const keys = Object.keys(options || {});
    const args = keys.map(pairify(options)).reduce((accum, pair) => accum.concat(pair), []);

    args.push('from', queue);

    return this.call.apply(this, [ 'getjob' ].concat(args))
    .then(function(jobs) {
      return jobs.map(function(job) {
        return {
          queue: job[0],
          id:    job[1],
          body:  job[2],
        };
      });
    });
  }

  info(): Promise<any> {
    return this.call('info').then(parseInfo);
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
