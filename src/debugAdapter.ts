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

/**
 * F5 or Run > Start Debugging while the focus is not in a C++ editor (for example in the
 * program's terminal) reaches VS Code's own debug start. Without a launch.json VS Code then
 * resolves an empty config, or the debugger picker's default, for this type. Such a config has
 * no `program`: run the extension's own build-then-debug (or Ctrl+F5 run) flow instead and
 * return undefined, so VS Code starts no second session and never offers to create a
 * launch.json. Configs the extension builds itself carry `program` and pass through unchanged.
 */
export function registerDebugConfigurationProvider(context: vscode.ExtensionContext): void {
  const provider: vscode.DebugConfigurationProvider = {
    resolveDebugConfiguration(_folder, config) {
      if (typeof config.program === 'string' && config.program !== '') return config;
      const command = config.noDebug ? 'cppStarter.runWithoutDebugging' : 'cppStarter.startDebugging';
      // Not awaited: that flow starts its own debug session, outside this resolution.
      void vscode.commands.executeCommand(command);
      return undefined;
    },
  };
  context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider(DEBUG_TYPE, provider));
}
