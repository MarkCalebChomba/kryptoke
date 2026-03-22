/**
 * Wallet derivation service.
 * Wraps the multi-chain blockchain service for HD wallet operations.
 * The same derivation path and address works on ALL EVM chains.
 */
export { deriveDepositAddress, deriveWallet } from "./blockchain";
