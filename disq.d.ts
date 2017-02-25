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
    connectAsync(): Promise<net.Socket>;
    connect(scb: ((dat: any) => void), fcb: ((err: Error) => void)): net.Socket;
    callAsync(...params: any[]): Promise<any>;
    call(scb: ((dat: any) => void), fcb: ((err: Error) => void), ...params: any[]): void;
    ackjobAsync(jobid: string, ...jobids: string[]): Promise<any>;
    ackjob(jobid: string, scb: ((dat: any) => void), fcb: ((err: Error) => void)): void;
    ackjobs(jobids: string[], scb: ((dat: any) => void), fcb: ((err: Error) => void)): void;
    addjobAsync(queue: string, job: string | number | Buffer, options?: AddJobOptions): Promise<any>;
    addjob(queue: string, job: string | number | Buffer, options?: AddJobOptions, scb?: ((dat: any) => void), fcb?: ((err: Error) => void)): void;
    getjobAsync(queue: string, options?: GetJobOptions): Promise<GetJobResult[]>;
    getjob(queue: string, options?: GetJobOptions, scb?: any, fcb?: any): void;
    infoAsync(): Promise<any>;
    info(scb: any, fcb: any): void;
    end(): void;
}
