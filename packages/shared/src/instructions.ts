// Instruction builders shared by the browser, the worker and the scripts.
// Account names follow the IDL exactly.
import { BN } from "@anchor-lang/core";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createMintToInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";

import { auctionPda, configPda, participantPda, type MarxyProgram } from "./program";
import { DEFAULT_PUBKEY, type AuctionView, type ParticipantView } from "./types";

const pk = (s: string | PublicKey) => (typeof s === "string" ? new PublicKey(s) : s);

export function ata(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
}

export interface CreateAuctionArgs {
  id: bigint;
  admin: PublicKey;
  lotMint: PublicKey;
  usdcMint: PublicKey;
  usdcTokenProgram: PublicKey;
  lotAmount: bigint;
  lotValue: bigint;
  creditPrice: bigint;
  salesMinimum: bigint;
  salesClose: number;
  openingWindow: number;
  countdown: number;
}

export async function createAuctionIx(program: MarxyProgram, a: CreateAuctionArgs): Promise<TransactionInstruction> {
  const auction = auctionPda(a.id);
  return program.methods
    .createAuction({
      auctionId: new BN(a.id.toString()),
      lotAmount: new BN(a.lotAmount.toString()),
      lotValue: new BN(a.lotValue.toString()),
      creditPrice: new BN(a.creditPrice.toString()),
      salesMinimum: new BN(a.salesMinimum.toString()),
      salesClose: new BN(a.salesClose),
      openingWindow: new BN(a.openingWindow),
      countdown: new BN(a.countdown),
    })
    .accountsPartial({
      admin: a.admin,
      config: configPda(),
      auction,
      lotMint: a.lotMint,
      usdcMint: a.usdcMint,
      usdcVault: ata(auction, a.usdcMint, a.usdcTokenProgram),
      usdcTokenProgram: a.usdcTokenProgram,
    })
    .instruction();
}

/** Buy `credits`; creates the player's USDC account in the same transaction if it's missing. */
export async function buyCreditsIxs(
  program: MarxyProgram,
  a: { auction: AuctionView; player: PublicKey; credits: bigint; usdcTokenProgram: PublicKey; createUsdcAta?: boolean },
): Promise<TransactionInstruction[]> {
  const auction = pk(a.auction.address);
  const usdcMint = pk(a.auction.usdcMint);
  const playerUsdc = ata(a.player, usdcMint, a.usdcTokenProgram);
  const ixs: TransactionInstruction[] = [];
  if (a.createUsdcAta) {
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(a.player, playerUsdc, a.player, usdcMint, a.usdcTokenProgram));
  }
  ixs.push(
    await program.methods
      .buyCredits(new BN(a.credits.toString()))
      .accountsPartial({
        player: a.player,
        config: configPda(),
        auction,
        participant: participantPda(auction, a.player),
        usdcMint,
        playerUsdc,
        usdcVault: ata(auction, usdcMint, a.usdcTokenProgram),
        usdcTokenProgram: a.usdcTokenProgram,
      })
      .instruction(),
  );
  return ixs;
}

export async function placeBidIx(program: MarxyProgram, auction: AuctionView, bidder: PublicKey): Promise<TransactionInstruction> {
  const address = pk(auction.address);
  return program.methods
    .placeBid()
    .accountsPartial({ bidder, auction: address, participant: participantPda(address, bidder) })
    .instruction();
}

/** USDC a withdraw would return now (0 after a settled auction: unused credits burn). */
export function refundDue(auction: AuctionView, participant: ParticipantView, now: number): bigint {
  const full = participant.creditsBought * auction.creditPrice;
  if (auction.status === "refunding") return full;
  if (auction.status === "active" && auction.postponed && now < auction.salesClose) return full;
  return 0n;
}

export async function withdrawIxs(
  program: MarxyProgram,
  a: {
    auction: AuctionView;
    player: PublicKey;
    treasury: PublicKey;
    usdcTokenProgram: PublicKey;
    refund: bigint;
    vaultExists: boolean;
    playerUsdcExists: boolean;
  },
): Promise<TransactionInstruction[]> {
  const auction = pk(a.auction.address);
  const usdcMint = pk(a.auction.usdcMint);
  const playerUsdc = ata(a.player, usdcMint, a.usdcTokenProgram);
  const ixs: TransactionInstruction[] = [];
  const needsUsdc = a.refund > 0n;
  if (needsUsdc && !a.playerUsdcExists) {
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(a.player, playerUsdc, a.player, usdcMint, a.usdcTokenProgram));
  }
  ixs.push(
    await program.methods
      .withdraw()
      .accountsPartial({
        player: a.player,
        config: configPda(),
        auction,
        participant: participantPda(auction, a.player),
        treasury: a.treasury,
        usdcMint,
        usdcVault: a.vaultExists ? ata(auction, usdcMint, a.usdcTokenProgram) : null,
        playerUsdc: needsUsdc || a.playerUsdcExists ? playerUsdc : null,
        usdcTokenProgram: a.usdcTokenProgram,
      })
      .instruction(),
  );
  return ixs;
}

/** Who should receive the lot at settle: the last bidder, the treasury (no bids), or nobody (refund paths). */
export function lotRecipientOf(auction: AuctionView, treasury: PublicKey): PublicKey | null {
  if (!auction.funded) return null;
  return auction.bidCount > 0n && auction.lastBidder !== DEFAULT_PUBKEY ? pk(auction.lastBidder) : treasury;
}

export async function settleIx(
  program: MarxyProgram,
  a: { auction: AuctionView; caller: PublicKey; treasury: PublicKey; usdcTokenProgram: PublicKey; lotTokenProgram: PublicKey },
): Promise<TransactionInstruction> {
  const auction = pk(a.auction.address);
  const usdcMint = pk(a.auction.usdcMint);
  const lotMint = pk(a.auction.lotMint);
  const recipient = lotRecipientOf(a.auction, a.treasury);
  const hasWinner = a.auction.funded && a.auction.bidCount > 0n;
  return program.methods
    .settle()
    .accountsPartial({
      caller: a.caller,
      config: configPda(),
      auction,
      treasury: a.treasury,
      usdcMint,
      usdcVault: ata(auction, usdcMint, a.usdcTokenProgram),
      treasuryUsdc: hasWinner ? ata(a.treasury, usdcMint, a.usdcTokenProgram) : null,
      usdcTokenProgram: a.usdcTokenProgram,
      lotMint: recipient ? lotMint : null,
      lotVault: recipient ? ata(auction, lotMint, a.lotTokenProgram) : null,
      lotRecipient: recipient,
      lotRecipientToken: recipient ? ata(recipient, lotMint, a.lotTokenProgram) : null,
      lotTokenProgram: recipient ? a.lotTokenProgram : null,
    })
    .instruction();
}

export async function postponeIx(
  program: MarxyProgram,
  a: { auction: AuctionView; admin: PublicKey; newSalesClose: number },
): Promise<TransactionInstruction> {
  return program.methods
    .postpone(new BN(a.newSalesClose))
    .accountsPartial({ admin: a.admin, config: configPda(), auction: pk(a.auction.address) })
    .instruction();
}

export const isNativeSol = (mint: string | PublicKey) => pk(mint).equals(NATIVE_MINT);

/**
 * Funds the lot in one transaction: tops the admin's lot account up to the lot
 * amount, then `fund_lot` moves it into the auction's vault.
 * - Native SOL lots: wraps real SOL from the admin (transfer into the admin's
 *   wSOL account + sync).
 * - Demo-era test mints: mints the missing part (the admin is their authority).
 */
export async function fundLotIxs(
  program: MarxyProgram,
  a: { auction: AuctionView; admin: PublicKey; lotTokenProgram: PublicKey; adminHolds: bigint },
): Promise<TransactionInstruction[]> {
  const auction = pk(a.auction.address);
  const lotMint = pk(a.auction.lotMint);
  const adminLot = ata(a.admin, lotMint, a.lotTokenProgram);
  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(a.admin, adminLot, a.admin, lotMint, a.lotTokenProgram),
  ];
  const missing = a.auction.lotAmount - a.adminHolds;
  if (missing > 0n && isNativeSol(lotMint)) {
    ixs.push(
      SystemProgram.transfer({ fromPubkey: a.admin, toPubkey: adminLot, lamports: missing }),
      createSyncNativeInstruction(adminLot, a.lotTokenProgram),
    );
  } else if (missing > 0n) {
    ixs.push(createMintToInstruction(lotMint, adminLot, a.admin, missing, [], a.lotTokenProgram));
  }
  ixs.push(
    await program.methods
      .fundLot()
      .accountsPartial({
        admin: a.admin,
        config: configPda(),
        auction,
        lotMint,
        adminLotAccount: adminLot,
        lotVault: ata(auction, lotMint, a.lotTokenProgram),
        lotTokenProgram: a.lotTokenProgram,
      })
      .instruction(),
  );
  return ixs;
}

export async function initializeConfigIx(
  program: MarxyProgram,
  a: { admin: PublicKey; treasury: PublicKey; usdcMint: PublicKey; minMarginBps: number; getReadySecs: number },
): Promise<TransactionInstruction> {
  return program.methods
    .initializeConfig(a.minMarginBps, new BN(a.getReadySecs))
    .accountsPartial({ admin: a.admin, config: configPda(), treasury: a.treasury, usdcMint: a.usdcMint })
    .instruction();
}

/** Unwraps all of `owner`'s wrapped SOL: closing the wSOL account returns its lamports as SOL. */
export function unwrapSolIx(owner: PublicKey): TransactionInstruction {
  const wsol = ata(owner, NATIVE_MINT, TOKEN_PROGRAM_ID);
  return createCloseAccountInstruction(wsol, owner, owner, [], TOKEN_PROGRAM_ID);
}
