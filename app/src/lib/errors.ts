// Friendly messages for every custom program error in the IDL, plus the
// wallet / network failures players actually hit.
import idlJson from "../idl/marxy.json";

export const ERROR_MESSAGES: Record<string, string> = {
  Unauthorized: "Only the platform can do that.",
  MathOverflow: "That amount is too large.",
  ZeroLotAmount: "The lot amount must be greater than zero.",
  ZeroLotValue: "The lot value must be greater than zero.",
  ZeroCreditPrice: "The credit price must be greater than zero.",
  ZeroCountdown: "The countdown must be greater than zero.",
  ZeroOpeningWindow: "The opening window must be greater than zero.",
  SalesCloseInPast: "Sales close must be in the future.",
  ThresholdBelowMargin: "The sales minimum is below the platform's minimum margin.",
  CreditPriceTooHigh: "One credit would cost more than the 25% per-player cap.",
  InvalidLotMint: "That lot token doesn't match this auction.",
  InvalidUsdcMint: "That USDC token doesn't match this auction.",
  AuctionNotActive: "This auction has already ended.",
  SalesLocked: "Credit purchases are locked for this auction.",
  SalesStillOpen: "Credit sales are still open.",
  ZeroCredits: "Choose at least one credit.",
  CreditLimitExceeded: "That would take you over your credit cap for this auction.",
  PlatformCannotBid: "Platform wallets can't take part in auctions.",
  ThresholdNotMet: "Not enough credits were sold.",
  ThresholdAlreadyMet: "Enough credits were already sold.",
  AlreadyPostponed: "This auction was already moved once.",
  PostponeWindowClosed: "It's too late to move this auction.",
  PostponeWindowOpen: "The auction can't be settled yet.",
  InvalidNewSalesClose: "The new sales close must be in the future and later than the current one.",
  PostponeTooFar: "The new sales close is too far away (30 days at most).",
  AlreadyFunded: "The auction is already ready.",
  NotFunded: "The battle hasn't started yet.",
  FundingClosed: "The battle has already started.",
  FundingWindowOpen: "The auction can't be settled yet.",
  LotNotDeposited: "The lot wasn't deposited in full.",
  BattleNotStarted: "The battle hasn't started yet. Get ready!",
  NoCreditsLeft: "You have no credits left.",
  AlreadyLastBidder: "You're already the last bidder.",
  BiddingEnded: "Too late: the countdown has ended.",
  AuctionNotEnded: "The countdown is still running.",
  WrongRecipient: "Wrong recipient for this auction's outcome.",
  MissingAccount: "A required account is missing.",
  AuctionStillActive: "You can withdraw once the auction has ended.",
  InvalidGetReadySecs: "The get-ready period must be between 1 minute and 1 hour.",
};

/** Custom error code (6000 + index) → error name, from the IDL. */
export const ERROR_NAMES: Record<number, string> = Object.fromEntries(
  (idlJson.errors as { code: number; name: string }[]).map((e) => [e.code, e.name]),
);

export const NETWORK_HINT =
  "Is Phantom on devnet? Open Phantom → Settings → Developer Settings, turn on Testnet Mode and pick Solana Devnet.";

export interface FriendlyError {
  message: string;
  /** The failure looks like a wallet on the wrong network. */
  networkHint: boolean;
  code?: number;
  name?: string;
}

function collectText(err: unknown): string {
  if (err === null || err === undefined) return "";
  if (typeof err === "string") return err;
  const parts: string[] = [];
  const e = err as { message?: unknown; logs?: unknown; transactionLogs?: unknown; error?: unknown };
  if (typeof e.message === "string") parts.push(e.message);
  for (const logs of [e.logs, e.transactionLogs]) {
    if (Array.isArray(logs)) parts.push(...logs.map(String));
  }
  if (e.error && typeof e.error === "object") parts.push(collectText(e.error));
  if (parts.length === 0) parts.push(String(err));
  return parts.join("\n");
}

/** Finds the program's custom error code in an Anchor / web3.js error. */
export function extractErrorCode(err: unknown): number | undefined {
  const anchor = (err as { error?: { errorCode?: { number?: number } } })?.error?.errorCode?.number;
  if (typeof anchor === "number") return anchor;
  const text = collectText(err);
  const number = text.match(/Error Number: (\d+)/);
  if (number) return Number(number[1]);
  const hex = text.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (hex) return parseInt(hex[1], 16);
  const json = text.match(/"Custom":\s*(\d+)/);
  if (json) return Number(json[1]);
  return undefined;
}

const NETWORK_PATTERNS = [
  /blockhash not found/i,
  /Attempt to debit an account but found no record of a prior credit/i,
  /could not find program/i,
  /Program .* is not deployed/i,
  /AccountNotFound/i,
  /invalid account data for instruction/i,
];

export function friendlyError(err: unknown): FriendlyError {
  const code = extractErrorCode(err);
  if (code !== undefined && ERROR_NAMES[code]) {
    const name = ERROR_NAMES[code];
    return { message: ERROR_MESSAGES[name] ?? name, networkHint: false, code, name };
  }
  const text = collectText(err);
  if (/user rejected|rejected the request|declined/i.test(text)) {
    return { message: "You cancelled the transaction in your wallet.", networkHint: false };
  }
  if (/insufficient (funds|lamports)|0x1\b|insufficient funds for rent/i.test(text)) {
    return {
      message: "Not enough devnet SOL or test USDC for this transaction.",
      networkHint: false,
    };
  }
  if (code === 3012 || /AccountNotInitialized/.test(text)) {
    return { message: "You haven't joined this auction (no credits bought).", networkHint: false };
  }
  if (NETWORK_PATTERNS.some((re) => re.test(text))) {
    return { message: "The transaction failed on the network.", networkHint: true };
  }
  const first = text.split("\n")[0]?.slice(0, 200) || "Something went wrong.";
  return { message: first, networkHint: false };
}
