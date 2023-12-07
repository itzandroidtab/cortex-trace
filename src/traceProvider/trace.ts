import * as vscode from 'vscode';

/**
 * Data class to store trace instruction information
 */
export class InstructionTrace {
    public readonly instruction: number;

    constructor(instruction: number) {
        this.instruction = instruction;
    }
};

/**
 * Data class to store trace instruction count information
 */
export class InstructionTraceCount {
    public readonly file: string;
    public readonly line: number;
    public readonly count: BigInt;

    constructor(file: string, line: number, count: BigInt) {
        this.file = file;
        this.line = line;
        this.count = count;
    }
};

/**
 * Base class for all trace tools
 */
export abstract class Trace {
    // used for the decorators
    private readonly counterColor = '#c42525';
    private readonly decorationType = vscode.window.createTextEditorDecorationType({});

    /**
     * Start a trace. Called after the target started running
     * 
     * @param returns if successfull start
     */
    public abstract start(): void;

    /**
     * Start/update the trace.
     * 
     * @param returns if successfull start
     */
    public abstract update(): boolean;

    /**
     * Stop the trace. Called when the target is paused/stopped
     * 
     * @param returns if successfull start
     */
    public abstract stop(): void;

    /**
     * Terminate the trace. Called to close anything left open
     */
    public abstract terminate(): void;

    /**
     * Get the instruction counts the trace. (if not supported 
     * it should return a empty array)
     */
    public abstract getInstructionCounts(): Array<InstructionTraceCount>;

    /**
     * Get the instruction trace of the trace tool. (if not 
     * supported it should return a empty array)
     */
    public abstract getInstructionTrace(): Array<InstructionTrace>;

    /**
     * Construct the trace class
     */
    constructor() { }

    /**
     * Show the trace counts in all the open files
     */
    public showTraceCounts() {
        // get the instruction counts
        const instructionCounts = this.getInstructionCounts();

        // create a array of maps for every line of every open editor
        let lineInfo = new Array<Map<number, Array<BigInt>>>(vscode.window.visibleTextEditors.length);

        // create a map for every open file
        for (let i = 0; i < vscode.window.visibleTextEditors.length; i++) {
            lineInfo[i] = new Map<number, Array<BigInt>>;
        }

        // apply every instruction counter to every open file
        for (const instructionCount of instructionCounts) {
            // check if the current instruction has any counts
            if (instructionCount.count === BigInt(0)) {
                continue;
            }

            // check what text editors we should update
            for (const [index, editor] of vscode.window.visibleTextEditors.entries()) {
                // check if the current counter value is for the current file
                if (editor.document.uri.fsPath !== vscode.Uri.file(instructionCount.file).fsPath) {
                    continue;
                }

                // we have a match. Add it to the array
                if (lineInfo[index].has(instructionCount.line)) {
                    let arr = lineInfo[index].get(instructionCount.line);

                    if (arr !== undefined) {
                        arr.push(instructionCount.count);
                    }
                }
                else {
                    let arr = new Array<BigInt>;
                    arr.push(instructionCount.count);

                    // first entry. 
                    lineInfo[index].set(instructionCount.line, arr);
                }
            }
        }

        // apply the decorators
        for (const [index, editor] of vscode.window.visibleTextEditors.entries()) {
            const decorators = new Array<vscode.DecorationOptions>;

            for (let [line, counts] of lineInfo[index]) {
                let str = "";

                for (let i = 0; i < counts.length; i++) {
                    str += counts[i].toString() + " ";
                }

                decorators.push({
                    range: new vscode.Range(
                        new vscode.Position(line - 1, 1024),
                        new vscode.Position(line - 1, 1024)
                    ),
                    renderOptions: {
                        after: {
                            contentText: str,
                            margin: '0 0 0 1rem'
                        },
                        dark: { after: { color: this.counterColor } },
                        light: { after: { color: this.counterColor } }
                    }
                });
            }

            editor.setDecorations(this.decorationType, decorators);
        }
    }
};

/**
 * Empty class for default initialization
 */
export class DefaultTrace extends Trace {
    constructor() {
        super();
    }

    /**
     * Start a trace. Called after the target started running
     * 
     * @param returns if successfull start
     */
    public start() { }

    /**
     * Start/update the trace.
     * 
     * @param returns if successfull start
     */
    public update() {
        return false;
    }

    /**
     * Stop the trace. Called when the target is paused/stopped
     * 
     * @param returns if successfull start
     */
    public stop() { }

    /**
     * Terminate the trace. Called to close anything left open
     */
    public terminate() {
        return;
    }

    /**
     * Get the instruction counts the trace. (if not supported 
     * it should return a empty array)
     */
    public getInstructionCounts() {
        return new Array<InstructionTraceCount>(0);
    }

    /**
     * Get the instruction trace of the trace tool. (if not 
     * supported it should return a empty array)
     */
    public getInstructionTrace() {
        return new Array<InstructionTrace>(0);
    }
};