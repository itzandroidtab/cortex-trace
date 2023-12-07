import * as vscode from 'vscode';
import * as trace from "./trace";
import * as jtraceDll from 'trace_debug';

class TraceLineInfo {
    public readonly file: string;
    public readonly line: number;

    constructor(file: string, line: number) {
        this.file = file;
        this.line = line;
    }
};

class MemoryMap {
    public readonly address: number;
    public readonly size: number;

    constructor(address: number, size: number) {
        this.address = address;
        this.size = size;
    }
}

/**
 * Trace implementation for the Jtrace
 */
export class Jtrace extends trace.Trace {
    private readonly interfaceId: number;
    private readonly speed: number;
 
    private readonly assemblyLineInfo: Array<TraceLineInfo>;
    private readonly memoryMap: Array<MemoryMap>;
    
    // flag if we connected to the target
    private isConnected: Boolean;

    // array with all the counters
    private counters: BigUint64Array;

    /**
     * Convert a interface id string to a interface id for the jlink dll
     * 
     * @param id 
     * @returns 
     */
    private interfaceStrToId(id: string): number {
        // get the lower case id and convert to a interface id
        switch (id.toLowerCase()) {
            default:
                // return jtag by default if we do not know the type
            case 'jtag':
                return 0;
            case 'swd':
                return 1;
            case 'cjtag':
                return 7;
        }
    }

    constructor(addr2line: string, executable: string, device: string, interfaceId: string, speed: number) {
        super();

        // clear the initialized flag
        this.isConnected = false;

        // set the speed and interface id for the first
        // connect sequence
        this.speed = speed;
        this.interfaceId = this.interfaceStrToId(interfaceId);

        // get the memory map and select the device
        this.memoryMap = jtraceDll.setAndGetMemoryMap(device);

        // check if we have a valid memory map
        if (!this.memoryMap.length) {
            // TODO: change this error
            throw new RangeError();
        }

        // create a array large enough for the sections
        // todo: support multiple sections
        this.counters = new BigUint64Array(this.memoryMap[0].size / 2);

        // read the assembly information for the current file
        // todo: support multiple sections
        this.assemblyLineInfo = jtraceDll.addr2line(0, "arm-none-eabi-addr2line.exe", executable);
        // this.assemblyLineInfo = new Array<TraceLineInfo>(0);
    }

    public override update() {
        // check if we are already connected
        if (!this.isConnected) {
            // init the and connect with the jlink
            if (!jtraceDll.init()) {
                // something went wrong. Do not start
                return false;
            }

            // connect with the target
            // TODO: add multiple section support + portwidth support
            if (!jtraceDll.connect(this.interfaceId, this.speed, 0x1, 4)) {
                return false;
            }

            // start the trace
            jtraceDll.start();

            this.isConnected = true;
        }

        return true;
    }

    public override start() {
        if (this.isConnected) {
            // start the trace
            jtraceDll.start();
        }
    }

    public override terminate() {
        if (this.isConnected) {
            // stop the trace
            jtraceDll.stop();

            // mark we are not connected anymore
            this.isConnected = false;
        }

        // disconnect and deinit the dll
        jtraceDll.deInit();
    }

    public override getInstructionCounts() {
        if (!this.isConnected) {
            return new Array<trace.InstructionTraceCount>(0);
        }

        // get the trace data
        // todo: support multiple sections
        jtraceDll.getInstStats(0, this.counters);

        // get the smallest value
        const size = Math.min(this.counters.length, this.assemblyLineInfo.length);

        // create a empty array for the return
        let ret = Array<trace.InstructionTraceCount>(size);

        // map the counter values with the assembly info
        for (let i = 0; i < size; i++) {
            if (this.assemblyLineInfo[i] === undefined) {
                ret[i] = new trace.InstructionTraceCount(
                    "", 0, BigInt(0)
                );
            }
            else {
                // push all our counters to the trace count
                ret[i] = (new trace.InstructionTraceCount(
                    this.assemblyLineInfo[i].file,
                    this.assemblyLineInfo[i].line,
                    this.counters[i]
                ));
            }
        }

        return ret;
    }

    public override getInstructionTrace() {
        return new Array<trace.InstructionTrace>(0);
    }
};