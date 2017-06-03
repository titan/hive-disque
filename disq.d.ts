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
    _operations: ((e: Error, param: any) => void)[];
    constructor(config: Config | (() => Config));
    connectAsync(): Promise<net.Socket>;
    connect(): net.Socket;
    callAsync(...params: any[]): Promise<any>;
    call(cb: ((e: Error, dat: any) => void), ...params: any[]): void;
    ackjobAsync(jobid: string, ...jobids: string[]): Promise<any>;
    ackjob(jobid: string, cb: ((err: Error, dat: any) => void)): void;
    ackjobs(jobids: string[], cb: ((erro: Error, dat: any) => void)): void;
    addjobAsync(queue: string, job: string | number | Buffer, options?: AddJobOptions): Promise<any>;
    addjob(queue: string, job: string | number | Buffer, options?: AddJobOptions, cb?: ((err: Error, dat: any) => void)): void;
    getjobAsync(queue: string, options?: GetJobOptions): Promise<GetJobResult[]>;
    getjob(queue: string, options?: GetJobOptions, cb?: ((err: Error, jobs: GetJobResult[]) => void)): void;
    infoAsync(): Promise<any>;
    info(cb: ((err: Error, dat: any) => void)): void;
    qpeek(queue: string, count: number, cb: ((err: Error, dat: any) => void)): void;
    qlen(queue: string, cb: ((err: Error, dat: any) => void)): void;
    qscan(cb: ((err: Error, dat: any) => void)): void;
    jscan(queue: string, cb: ((err: Error, dat: any) => void)): void;
    end(): void;
}
