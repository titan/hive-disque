/// <reference types="node" />
import * as net from "net";
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
export declare class Disq {
    socket: net.Socket;
    config: (() => Config);
    _operations: [(param: any) => any, (e: Error) => void][];
    constructor(config: Config | (() => Config));
    connect(): Promise<net.Socket>;
    call(...params: any[]): Promise<any>;
    ackjob(jobid: string, ...jobids: string[]): Promise<any>;
    addjob(queue: string, job: string | number | Buffer, options?: AddJobOptions): Promise<any>;
    getjob(queue: string, options?: GetJobOptions): Promise<GetJobResult>;
    info(): Promise<any>;
}
