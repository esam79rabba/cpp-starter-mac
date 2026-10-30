import * as vscode from 'vscode';
import type { Toolchain } from './toolchain';

export const DEBUG_TYPE = 'cppstarter';

/** Runs Apple's lldb-dap from the detected toolchain for every `cppstarter` debug session. */
export function registerDebugAdapter(
  context: vscode.ExtensionContext,
  getToolchain: () => Promise<Toolchain | undefined>,
): void {
  const factory: vscode.DebugAdapterDescriptorFactory = {
    async createDebugAdapterDescriptor() {
      const toolchain = await getToolchain();
      if (!toolchain) {
        throw new Error("Apple's C++ debugger (lldb-dap) was not found. Run 'C++: Check Tools'.");
      }
      return new vscode.DebugAdapterExecutable(toolchain.lldbDap);
    },
  };
  context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory(DEBUG_TYPE, factory));
}
