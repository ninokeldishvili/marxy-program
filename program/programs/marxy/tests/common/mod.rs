//! LiteSVM test harness for the Marxy program.
//!
//! Loads `target/deploy/marxy.so` (run `anchor build` first), creates a mock
//! USDC mint and a mock lot mint (both controlled by the admin, so "buying the
//! lot through Jupiter" is simulated by minting it to the admin) and lets tests
//! move the on-chain clock.
#![allow(dead_code, clippy::result_large_err)]

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{instruction::Instruction, system_instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::{types::FailedTransactionMetadata, LiteSVM},
    marxy::{
        error::MarxyError, instructions::CreateAuctionParams, Auction, Config, Participant,
        AUCTION_SEED, CONFIG_SEED, PARTICIPANT_SEED,
    },
    solana_instruction::error::InstructionError,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    solana_transaction_error::TransactionError,
    spl_associated_token_account_interface::address::get_associated_token_address_with_program_id,
    spl_token_2022_interface::instruction as token_ix,
};

pub const SPL_TOKEN: Pubkey = anchor_spl::token::ID;
pub const TOKEN_2022: Pubkey = anchor_spl::token_2022::ID;
pub const ATA_PROGRAM: Pubkey = anchor_spl::associated_token::ID;

pub const T0: i64 = 1_800_000_000;
pub const USDC_DECIMALS: u8 = 6;
pub const LOT_DECIMALS: u8 = 8;
pub const USDC: u64 = 1_000_000;

/// 0.5 BTC with 8 decimals.
pub const LOT_AMOUNT: u64 = 50_000_000;
/// Lot value 100 USDC, credit 1 USDC -> cap of 10 credits per player.
pub const LOT_VALUE: u64 = 100 * USDC;
/// Platform minimum margin: 23%.
pub const MIN_MARGIN_BPS: u16 = 2_300;
/// Get-ready period the test config starts with: 15 minutes.
pub const GET_READY_SECS: i64 = 15 * 60;
/// Lot value * (1 + 23%): 123 credits, so at least 13 capped players.
pub const SALES_MINIMUM: u64 = 123 * USDC;
pub const CREDIT_PRICE: u64 = USDC;
pub const MAX_CREDITS: u64 = 25;
pub const OPENING_WINDOW: i64 = 40;
pub const COUNTDOWN: i64 = 25;
/// Seconds between "now" and sales close for auctions created with `default_params`.
pub const LEAD_TIME: i64 = 3_600;

pub type TxResult = Result<(), FailedTransactionMetadata>;

pub struct Env {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub treasury: Keypair,
    pub usdc_mint: Pubkey,
    pub lot_mint: Pubkey,
    pub lot_program: Pubkey,
}

impl Env {
    /// Fresh SVM with the config initialized and a lot mint owned by `lot_program`.
    pub fn new(lot_program: Pubkey) -> Self {
        let mut env = Self::bare(lot_program);
        let ix = env.initialize_config_ix(&env.admin.pubkey());
        let admin = env.admin.insecure_clone();
        env.send(&[ix], &admin, &[]).expect("initialize_config");
        env
    }

    /// Fresh SVM with mints but without the config.
    pub fn bare(lot_program: Pubkey) -> Self {
        let mut svm = LiteSVM::new();
        let so_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/marxy.so");
        let bytes = std::fs::read(so_path)
            .unwrap_or_else(|_| panic!("{so_path} not found, run `anchor build` first"));
        svm.add_program(marxy::id(), &bytes).unwrap();

        let admin = Keypair::new();
        let treasury = Keypair::new();
        svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();
        svm.airdrop(&treasury.pubkey(), 1_000_000_000).unwrap();

        let mut env = Self {
            svm,
            admin,
            treasury,
            usdc_mint: Pubkey::default(),
            lot_mint: Pubkey::default(),
            lot_program,
        };
        env.set_time(T0);
        env.usdc_mint = env.create_mint(SPL_TOKEN, USDC_DECIMALS);
        env.lot_mint = env.create_mint(lot_program, LOT_DECIMALS);
        env
    }

    // ---------------------------------------------------------------- clock

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn set_time(&mut self, unix_timestamp: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = unix_timestamp;
        clock.slot += 1;
        self.svm.set_sysvar(&clock);
    }

    pub fn warp(&mut self, seconds: i64) {
        let now = self.now();
        self.set_time(now + seconds);
    }

    // ---------------------------------------------------------- transactions

    pub fn send(&mut self, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> TxResult {
        self.svm.expire_blockhash();
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend_from_slice(extra);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        self.svm.send_transaction(tx).map(|_| ())
    }

    // ---------------------------------------------------------------- tokens

    pub fn create_mint(&mut self, token_program: Pubkey, decimals: u8) -> Pubkey {
        let mint = Keypair::new();
        let rent = self.svm.minimum_balance_for_rent_exemption(82);
        let admin = self.admin.insecure_clone();
        let ixs = [
            system_instruction::create_account(
                &admin.pubkey(),
                &mint.pubkey(),
                rent,
                82,
                &token_program,
            ),
            token_ix::initialize_mint2(
                &token_program,
                &mint.pubkey(),
                &admin.pubkey(),
                None,
                decimals,
            )
            .unwrap(),
        ];
        self.send(&ixs, &admin, &[&mint]).expect("create mint");
        mint.pubkey()
    }

    pub fn ata(owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
        get_associated_token_address_with_program_id(owner, mint, token_program)
    }

    pub fn create_ata(&mut self, owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
        let ata = Self::ata(owner, mint, token_program);
        if !self.exists(&ata) {
            let admin = self.admin.insecure_clone();
            let ix = spl_associated_token_account_interface::instruction::create_associated_token_account_idempotent(
                &admin.pubkey(),
                owner,
                mint,
                token_program,
            );
            self.send(&[ix], &admin, &[]).expect("create ata");
        }
        ata
    }

    /// Mint `amount` of `mint` to `owner`'s ATA (the admin is every mint's authority).
    pub fn mint_to(&mut self, mint: &Pubkey, token_program: &Pubkey, owner: &Pubkey, amount: u64) {
        let ata = self.create_ata(owner, mint, token_program);
        let admin = self.admin.insecure_clone();
        let ix =
            token_ix::mint_to(token_program, mint, &ata, &admin.pubkey(), &[], amount).unwrap();
        self.send(&[ix], &admin, &[]).expect("mint_to");
    }

    /// Simulates the backend's Jupiter purchase: the lot lands in the admin's wallet.
    pub fn mint_lot_to_admin(&mut self, amount: u64) {
        let (mint, program, admin) = (self.lot_mint, self.lot_program, self.admin.pubkey());
        self.mint_to(&mint, &program, &admin, amount);
    }

    pub fn balance(&self, token_account: &Pubkey) -> u64 {
        match self.svm.get_account(token_account) {
            Some(acc) if acc.data.len() >= 72 => {
                u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
            }
            _ => 0,
        }
    }

    pub fn usdc_balance(&self, owner: &Pubkey) -> u64 {
        self.balance(&Self::ata(owner, &self.usdc_mint, &SPL_TOKEN))
    }

    pub fn lot_balance(&self, owner: &Pubkey) -> u64 {
        self.balance(&Self::ata(owner, &self.lot_mint, &self.lot_program))
    }

    pub fn lamports(&self, key: &Pubkey) -> u64 {
        self.svm.get_account(key).map(|a| a.lamports).unwrap_or(0)
    }

    pub fn exists(&self, key: &Pubkey) -> bool {
        self.svm.get_account(key).is_some_and(|a| a.lamports > 0)
    }

    /// A new wallet with SOL and `usdc` USDC in its ATA.
    pub fn new_player(&mut self, usdc: u64) -> Keypair {
        let player = Keypair::new();
        self.svm.airdrop(&player.pubkey(), 1_000_000_000).unwrap();
        let mint = self.usdc_mint;
        self.mint_to(&mint, &SPL_TOKEN, &player.pubkey(), usdc);
        player
    }

    // ------------------------------------------------------------------ PDAs

    pub fn config_pda() -> Pubkey {
        Pubkey::find_program_address(&[CONFIG_SEED], &marxy::id()).0
    }

    pub fn auction_pda(id: u64) -> Pubkey {
        Pubkey::find_program_address(&[AUCTION_SEED, &id.to_le_bytes()], &marxy::id()).0
    }

    pub fn participant_pda(id: u64, player: &Pubkey) -> Pubkey {
        let auction = Self::auction_pda(id);
        Pubkey::find_program_address(
            &[PARTICIPANT_SEED, auction.as_ref(), player.as_ref()],
            &marxy::id(),
        )
        .0
    }

    pub fn usdc_vault(&self, id: u64) -> Pubkey {
        Self::ata(&Self::auction_pda(id), &self.usdc_mint, &SPL_TOKEN)
    }

    pub fn lot_vault(&self, id: u64) -> Pubkey {
        Self::ata(&Self::auction_pda(id), &self.lot_mint, &self.lot_program)
    }

    fn fetch<T: AccountDeserialize>(&self, key: &Pubkey) -> Option<T> {
        let acc = self.svm.get_account(key)?;
        if acc.lamports == 0 {
            return None;
        }
        T::try_deserialize(&mut acc.data.as_slice()).ok()
    }

    pub fn config(&self) -> Config {
        self.fetch(&Self::config_pda()).expect("config")
    }

    pub fn auction(&self, id: u64) -> Auction {
        self.fetch(&Self::auction_pda(id)).expect("auction")
    }

    pub fn participant(&self, id: u64, player: &Pubkey) -> Option<Participant> {
        self.fetch(&Self::participant_pda(id, player))
    }

    // ---------------------------------------------------------- instructions

    pub fn initialize_config_ix(&self, admin: &Pubkey) -> Instruction {
        self.initialize_config_ix_with(admin, GET_READY_SECS)
    }

    pub fn initialize_config_ix_with(&self, admin: &Pubkey, get_ready_secs: i64) -> Instruction {
        Instruction::new_with_bytes(
            marxy::id(),
            &marxy::instruction::InitializeConfig {
                min_margin_bps: MIN_MARGIN_BPS,
                get_ready_secs,
            }
            .data(),
            marxy::accounts::InitializeConfig {
                admin: *admin,
                config: Self::config_pda(),
                treasury: self.treasury.pubkey(),
                usdc_mint: self.usdc_mint,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn update_config(
        &mut self,
        signer: &Keypair,
        new_admin: Option<Pubkey>,
        new_treasury: Option<Pubkey>,
        new_usdc_mint: Option<Pubkey>,
        new_min_margin_bps: Option<u16>,
        new_get_ready_secs: Option<i64>,
    ) -> TxResult {
        let ix = Instruction::new_with_bytes(
            marxy::id(),
            &marxy::instruction::UpdateConfig {
                new_admin,
                new_treasury,
                new_usdc_mint,
                new_min_margin_bps,
                new_get_ready_secs,
            }
            .data(),
            marxy::accounts::UpdateConfig {
                admin: signer.pubkey(),
                config: Self::config_pda(),
            }
            .to_account_metas(None),
        );
        self.send(&[ix], signer, &[])
    }

    /// Default lot parameters, with sales closing `LEAD_TIME` seconds from now.
    pub fn default_params(&self, auction_id: u64) -> CreateAuctionParams {
        CreateAuctionParams {
            auction_id,
            lot_amount: LOT_AMOUNT,
            lot_value: LOT_VALUE,
            credit_price: CREDIT_PRICE,
            sales_minimum: SALES_MINIMUM,
            sales_close: self.now() + LEAD_TIME,
            opening_window: OPENING_WINDOW,
            countdown: COUNTDOWN,
        }
    }

    pub fn create_auction_as(&mut self, signer: &Keypair, params: CreateAuctionParams) -> TxResult {
        let auction = Self::auction_pda(params.auction_id);
        let ix = Instruction::new_with_bytes(
            marxy::id(),
            &marxy::instruction::CreateAuction { params }.data(),
            marxy::accounts::CreateAuction {
                admin: signer.pubkey(),
                config: Self::config_pda(),
                auction,
                lot_mint: self.lot_mint,
                usdc_mint: self.usdc_mint,
                usdc_vault: Self::ata(&auction, &self.usdc_mint, &SPL_TOKEN),
                usdc_token_program: SPL_TOKEN,
                associated_token_program: ATA_PROGRAM,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], signer, &[])
    }

    pub fn create_auction(&mut self, params: CreateAuctionParams) -> TxResult {
        let admin = self.admin.insecure_clone();
        self.create_auction_as(&admin, params)
    }

    /// Create auction `id` with `default_params`, returning its sales close.
    pub fn create_default(&mut self, id: u64) -> i64 {
        let params = self.default_params(id);
        let close = params.sales_close;
        self.create_auction(params).expect("create_auction");
        close
    }

    /// Sales close + the 15-minute get-ready period.
    pub fn battle_start(&self, id: u64) -> i64 {
        let a = self.auction(id);
        a.sales_close + a.get_ready_secs
    }

    pub fn buy(&mut self, id: u64, player: &Keypair, credits: u64) -> TxResult {
        let ix = Instruction::new_with_bytes(
            marxy::id(),
            &marxy::instruction::BuyCredits { credits }.data(),
            marxy::accounts::BuyCredits {
                player: player.pubkey(),
                config: Self::config_pda(),
                auction: Self::auction_pda(id),
                participant: Self::participant_pda(id, &player.pubkey()),
                usdc_mint: self.usdc_mint,
                player_usdc: Self::ata(&player.pubkey(), &self.usdc_mint, &SPL_TOKEN),
                usdc_vault: self.usdc_vault(id),
                usdc_token_program: SPL_TOKEN,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], player, &[])
    }

    /// `count` new players each buying the per-player maximum.
    pub fn fill(&mut self, id: u64, count: usize) -> Vec<Keypair> {
        (0..count)
            .map(|_| {
                let p = self.new_player(MAX_CREDITS * CREDIT_PRICE);
                self.buy(id, &p, MAX_CREDITS).expect("buy");
                p
            })
            .collect()
    }

    pub fn postpone(&mut self, id: u64, signer: &Keypair, new_sales_close: i64) -> TxResult {
        let ix = Instruction::new_with_bytes(
            marxy::id(),
            &marxy::instruction::Postpone { new_sales_close }.data(),
            marxy::accounts::Postpone {
                admin: signer.pubkey(),
                config: Self::config_pda(),
                auction: Self::auction_pda(id),
            }
            .to_account_metas(None),
        );
        self.send(&[ix], signer, &[])
    }

    pub fn fund_as(&mut self, id: u64, signer: &Keypair) -> TxResult {
        let ix = Instruction::new_with_bytes(
            marxy::id(),
            &marxy::instruction::FundLot {}.data(),
            marxy::accounts::FundLot {
                admin: signer.pubkey(),
                config: Self::config_pda(),
                auction: Self::auction_pda(id),
                lot_mint: self.lot_mint,
                admin_lot_account: Self::ata(&signer.pubkey(), &self.lot_mint, &self.lot_program),
                lot_vault: self.lot_vault(id),
                lot_token_program: self.lot_program,
                associated_token_program: ATA_PROGRAM,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], signer, &[])
    }

    /// Simulate the backend: buy (mint) the lot to the admin, then fund.
    pub fn buy_lot_and_fund(&mut self, id: u64) -> TxResult {
        let amount = self.auction(id).lot_amount;
        self.mint_lot_to_admin(amount);
        let admin = self.admin.insecure_clone();
        self.fund_as(id, &admin)
    }

    pub fn bid(&mut self, id: u64, bidder: &Keypair) -> TxResult {
        let ix = Instruction::new_with_bytes(
            marxy::id(),
            &marxy::instruction::PlaceBid {}.data(),
            marxy::accounts::PlaceBid {
                bidder: bidder.pubkey(),
                auction: Self::auction_pda(id),
                participant: Self::participant_pda(id, &bidder.pubkey()),
            }
            .to_account_metas(None),
        );
        self.send(&[ix], bidder, &[])
    }

    /// Settle. `lot_recipient` is the wallet that should receive the lot; pass
    /// `None` for the refund-mode paths, which move no lot.
    pub fn settle(&mut self, id: u64, caller: &Keypair, lot_recipient: Option<Pubkey>) -> TxResult {
        let auction = Self::auction_pda(id);
        let treasury = self.treasury.pubkey();
        let (lot_mint, lot_vault, recipient_token, lot_program) = match lot_recipient {
            Some(r) => (
                Some(self.lot_mint),
                Some(self.lot_vault(id)),
                Some(Self::ata(&r, &self.lot_mint, &self.lot_program)),
                Some(self.lot_program),
            ),
            None => (None, None, None, None),
        };
        let ix = Instruction::new_with_bytes(
            marxy::id(),
            &marxy::instruction::Settle {}.data(),
            marxy::accounts::Settle {
                caller: caller.pubkey(),
                config: Self::config_pda(),
                auction,
                treasury,
                usdc_mint: self.usdc_mint,
                usdc_vault: self.usdc_vault(id),
                treasury_usdc: Some(Self::ata(&treasury, &self.usdc_mint, &SPL_TOKEN)),
                usdc_token_program: SPL_TOKEN,
                lot_mint,
                lot_vault,
                lot_recipient,
                lot_recipient_token: recipient_token,
                lot_token_program: lot_program,
                associated_token_program: ATA_PROGRAM,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], caller, &[])
    }

    pub fn withdraw(&mut self, id: u64, player: &Keypair) -> TxResult {
        let vault = self.usdc_vault(id);
        let player_usdc = Self::ata(&player.pubkey(), &self.usdc_mint, &SPL_TOKEN);
        let ix = Instruction::new_with_bytes(
            marxy::id(),
            &marxy::instruction::Withdraw {}.data(),
            marxy::accounts::Withdraw {
                player: player.pubkey(),
                config: Self::config_pda(),
                auction: Self::auction_pda(id),
                participant: Self::participant_pda(id, &player.pubkey()),
                treasury: self.treasury.pubkey(),
                usdc_mint: self.usdc_mint,
                usdc_vault: self.exists(&vault).then_some(vault),
                player_usdc: Some(player_usdc),
                usdc_token_program: SPL_TOKEN,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], player, &[])
    }

    pub fn cancel_as(&mut self, id: u64, signer: &Keypair) -> TxResult {
        let ix = Instruction::new_with_bytes(
            marxy::id(),
            &marxy::instruction::CancelAuction {}.data(),
            marxy::accounts::CancelAuction {
                admin: signer.pubkey(),
                config: Self::config_pda(),
                auction: Self::auction_pda(id),
                treasury: self.treasury.pubkey(),
                usdc_mint: self.usdc_mint,
                usdc_vault: self.usdc_vault(id),
                usdc_token_program: SPL_TOKEN,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], signer, &[])
    }

    pub fn cancel(&mut self, id: u64) -> TxResult {
        let admin = self.admin.insecure_clone();
        self.cancel_as(id, &admin)
    }

    /// Withdraw every player and check each gets back exactly what they paid.
    pub fn refund_all(&mut self, id: u64, players: &[Keypair]) {
        let price = self.auction(id).credit_price;
        for p in players {
            let paid = self
                .participant(id, &p.pubkey())
                .expect("participant")
                .credits_bought
                * price;
            let before = self.usdc_balance(&p.pubkey());
            self.withdraw(id, p).expect("withdraw");
            assert_eq!(self.usdc_balance(&p.pubkey()), before + paid, "full refund");
            assert!(
                self.participant(id, &p.pubkey()).is_none(),
                "participant closed"
            );
        }
    }
}

// --------------------------------------------------------------- assertions

pub fn custom_code(res: &TxResult) -> Option<u32> {
    match res {
        Err(f) => match &f.err {
            TransactionError::InstructionError(_, InstructionError::Custom(code)) => Some(*code),
            _ => None,
        },
        Ok(()) => None,
    }
}

#[track_caller]
pub fn assert_err(res: TxResult, expected: MarxyError) {
    let want = anchor_lang::error::ERROR_CODE_OFFSET + expected as u32;
    match &res {
        Ok(()) => panic!("expected {expected:?}, but the transaction succeeded"),
        Err(f) => assert_eq!(
            custom_code(&res),
            Some(want),
            "expected {expected:?} ({want}), got {:?}\nlogs:\n{}",
            f.err,
            f.meta.logs.join("\n")
        ),
    }
}

#[track_caller]
pub fn assert_anchor_err(res: TxResult, expected: anchor_lang::error::ErrorCode) {
    let want = expected as u32;
    assert_eq!(
        custom_code(&res),
        Some(want),
        "expected {expected:?}, got {res:?}"
    );
}

#[track_caller]
pub fn assert_ok(res: TxResult) {
    if let Err(f) = res {
        panic!(
            "transaction failed: {:?}\nlogs:\n{}",
            f.err,
            f.meta.logs.join("\n")
        );
    }
}
