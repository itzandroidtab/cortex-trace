import * as vscode from 'vscode';
import {
    IDebugTracker,
    IDebuggerTrackerSubscribeArg,
    IDebuggerTrackerEvent,
    IDebuggerSubscription,
    DebugSessionStatus,
    OtherDebugEvents,
    DebugTracker
} from 'debug-tracker-vscode';

import * as jtrace from './traceProvider/jtrace';
import * as trace from './traceProvider/trace';

// assign the default trace that does nothing
let currentTrace: trace.Trace = new trace.DefaultTrace();
let periodicUpdates: boolean = false;
let timeoutId: NodeJS.Timeout;

const TRACKER_EXT_ID = 'mcu-debug.debug-tracker-vscode';
let trackerApi: IDebugTracker;
let trackerApiClientInfo: IDebuggerSubscription;

function onActiveFileChange(document: vscode.TextDocument | undefined) {
    // update the trace counts when we switch a different file
    currentTrace.showTraceCounts();
}

function updateDecorators() {
    // update the trace counts
    currentTrace.showTraceCounts();
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // package.json has been setup so any start of a debug session triggers our activation but
    // you can also start the extension manually
    context.subscriptions.push(
        vscode.commands.registerCommand('Cortex Trace.start', () => {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
            vscode.window.showInformationMessage('Hello from Cortex Trace.start!');
        }),

        vscode.window.onDidChangeActiveTextEditor((ev) => onActiveFileChange(ev?.document)),
    );

    // We can use either our own copy of a debug tracker or use a shared one.
    const doSubscribe = () => {
        const arg: IDebuggerTrackerSubscribeArg = {
            version: 1,
            body: {
                // We only support cortex-debug for now
                debuggers: ['cortex-debug'],
                handler: debugTrackerEventHandler,
                wantCurrentStatus: true,
                notifyAllEvents: false,
                // Make sure you set debugLevel to zero for production
                debugLevel: 2
            }
        };

        const result = trackerApi.subscribe && trackerApi.subscribe(arg);
        if (!result || (typeof result === 'string')) {
            vscode.window.showErrorMessage(`Subscription failed with extension ${TRACKER_EXT_ID} : ${result}`);
        } else {
            trackerApiClientInfo = result;
        }
    };

    const useLocal = false;
    if (useLocal) {
        trackerApi = new DebugTracker(context);
        doSubscribe();
    } else {
        DebugTracker.getTrackerExtension('Cortex Trace').then((ret) => {
            if (ret instanceof Error) {
                vscode.window.showErrorMessage(ret.message);
            } else {
                trackerApi = ret;
                doSubscribe();
            }
        });
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
    if (trackerApi && trackerApiClientInfo) {
        trackerApi.unsubscribe(trackerApiClientInfo.clientId);
    }
}

async function debugTrackerEventHandler(event: IDebuggerTrackerEvent) {
    if (event.event === DebugSessionStatus.Initializing) {
        // clear the updates
        if (periodicUpdates) {
            clearInterval(timeoutId);
            periodicUpdates = false;
        }

        // check if we have a valid session
        if (event.session !== undefined) {
            const config = event.session.configuration;

            // check what trace we should start
            switch (config.servertype) {
                case 'jlink':
                    // change to the jtrace
                    // todo: add support for custom speeds and trace types
                    currentTrace = new jtrace.Jtrace(
                        config.executable, config.device, 
                        config.interface, 'ETM', 20000
                    );
                    break;

                default:
                    // change to the default trace that does nothing
                    currentTrace = new trace.DefaultTrace();
                    break;
            }
        }
    }
    else if (event.event === DebugSessionStatus.Stopped) {
        // if we have a periodic update make sure to stop it
        if (periodicUpdates) {
            // turn off the periodic updates
            clearInterval(timeoutId);

            periodicUpdates = false;
        }

        currentTrace.stop();

        // update the trace
        if (currentTrace.update()) {
            // update the trace counts on the screen
            currentTrace.showTraceCounts();
        }
    }
    else if (event.event === DebugSessionStatus.Running) {
        currentTrace.start();

        // start the periodic update
        if (!periodicUpdates) {
            // update the trace counts on the screen every 250ms
            timeoutId = setInterval(updateDecorators, 250);

            periodicUpdates = true;
        }
    }
    else if (event.event === DebugSessionStatus.Terminated) {
        // terminate the current trace
        currentTrace.terminate();

        // clear the updates again
        if (periodicUpdates) {
            clearInterval(timeoutId);
            periodicUpdates = false;
        }
    }
}

