// Program client, PDAs and account fetchers. Works in the browser and in Node.
import { AnchorProvider, BN, Program, type Wallet } from "@anchor-lang/core";
import { Buffer } from "buffer";
import { Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, Transaction, VersionedTransaction } from "@solana/web3.js";

import { toAuctionView, toParticipantView } from "./convert";
import { IDL, type Marxy } from "./idl";
import type { AuctionView, ParticipantView } from "./types";

export type MarxyProgram = Program<Marxy>;

export const programId = () => new PublicKey(IDL.address);

/** A wallet that can't sign: enough for reads and for building transactions. */
export function readonlyWallet(publicKey: PublicKey = Keypair.generate().publicKey): Wallet {
  return {
    publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(): Promise<T> => {
      throw new Error("read-only wallet");
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(): Promise<T[]> => {
      throw new Error("read-only wallet");
    },
  } as unknown as Wallet;
}

/** Anything that can sign like a wallet (wallet-adapter's AnchorWallet, or `readonlyWallet()`). */
export type SigningWallet = Pick<Wallet, "publicKey" | "signTransaction" | "signAllTransactions">;

export function getProgram(connection: Connection, wallet: SigningWallet = readonlyWallet()): MarxyProgram {
  const provider = new AnchorProvider(connection, wallet as Wallet, { commitment: "confirmed" });
  return new Program<Marxy>(IDL, provider);
}

export function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId())[0];
}

export function auctionPda(id: bigint | number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("auction"), new BN(id.toString()).toArrayLike(Buffer, "le", 8)],
    programId(),
  )[0];
}

export function participantPda(auction: PublicKey, player: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("participant"), auction.toBuffer(), player.toBuffer()],
    programId(),
  )[0];
}

export async function fetchAuction(program: MarxyProgram, id: bigint | number): Promise<AuctionView | null> {
  const address = auctionPda(id);
  const raw = await program.account.auction.fetchNullable(address);
  return raw ? toAuctionView(address, raw) : null;
}

export async function fetchAllAuctions(program: MarxyProgram): Promise<AuctionView[]> {
  const all = await program.account.auction.all();
  return all
    .map((a) => toAuctionView(a.publicKey, a.account))
    .sort((x, y) => (x.id < y.id ? 1 : x.id > y.id ? -1 : 0));
}

export async function fetchParticipant(
  program: MarxyProgram,
  auction: PublicKey,
  player: PublicKey,
): Promise<ParticipantView | null> {
  const address = participantPda(auction, player);
  const raw = await program.account.participant.fetchNullable(address);
  return raw ? toParticipantView(address, raw) : null;
}

/** Every participant account of `player` (the `player` field sits at byte 8 + 32). */
export async function fetchParticipantsOf(program: MarxyProgram, player: PublicKey): Promise<ParticipantView[]> {
  const all = await program.account.participant.all([{ memcmp: { offset: 40, bytes: player.toBase58() } }]);
  return all.map((p) => toParticipantView(p.publicKey, p.account));
}

/** The on-chain clock (`Clock::unix_timestamp`), the time the program checks against. */
export async function chainUnixTime(connection: Connection): Promise<number> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, "confirmed");
  if (!info) throw new Error("clock sysvar not found");
  return Number(info.data.readBigInt64LE(32));
}
