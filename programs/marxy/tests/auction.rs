//! Integration tests against the compiled program (`target/deploy/marxy.so`).

mod common;

use {
    anchor_lang::error::ErrorCode as AnchorError,
    common::*,
    marxy::{
        error::MarxyError, AuctionStatus, FUNDING_WINDOW_SECONDS, MAX_POSTPONE_SECONDS,
        POSTPONE_GRACE_SECONDS,
    },
    solana_keypair::Keypair,
    solana_signer::Signer,
};

const TX_FEE: u64 = 5_000;

type Mutation = Box<dyn Fn(&mut marxy::instructions::CreateAuctionParams)>;

/// 1. Full happy path (Token-2022 lot mint, SPL Token USDC).
#[test]
fn happy_path() {
    let mut env = Env::new(TOKEN_2022);
    let id = 1;
    let start = env.create_default(id);
    let a = env.auction(id);
    assert_eq!(a.max_credits_per_player, MAX_CREDITS);
    assert_eq!(a.status, AuctionStatus::Active);
    assert!(env.exists(&env.usdc_vault(id)));
    assert!(
        !env.exists(&env.lot_vault(id)),
        "nothing escrowed at creation"
    );

    // p0 buys in two purchases.
    let p0 = env.new_player(100 * USDC);
    assert_ok(env.buy(id, &p0, 4));
    assert_ok(env.buy(id, &p0, 6));
    assert_eq!(
        env.participant(id, &p0.pubkey()).unwrap().credits_bought,
        10
    );
    assert_eq!(env.usdc_balance(&p0.pubkey()), 90 * USDC);

    // p1 tries to exceed the cap, then buys the max, then can't buy more.
    let p1 = env.new_player(100 * USDC);
    assert_err(
        env.buy(id, &p1, MAX_CREDITS + 1),
        MarxyError::CreditLimitExceeded,
    );
    assert_ok(env.buy(id, &p1, MAX_CREDITS));
    assert_err(env.buy(id, &p1, 1), MarxyError::CreditLimitExceeded);
    assert_err(env.buy(id, &p0, 1), MarxyError::CreditLimitExceeded);

    let others = env.fill(id, 8);
    // A small player with a single credit.
    let small = env.new_player(10 * USDC);
    assert_ok(env.buy(id, &small, 1));

    let a = env.auction(id);
    assert_eq!(a.total_credits_sold, 101);
    assert_eq!(a.revenue, 101 * USDC);
    assert_eq!(a.participant_count, 11);
    assert_eq!(env.balance(&env.usdc_vault(id)), 101 * USDC);

    // Withdrawing while active (not postponed) is not allowed.
    assert_err(env.withdraw(id, &p0), MarxyError::AuctionStillActive);

    // Bidding before the start / before funding fails.
    assert_err(env.bid(id, &p0), MarxyError::NotFunded);

    // LOCK: buying at/after the start fails.
    env.set_time(start);
    assert_err(env.buy(id, &small, 1), MarxyError::SalesLocked);
    let late = env.new_player(10 * USDC);
    assert_err(env.buy(id, &late, 1), MarxyError::SalesLocked);
    assert_err(env.bid(id, &p0), MarxyError::NotFunded);

    // FUND: non-admin fails.
    let mallory = env.new_player(0);
    let (lot_mint, lot_program) = (env.lot_mint, env.lot_program);
    env.mint_to(&lot_mint, &lot_program, &mallory.pubkey(), LOT_AMOUNT);
    assert_err(env.fund_as(id, &mallory), MarxyError::Unauthorized);

    // The admin holding less than the lot amount fails.
    env.mint_lot_to_admin(LOT_AMOUNT - 1);
    let admin = env.admin.insecure_clone();
    assert!(
        env.fund_as(id, &admin).is_err(),
        "underfunded admin account"
    );
    assert!(!env.auction(id).funded);

    // The backend completes the purchase and funds.
    env.mint_lot_to_admin(1);
    env.warp(5);
    let funded_at = env.now();
    assert_ok(env.fund_as(id, &admin));
    let a = env.auction(id);
    assert!(a.funded);
    assert_eq!(a.funded_time, funded_at);
    assert_eq!(a.end_time, funded_at + OPENING_WINDOW);
    assert_eq!(env.balance(&env.lot_vault(id)), LOT_AMOUNT);
    assert_eq!(env.lot_balance(&admin.pubkey()), 0);
    env.mint_lot_to_admin(LOT_AMOUNT);
    assert_err(env.fund_as(id, &admin), MarxyError::AlreadyFunded);

    // BATTLE: a wallet without a participant account cannot bid.
    assert_anchor_err(env.bid(id, &late), AnchorError::AccountNotInitialized);

    env.warp(10);
    assert_ok(env.bid(id, &p0));
    let a = env.auction(id);
    assert_eq!(a.end_time, env.now() + COUNTDOWN, "bid resets countdown");
    assert_eq!(a.last_bidder, p0.pubkey());
    assert_eq!(env.participant(id, &p0.pubkey()).unwrap().credits_left, 9);
    assert_err(env.bid(id, &p0), MarxyError::AlreadyLastBidder);

    env.warp(20);
    assert_ok(env.bid(id, &small));
    assert_eq!(env.auction(id).end_time, env.now() + COUNTDOWN);
    assert_eq!(
        env.participant(id, &small.pubkey()).unwrap().credits_left,
        0
    );

    env.warp(1);
    assert_ok(env.bid(id, &p1));
    env.warp(1);
    assert_err(env.bid(id, &small), MarxyError::NoCreditsLeft);

    env.warp(23);
    assert_ok(env.bid(id, &others[0]));
    env.warp(3);
    assert_ok(env.bid(id, &p1));
    let a = env.auction(id);
    assert_eq!(a.bid_count, 5);
    assert_eq!(a.last_bidder, p1.pubkey());
    let end = a.end_time;
    assert_eq!(end, env.now() + COUNTDOWN);

    // Settling early fails.
    env.set_time(end - 1);
    assert_err(
        env.settle(id, &others[1], Some(p1.pubkey())),
        MarxyError::AuctionNotEnded,
    );

    // Bidding after expiry fails.
    env.set_time(end);
    assert_err(env.bid(id, &p0), MarxyError::BiddingEnded);

    // Wrong recipients / missing lot accounts fail.
    let treasury = env.treasury.pubkey();
    assert_err(
        env.settle(id, &others[1], Some(p0.pubkey())),
        MarxyError::WrongRecipient,
    );
    assert_err(
        env.settle(id, &others[1], Some(treasury)),
        MarxyError::WrongRecipient,
    );
    assert_err(env.settle(id, &others[1], None), MarxyError::MissingAccount);

    // WIN: anyone settles; lot to the last bidder, all USDC to the treasury.
    let vault_rent = env.lamports(&env.usdc_vault(id)) + env.lamports(&env.lot_vault(id));
    let treasury_lamports = env.lamports(&treasury);
    assert_ok(env.settle(id, &others[1], Some(p1.pubkey())));
    let a = env.auction(id);
    assert_eq!(a.status, AuctionStatus::Settled);
    assert_eq!(env.lot_balance(&p1.pubkey()), LOT_AMOUNT);
    assert_eq!(env.usdc_balance(&treasury), 101 * USDC);
    assert!(!env.exists(&env.usdc_vault(id)), "usdc vault closed");
    assert!(!env.exists(&env.lot_vault(id)), "lot vault closed");
    assert_eq!(
        env.lamports(&treasury),
        treasury_lamports + vault_rent,
        "vault rent to treasury"
    );
    // A second settle fails: the USDC vault no longer exists.
    assert_anchor_err(
        env.settle(id, &others[1], Some(p1.pubkey())),
        AnchorError::AccountNotInitialized,
    );

    // Unused credits burn: a loser's withdraw returns only the account rent.
    let rent = env.lamports(&Env::participant_pda(id, &p0.pubkey()));
    let sol_before = env.lamports(&p0.pubkey());
    let usdc_before = env.usdc_balance(&p0.pubkey());
    assert_ok(env.withdraw(id, &p0));
    assert_eq!(
        env.usdc_balance(&p0.pubkey()),
        usdc_before,
        "no USDC refund"
    );
    assert_eq!(env.lamports(&p0.pubkey()), sol_before + rent - TX_FEE);
    assert!(env.participant(id, &p0.pubkey()).is_none());
    assert_anchor_err(env.withdraw(id, &p0), AnchorError::AccountNotInitialized);

    // Winner closes too.
    assert_ok(env.withdraw(id, &p1));
    assert_eq!(env.auction(id).participant_count, 9);
}

/// 2. Sales minimum missed, no postponement.
#[test]
fn sales_minimum_missed() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 2;
    let start = env.create_default(id);
    let players = env.fill(id, 5);
    assert_eq!(env.auction(id).revenue, 50 * USDC);

    env.set_time(start);
    env.mint_lot_to_admin(LOT_AMOUNT);
    let admin = env.admin.insecure_clone();
    assert_err(env.fund_as(id, &admin), MarxyError::ThresholdNotMet);
    assert_err(env.bid(id, &players[0]), MarxyError::NotFunded);

    let caller = env.new_player(0);
    env.set_time(start + 10);
    assert_err(
        env.settle(id, &caller, None),
        MarxyError::PostponeWindowOpen,
    );
    env.set_time(start + POSTPONE_GRACE_SECONDS);
    assert_err(
        env.settle(id, &caller, None),
        MarxyError::PostponeWindowOpen,
    );

    env.set_time(start + POSTPONE_GRACE_SECONDS + 1);
    assert_err(
        env.postpone(id, &admin, env.now() + 3_600),
        MarxyError::PostponeWindowClosed,
    );
    assert_ok(env.settle(id, &caller, None));
    assert_eq!(env.auction(id).status, AuctionStatus::Refunding);
    assert_err(env.fund_as(id, &admin), MarxyError::AuctionNotActive);

    let treasury_lamports = env.lamports(&env.treasury.pubkey());
    let vault_rent = env.lamports(&env.usdc_vault(id));
    env.refund_all(id, &players);
    assert_eq!(env.auction(id).participant_count, 0);
    assert!(
        !env.exists(&env.usdc_vault(id)),
        "last refund closes the vault"
    );
    assert_eq!(
        env.lamports(&env.treasury.pubkey()),
        treasury_lamports + vault_rent
    );
}

/// 3. Postpone once, buyer exits, new buyers fill, auction runs normally.
#[test]
fn postpone_once_then_runs() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 3;
    let start = env.create_default(id);
    let early = env.fill(id, 3);
    let admin = env.admin.insecure_clone();

    // After the start (sales locked) but within the grace hour.
    env.set_time(start + 600);
    let latecomer = env.new_player(10 * USDC);
    assert_err(env.buy(id, &latecomer, 1), MarxyError::SalesLocked);

    // Non-admin, past, too far, earlier than current start.
    let now = env.now();
    assert_err(
        env.postpone(id, &early[0], now + 86_400),
        MarxyError::Unauthorized,
    );
    assert_err(env.postpone(id, &admin, now), MarxyError::InvalidNewStart);
    assert_err(
        env.postpone(id, &admin, start - 1),
        MarxyError::InvalidNewStart,
    );
    assert_err(
        env.postpone(id, &admin, now + MAX_POSTPONE_SECONDS + 1),
        MarxyError::PostponeTooFar,
    );

    let new_start = now + 2 * 86_400;
    assert_ok(env.postpone(id, &admin, new_start));
    let a = env.auction(id);
    assert!(a.postponed);
    assert_eq!(a.start_time, new_start);
    assert_eq!(a.original_start_time, start);
    assert_err(
        env.postpone(id, &admin, new_start + 60),
        MarxyError::AlreadyPostponed,
    );

    // Sales reopen; a buyer withdraws in full.
    let before = env.usdc_balance(&early[0].pubkey());
    assert_ok(env.withdraw(id, &early[0]));
    assert_eq!(env.usdc_balance(&early[0].pubkey()), before + 10 * USDC);
    let a = env.auction(id);
    assert_eq!(a.total_credits_sold, 20);
    assert_eq!(a.revenue, 20 * USDC);
    assert_eq!(a.participant_count, 2);

    // New buyers fill the minimum.
    let mut players = env.fill(id, 8);
    assert_ok(env.buy(id, &latecomer, 1));
    assert_eq!(env.auction(id).revenue, 101 * USDC);
    assert_err(
        env.postpone(id, &admin, new_start + 60),
        MarxyError::AlreadyPostponed,
    );

    env.set_time(new_start - 1);
    assert_err(env.buy_lot_and_fund(id), MarxyError::AuctionNotStarted);
    env.set_time(new_start);
    assert_err(env.buy(id, &latecomer, 1), MarxyError::SalesLocked);
    assert_err(env.withdraw(id, &early[1]), MarxyError::AuctionStillActive);
    assert_ok(env.fund_as(id, &admin));

    players.push(latecomer);
    env.warp(1);
    assert_ok(env.bid(id, &players[0]));
    env.warp(1);
    assert_ok(env.bid(id, &players[8]));
    let end = env.auction(id).end_time;
    env.set_time(end);
    let winner = players[8].pubkey();
    assert_ok(env.settle(id, &players[3], Some(winner)));
    assert_eq!(env.auction(id).status, AuctionStatus::Settled);
    assert_eq!(env.lot_balance(&winner), LOT_AMOUNT);
    assert_eq!(env.usdc_balance(&env.treasury.pubkey()), 101 * USDC);
}

/// 4. Postponed and still short: refunds from the new start.
#[test]
fn postponed_still_short() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 4;
    let start = env.create_default(id);
    let mut players = env.fill(id, 4);
    let admin = env.admin.insecure_clone();

    // Postpone before the start this time.
    env.set_time(start - 100);
    let new_start = start + 86_400;
    assert_ok(env.postpone(id, &admin, new_start));
    players.extend(env.fill(id, 2));

    let caller = env.new_player(0);
    env.set_time(new_start - 1);
    assert_err(env.settle(id, &caller, None), MarxyError::AuctionNotStarted);
    env.set_time(new_start);
    assert_err(env.buy_lot_and_fund(id), MarxyError::ThresholdNotMet);
    assert_ok(env.settle(id, &caller, None));
    assert_eq!(env.auction(id).status, AuctionStatus::Refunding);
    env.refund_all(id, &players);
    assert!(!env.exists(&env.usdc_vault(id)));
}

/// 5. Minimum met but the lot is not funded within 15 minutes.
#[test]
fn lot_not_funded_in_time() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 5;
    let start = env.create_default(id);
    let players = env.fill(id, 10);
    let admin = env.admin.insecure_clone();
    let caller = env.new_player(0);

    env.set_time(start);
    assert_err(
        env.postpone(id, &admin, start + 3_600),
        MarxyError::ThresholdAlreadyMet,
    );
    env.set_time(start + 60);
    assert_err(env.settle(id, &caller, None), MarxyError::FundingWindowOpen);
    env.set_time(start + FUNDING_WINDOW_SECONDS);
    assert_err(env.settle(id, &caller, None), MarxyError::FundingWindowOpen);

    env.set_time(start + FUNDING_WINDOW_SECONDS + 1);
    assert_err(env.buy_lot_and_fund(id), MarxyError::FundingWindowClosed);
    assert_ok(env.settle(id, &caller, None));
    assert_eq!(env.auction(id).status, AuctionStatus::Refunding);
    env.refund_all(id, &players);
    assert!(!env.exists(&env.usdc_vault(id)));
}

/// 6. Funded, but nobody bids during the opening window.
#[test]
fn funded_no_bids() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 6;
    let start = env.create_default(id);
    let players = env.fill(id, 10);

    env.set_time(start + 30);
    assert_ok(env.buy_lot_and_fund(id));
    let end = env.auction(id).end_time;
    assert_eq!(end, start + 30 + OPENING_WINDOW);

    let caller = env.new_player(0);
    env.set_time(end - 1);
    assert_err(
        env.settle(id, &caller, Some(env.treasury.pubkey())),
        MarxyError::AuctionNotEnded,
    );
    env.set_time(end);
    assert_err(env.bid(id, &players[0]), MarxyError::BiddingEnded);
    assert_err(
        env.settle(id, &caller, Some(players[0].pubkey())),
        MarxyError::WrongRecipient,
    );
    assert_err(env.settle(id, &caller, None), MarxyError::MissingAccount);

    let treasury = env.treasury.pubkey();
    assert_ok(env.settle(id, &caller, Some(treasury)));
    let a = env.auction(id);
    assert_eq!(a.status, AuctionStatus::Refunding);
    assert_eq!(
        env.lot_balance(&treasury),
        LOT_AMOUNT,
        "lot back to treasury"
    );
    assert!(!env.exists(&env.lot_vault(id)));
    assert_eq!(env.usdc_balance(&treasury), 0, "no revenue taken");
    assert_eq!(env.balance(&env.usdc_vault(id)), 100 * USDC);

    env.refund_all(id, &players);
    assert!(!env.exists(&env.usdc_vault(id)));
}

/// 7. Two players alternate until both run out of credits.
#[test]
fn credits_run_out() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 7;
    let start = env.create_default(id);
    let players = env.fill(id, 10);
    let (a, b) = (&players[0], &players[1]);

    env.set_time(start);
    assert_ok(env.buy_lot_and_fund(id));
    for round in 0..MAX_CREDITS {
        env.warp(COUNTDOWN - 1);
        assert_ok(env.bid(id, a));
        env.warp(COUNTDOWN - 1);
        assert_ok(env.bid(id, b));
        assert_eq!(
            env.participant(id, &a.pubkey()).unwrap().credits_left,
            MAX_CREDITS - round - 1
        );
    }
    let last_bid = env.now();
    assert_eq!(env.participant(id, &a.pubkey()).unwrap().credits_left, 0);
    assert_eq!(env.participant(id, &b.pubkey()).unwrap().credits_left, 0);
    assert_err(env.bid(id, a), MarxyError::NoCreditsLeft);
    assert_err(env.bid(id, b), MarxyError::NoCreditsLeft);

    let auction = env.auction(id);
    assert_eq!(auction.bid_count, 2 * MAX_CREDITS);
    assert_eq!(
        auction.end_time,
        last_bid + COUNTDOWN,
        "ends one countdown after last bid"
    );

    env.set_time(last_bid + COUNTDOWN - 1);
    assert_err(
        env.settle(id, &players[5], Some(b.pubkey())),
        MarxyError::AuctionNotEnded,
    );
    env.set_time(last_bid + COUNTDOWN);
    assert_ok(env.settle(id, &players[5], Some(b.pubkey())));
    assert_eq!(env.lot_balance(&b.pubkey()), LOT_AMOUNT);
}

/// 8. Cancellation and admin-only creation.
#[test]
fn cancel_rules() {
    let mut env = Env::new(SPL_TOKEN);

    // Non-admin cannot create.
    let mallory = env.new_player(0);
    let params = env.default_params(80);
    assert_err(
        env.create_auction_as(&mallory, params),
        MarxyError::Unauthorized,
    );

    let id = 81;
    let start = env.create_default(id);
    let players = env.fill(id, 3);
    assert_err(env.cancel_as(id, &mallory), MarxyError::Unauthorized);
    env.set_time(start - 1);
    assert_ok(env.cancel(id));
    assert_eq!(env.auction(id).status, AuctionStatus::Refunding);
    assert_err(env.buy(id, &players[0], 1), MarxyError::AuctionNotActive);
    assert_err(env.cancel(id), MarxyError::AuctionNotActive);
    env.refund_all(id, &players);
    assert!(!env.exists(&env.usdc_vault(id)));

    // Cancel after the start fails.
    let id = 82;
    let start = env.create_default(id);
    env.fill(id, 2);
    env.set_time(start);
    assert_err(env.cancel(id), MarxyError::AuctionAlreadyStarted);

    // Cancel with no participants closes the empty vault immediately.
    let id = 83;
    env.create_default(id);
    assert_ok(env.cancel(id));
    assert!(!env.exists(&env.usdc_vault(id)));
}

/// 9. Invalid creation parameters.
#[test]
fn invalid_create_params() {
    let mut env = Env::new(SPL_TOKEN);
    let base = env.default_params(9);

    let cases: Vec<(Mutation, MarxyError)> = vec![
        (Box::new(|p| p.countdown = 0), MarxyError::ZeroCountdown),
        (
            Box::new(|p| p.opening_window = 0),
            MarxyError::ZeroOpeningWindow,
        ),
        (
            Box::new(|p| p.start_time = T0 - 1),
            MarxyError::StartTimeInPast,
        ),
        (Box::new(|p| p.start_time = T0), MarxyError::StartTimeInPast),
        (
            Box::new(|p| p.credit_price = 0),
            MarxyError::ZeroCreditPrice,
        ),
        (
            Box::new(|p| p.sales_minimum = LOT_VALUE - 1),
            MarxyError::ThresholdBelowLotValue,
        ),
        // 10% of 100 USDC is 10 USDC; one credit at 10.000001 USDC is too expensive.
        (
            Box::new(|p| p.credit_price = LOT_VALUE / 10 + 1),
            MarxyError::CreditPriceTooHigh,
        ),
        (Box::new(|p| p.lot_amount = 0), MarxyError::ZeroLotAmount),
        (Box::new(|p| p.lot_value = 0), MarxyError::ZeroLotValue),
    ];
    for (mutate, expected) in cases {
        let mut p = base.clone();
        mutate(&mut p);
        assert_err(env.create_auction(p), expected);
    }

    // Exactly 10% of the lot value per credit is allowed (cap of 1 credit).
    let mut p = base.clone();
    p.credit_price = LOT_VALUE / 10;
    assert_ok(env.create_auction(p));
    assert_eq!(env.auction(9).max_credits_per_player, 1);

    // Cap is floored: 100 USDC * 10% / 3 USDC = 3 credits.
    let mut p = env.default_params(10);
    p.credit_price = 3 * USDC;
    assert_ok(env.create_auction(p));
    assert_eq!(env.auction(10).max_credits_per_player, 3);

    // Duplicate id fails.
    let p = env.default_params(10);
    assert!(env.create_auction(p).is_err());
}

/// 10. The admin and treasury are excluded; zero-credit purchases fail.
#[test]
fn platform_exclusion_and_zero_buy() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 11;
    env.create_default(id);
    let usdc = env.usdc_mint;
    let admin = env.admin.insecure_clone();
    let treasury = env.treasury.insecure_clone();
    env.mint_to(&usdc, &SPL_TOKEN, &admin.pubkey(), 10 * USDC);
    env.mint_to(&usdc, &SPL_TOKEN, &treasury.pubkey(), 10 * USDC);

    assert_err(env.buy(id, &admin, 1), MarxyError::PlatformCannotBid);
    assert_err(env.buy(id, &treasury, 1), MarxyError::PlatformCannotBid);

    let player = env.new_player(10 * USDC);
    assert_err(env.buy(id, &player, 0), MarxyError::ZeroCredits);
    assert!(env.participant(id, &player.pubkey()).is_none());
    assert_ok(env.buy(id, &player, 1));
}

/// Config: double init, admin-only updates, and the new treasury being honoured.
#[test]
fn config_management() {
    let mut env = Env::new(SPL_TOKEN);
    let c = env.config();
    assert_eq!(c.admin, env.admin.pubkey());
    assert_eq!(c.treasury, env.treasury.pubkey());
    assert_eq!(c.usdc_mint, env.usdc_mint);

    let admin = env.admin.insecure_clone();
    let ix = env.initialize_config_ix(&admin.pubkey());
    assert!(
        env.send(&[ix], &admin, &[]).is_err(),
        "config is a singleton"
    );

    let mallory = env.new_player(0);
    assert_err(
        env.update_config(&mallory, Some(mallory.pubkey()), None, None),
        MarxyError::Unauthorized,
    );

    // Rotate treasury and admin.
    let new_treasury = Keypair::new();
    let new_admin = Keypair::new();
    env.svm
        .airdrop(&new_admin.pubkey(), 10_000_000_000)
        .unwrap();
    assert_ok(env.update_config(
        &admin,
        Some(new_admin.pubkey()),
        Some(new_treasury.pubkey()),
        None,
    ));
    assert_eq!(env.config().admin, new_admin.pubkey());
    assert_eq!(env.config().treasury, new_treasury.pubkey());

    // The old admin lost its rights; the old treasury may now play.
    let params = env.default_params(12);
    assert_err(
        env.create_auction_as(&admin, params.clone()),
        MarxyError::Unauthorized,
    );
    assert_ok(env.create_auction_as(&new_admin, params));
    let old_treasury = env.treasury.insecure_clone();
    let usdc = env.usdc_mint;
    env.mint_to(&usdc, &SPL_TOKEN, &old_treasury.pubkey(), 10 * USDC);
    assert_ok(env.buy(12, &old_treasury, 1));
    env.mint_to(&usdc, &SPL_TOKEN, &new_admin.pubkey(), 10 * USDC);
    assert_err(env.buy(12, &new_admin, 1), MarxyError::PlatformCannotBid);

    env.svm
        .airdrop(&new_treasury.pubkey(), 1_000_000_000)
        .unwrap();
    env.mint_to(&usdc, &SPL_TOKEN, &new_treasury.pubkey(), 10 * USDC);
    assert_err(env.buy(12, &new_treasury, 1), MarxyError::PlatformCannotBid);
}

/// The lot mint cannot equal the USDC mint, and the USDC mint must match the config.
#[test]
fn mint_validation() {
    let mut env = Env::new(SPL_TOKEN);
    let usdc = env.usdc_mint;
    let real_lot = env.lot_mint;
    env.lot_mint = usdc;
    let params = env.default_params(20);
    assert_err(env.create_auction(params), MarxyError::InvalidLotMint);
    env.lot_mint = real_lot;

    let fake_usdc = env.create_mint(SPL_TOKEN, USDC_DECIMALS);
    env.usdc_mint = fake_usdc;
    let params = env.default_params(21);
    assert_err(env.create_auction(params), MarxyError::InvalidUsdcMint);
}

/// Someone pre-creating the lot vault ATA cannot block funding.
#[test]
fn precreated_lot_vault_does_not_block_funding() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 30;
    let start = env.create_default(id);
    let players = env.fill(id, 10);
    let auction = Env::auction_pda(id);
    let (mint, program) = (env.lot_mint, env.lot_program);
    env.create_ata(&auction, &mint, &program);

    env.set_time(start);
    assert_ok(env.buy_lot_and_fund(id));
    assert_eq!(env.balance(&env.lot_vault(id)), LOT_AMOUNT);

    env.warp(1);
    assert_ok(env.bid(id, &players[2]));
    env.warp(COUNTDOWN);
    assert_ok(env.settle(id, &players[0], Some(players[2].pubkey())));
    assert_eq!(env.lot_balance(&players[2].pubkey()), LOT_AMOUNT);
}

/// A Token-2022 lot mint with a transfer fee never delivers the full lot: funding fails.
#[test]
fn fee_on_transfer_lot_is_rejected() {
    use spl_token_2022_interface::{
        extension::{transfer_fee::instruction::initialize_transfer_fee_config, ExtensionType},
        instruction::initialize_mint2,
        state::Mint,
    };

    let mut env = Env::new(TOKEN_2022);
    // Replace the lot mint with a 1% transfer-fee mint.
    let mint = Keypair::new();
    let admin = env.admin.insecure_clone();
    let len = ExtensionType::try_calculate_account_len::<Mint>(&[ExtensionType::TransferFeeConfig])
        .unwrap();
    let rent = env.svm.minimum_balance_for_rent_exemption(len);
    let ixs = [
        anchor_lang::solana_program::system_instruction::create_account(
            &admin.pubkey(),
            &mint.pubkey(),
            rent,
            len as u64,
            &TOKEN_2022,
        ),
        initialize_transfer_fee_config(&TOKEN_2022, &mint.pubkey(), None, None, 100, u64::MAX)
            .unwrap(),
        initialize_mint2(
            &TOKEN_2022,
            &mint.pubkey(),
            &admin.pubkey(),
            None,
            LOT_DECIMALS,
        )
        .unwrap(),
    ];
    assert_ok(env.send(&ixs, &admin, &[&mint]));
    env.lot_mint = mint.pubkey();

    let id = 40;
    let start = env.create_default(id);
    env.fill(id, 10);
    env.set_time(start);
    assert_err(env.buy_lot_and_fund(id), MarxyError::LotNotDeposited);
    assert!(!env.auction(id).funded);
}

/// Settlement accounts must belong to this auction (e.g. a foreign treasury is rejected).
#[test]
fn settle_rejects_wrong_treasury() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 50;
    let start = env.create_default(id);
    let players = env.fill(id, 10);
    env.set_time(start);
    assert_ok(env.buy_lot_and_fund(id));
    env.warp(1);
    assert_ok(env.bid(id, &players[0]));
    env.warp(COUNTDOWN);

    let real = env.treasury.insecure_clone();
    env.treasury = Keypair::new();
    assert_err(
        env.settle(id, &players[1], Some(players[0].pubkey())),
        MarxyError::WrongRecipient,
    );
    env.treasury = real;
    assert_ok(env.settle(id, &players[1], Some(players[0].pubkey())));
}
