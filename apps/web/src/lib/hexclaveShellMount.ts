/** AuthGate always calls useUser(); the Hexclave provider must mount whenever the gate is active. */
export function shouldMountHexclaveAuthShell(authEnabled: boolean, hasHexclaveApp: boolean): boolean {
  return authEnabled && hasHexclaveApp;
}