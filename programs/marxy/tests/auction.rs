//! Integration tests against the compiled program (`target/deploy/marxy.so`).

mod common;

use {
    anchor_lang::error::ErrorCode as AnchorError,
    common::*,
    marxy::{
        error::MarxyError, AuctionStatus, GET_READY_SECS, MAX_POSTPONE_SECONDS,
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
    let close = env.create_default(id);
    let a = env.auction(id);
    assert_eq!(a.max_credits_per_player, MAX_CREDITS);
    assert_eq!(a.sales_minimum, SALES_MINIMUM);
    assert_eq!(a.status, AuctionStatus::Active);
    assert!(env.exists(&env.usdc_vault(id)));
    assert!(
        !env.exists(&env.lot_vault(id)),
        "nothing escrowed at creation"
    );

    // SELL: p0 buys in two purchases.
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

    let others = env.fill(id, 11);
    // A small player with a single credit.
    let small = env.new_player(10 * USDC);
    assert_ok(env.buy(id, &small, 1));

    let a = env.auction(id);
    assert_eq!(a.total_credits_sold, 131);
    assert_eq!(a.revenue, 131 * USDC);
    assert_eq!(a.participant_count, 14);
    assert_eq!(env.balance(&env.usdc_vault(id)), 131 * USDC);

    // Withdrawing while active (not postponed) is not allowed.
    assert_err(env.withdraw(id, &p0), MarxyError::AuctionStillActive);

    // Bidding before funding fails; funding before sales close fails.
    assert_err(env.bid(id, &p0), MarxyError::NotFunded);
    // (The admin holds one unit short of the lot; the time check fires first.)
    env.mint_lot_to_admin(LOT_AMOUNT - 1);
    let admin = env.admin.insecure_clone();
    env.set_time(close - 1);
    assert_err(env.fund_as(id, &admin), MarxyError::SalesStillOpen);

    // LOCK: buying at/after sales close fails.
    env.set_time(close);
    assert_err(env.buy(id, &small, 1), MarxyError::SalesLocked);
    let late = env.new_player(10 * USDC);
    assert_err(env.buy(id, &late, 1), MarxyError::SalesLocked);
    assert_err(env.bid(id, &p0), MarxyError::NotFunded);

    // GET READY: a non-admin cannot fund.
    let mallory = env.new_player(0);
    let (lot_mint, lot_program) = (env.lot_mint, env.lot_program);
    env.mint_to(&lot_mint, &lot_program, &mallory.pubkey(), LOT_AMOUNT);
    assert_err(env.fund_as(id, &mallory), MarxyError::Unauthorized);

    // The admin holding less than the lot amount (wrong amount) fails.
    assert_eq!(env.lot_balance(&admin.pubkey()), LOT_AMOUNT - 1);
    assert!(
        env.fund_as(id, &admin).is_err(),
        "underfunded admin account"
    );
    assert!(!env.auction(id).funded);

    // The backend completes the purchase and funds early in the get-ready period.
    env.mint_lot_to_admin(1);
    env.warp(5);
    let funded_at = env.now();
    assert_ok(env.fund_as(id, &admin));
    let battle_start = close + GET_READY_SECS;
    let a = env.auction(id);
    assert!(a.funded);
    assert_eq!(a.funded_time, funded_at);
    assert_eq!(
        a.end_time,
        battle_start + OPENING_WINDOW,
        "opening window counts from battle start, not from funding"
    );
    assert_eq!(env.balance(&env.lot_vault(id)), LOT_AMOUNT);
    assert_eq!(env.lot_balance(&admin.pubkey()), 0);
    env.mint_lot_to_admin(LOT_AMOUNT);
    assert_err(env.fund_as(id, &admin), MarxyError::AlreadyFunded);

    // Funded, but bidding only opens at battle start.
    assert_err(env.bid(id, &p0), MarxyError::BattleNotStarted);
    env.set_time(battle_start - 1);
    assert_err(env.bid(id, &p0), MarxyError::BattleNotStarted);

    // BATTLE: a wallet without a participant account cannot bid.
    env.set_time(battle_start);
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
    assert_eq!(env.usdc_balance(&treasury), 131 * USDC);
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
    assert_eq!(env.auction(id).participant_count, 12);
}

/// 2. Sales minimum missed, no postponement.
#[test]
fn sales_minimum_missed() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 2;
    let close = env.create_default(id);
    // 12 capped players = 120 USDC: above the lot value, below lot value + 23%.
    let players = env.fill(id, 12);
    assert_eq!(env.auction(id).revenue, 120 * USDC);

    let caller = env.new_player(0);
    env.set_time(close - 1);
    assert_err(env.settle(id, &caller, None), MarxyError::SalesStillOpen);

    env.set_time(close);
    env.mint_lot_to_admin(LOT_AMOUNT);
    let admin = env.admin.insecure_clone();
    assert_err(env.fund_as(id, &admin), MarxyError::ThresholdNotMet);
    assert_err(env.bid(id, &players[0]), MarxyError::NotFunded);

    env.set_time(close + 10);
    assert_err(
        env.settle(id, &caller, None),
        MarxyError::PostponeWindowOpen,
    );
    env.set_time(close + POSTPONE_GRACE_SECONDS);
    assert_err(
        env.settle(id, &caller, None),
        MarxyError::PostponeWindowOpen,
    );

    env.set_time(close + POSTPONE_GRACE_SECONDS + 1);
    assert_err(
        env.postpone(id, &admin, env.now() + 3_600),
        MarxyError::PostponeWindowClosed,
    );
    assert_ok(env.settle(id, &caller, None));
    assert_eq!(env.auction(id).status, AuctionStatus::Refunding);
    assert_err(env.fund_as(id, &admin), MarxyError::AuctionNotActive);
    assert_err(env.bid(id, &players[0]), MarxyError::AuctionNotActive);

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
    let close = env.create_default(id);
    let early = env.fill(id, 3);
    let admin = env.admin.insecure_clone();

    // After sales close (sales locked) but within the grace hour.
    env.set_time(close + 600);
    let latecomer = env.new_player(10 * USDC);
    assert_err(env.buy(id, &latecomer, 1), MarxyError::SalesLocked);

    // Non-admin, now, earlier than current close, too far.
    let now = env.now();
    assert_err(
        env.postpone(id, &early[0], now + 86_400),
        MarxyError::Unauthorized,
    );
    assert_err(
        env.postpone(id, &admin, now),
        MarxyError::InvalidNewSalesClose,
    );
    assert_err(
        env.postpone(id, &admin, close - 1),
        MarxyError::InvalidNewSalesClose,
    );
    assert_err(
        env.postpone(id, &admin, now + MAX_POSTPONE_SECONDS + 1),
        MarxyError::PostponeTooFar,
    );

    let new_close = now + 2 * 86_400;
    assert_ok(env.postpone(id, &admin, new_close));
    let a = env.auction(id);
    assert!(a.postponed);
    assert_eq!(a.sales_close, new_close);
    assert_eq!(a.original_sales_close, close);
    assert_eq!(
        env.battle_start(id),
        new_close + GET_READY_SECS,
        "battle start moves"
    );
    assert_err(
        env.postpone(id, &admin, new_close + 60),
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
    let mut players = env.fill(id, 10);
    assert_ok(env.buy(id, &latecomer, 3));
    assert_eq!(env.auction(id).revenue, 123 * USDC);
    assert_err(
        env.postpone(id, &admin, new_close + 60),
        MarxyError::AlreadyPostponed,
    );

    env.set_time(new_close - 1);
    assert_err(env.buy_lot_and_fund(id), MarxyError::SalesStillOpen);
    env.set_time(new_close);
    assert_err(env.buy(id, &latecomer, 1), MarxyError::SalesLocked);
    assert_err(env.withdraw(id, &early[1]), MarxyError::AuctionStillActive);
    assert_ok(env.fund_as(id, &admin));
    assert_eq!(
        env.auction(id).end_time,
        new_close + GET_READY_SECS + OPENING_WINDOW
    );

    players.push(latecomer);
    assert_err(env.bid(id, &players[0]), MarxyError::BattleNotStarted);
    env.set_time(env.battle_start(id));
    assert_ok(env.bid(id, &players[0]));
    env.warp(1);
    assert_ok(env.bid(id, &players[10]));
    let end = env.auction(id).end_time;
    env.set_time(end);
    let winner = players[10].pubkey();
    assert_ok(env.settle(id, &players[3], Some(winner)));
    assert_eq!(env.auction(id).status, AuctionStatus::Settled);
    assert_eq!(env.lot_balance(&winner), LOT_AMOUNT);
    assert_eq!(env.usdc_balance(&env.treasury.pubkey()), 123 * USDC);
}

/// 4. Postponed and still short: refunds from the new sales close.
#[test]
fn postponed_still_short() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 4;
    let close = env.create_default(id);
    let mut players = env.fill(id, 4);
    let admin = env.admin.insecure_clone();

    // Postpone before sales close this time.
    env.set_time(close - 100);
    let new_close = close + 86_400;
    assert_ok(env.postpone(id, &admin, new_close));
    players.extend(env.fill(id, 2));

    let caller = env.new_player(0);
    env.set_time(new_close - 1);
    assert_err(env.settle(id, &caller, None), MarxyError::SalesStillOpen);
    env.set_time(new_close);
    assert_err(env.buy_lot_and_fund(id), MarxyError::ThresholdNotMet);
    assert_ok(env.settle(id, &caller, None));
    assert_eq!(env.auction(id).status, AuctionStatus::Refunding);
    env.refund_all(id, &players);
    assert!(!env.exists(&env.usdc_vault(id)));
}

/// 5. Minimum met but the lot is not funded by battle start.
#[test]
fn lot_not_funded_in_time() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 5;
    let close = env.create_default(id);
    let players = env.fill(id, 13);
    let admin = env.admin.insecure_clone();
    let caller = env.new_player(0);
    let battle_start = close + GET_READY_SECS;

    env.set_time(close);
    assert_err(
        env.postpone(id, &admin, close + 3_600),
        MarxyError::ThresholdAlreadyMet,
    );
    env.set_time(close + 60);
    assert_err(env.settle(id, &caller, None), MarxyError::FundingWindowOpen);
    env.set_time(battle_start - 1);
    assert_err(env.settle(id, &caller, None), MarxyError::FundingWindowOpen);

    env.set_time(battle_start);
    assert_err(env.buy_lot_and_fund(id), MarxyError::FundingClosed);
    assert_err(env.bid(id, &players[0]), MarxyError::NotFunded);
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
    let close = env.create_default(id);
    let players = env.fill(id, 13);

    env.set_time(close + 30);
    assert_ok(env.buy_lot_and_fund(id));
    let end = env.auction(id).end_time;
    assert_eq!(end, close + GET_READY_SECS + OPENING_WINDOW);

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
    assert_eq!(env.balance(&env.usdc_vault(id)), 130 * USDC);

    env.refund_all(id, &players);
    assert!(!env.exists(&env.usdc_vault(id)));
}

/// 7. Two players alternate until both run out of credits.
#[test]
fn credits_run_out() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 7;
    let close = env.create_default(id);
    let players = env.fill(id, 13);
    let (a, b) = (&players[0], &players[1]);

    env.set_time(close);
    assert_ok(env.buy_lot_and_fund(id));
    env.set_time(env.battle_start(id));
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
    let close = env.create_default(id);
    let players = env.fill(id, 3);
    assert_err(env.cancel_as(id, &mallory), MarxyError::Unauthorized);
    env.set_time(close - 1);
    assert_ok(env.cancel(id));
    assert_eq!(env.auction(id).status, AuctionStatus::Refunding);
    assert_err(env.buy(id, &players[0], 1), MarxyError::AuctionNotActive);
    assert_err(env.cancel(id), MarxyError::AuctionNotActive);
    env.refund_all(id, &players);
    assert!(!env.exists(&env.usdc_vault(id)));

    // Cancel at/after sales close fails.
    let id = 82;
    let close = env.create_default(id);
    env.fill(id, 2);
    env.set_time(close);
    assert_err(env.cancel(id), MarxyError::SalesLocked);

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
            Box::new(|p| p.sales_close = T0 - 1),
            MarxyError::SalesCloseInPast,
        ),
        (
            Box::new(|p| p.sales_close = T0),
            MarxyError::SalesCloseInPast,
        ),
        (
            Box::new(|p| p.credit_price = 0),
            MarxyError::ZeroCreditPrice,
        ),
        // Below lot value * (1 + 23%).
        (
            Box::new(|p| p.sales_minimum = SALES_MINIMUM - 1),
            MarxyError::ThresholdBelowMargin,
        ),
        (
            Box::new(|p| p.sales_minimum = LOT_VALUE),
            MarxyError::ThresholdBelowMargin,
        ),
        // The required minimum rounds up: 1.23 * 100.000001 USDC = 123.00000123 -> 123.000002.
        (
            Box::new(|p| {
                p.lot_value = LOT_VALUE + 1;
                p.sales_minimum = 123_000_001;
            }),
            MarxyError::ThresholdBelowMargin,
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

    // The rounded-up minimum itself is accepted.
    let mut p = env.default_params(11);
    p.lot_value = LOT_VALUE + 1;
    p.sales_minimum = 123_000_002;
    assert_ok(env.create_auction(p));

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

/// Config: double init, admin-only updates, the minimum margin, and rotation.
#[test]
fn config_management() {
    let mut env = Env::new(SPL_TOKEN);
    let c = env.config();
    assert_eq!(c.admin, env.admin.pubkey());
    assert_eq!(c.treasury, env.treasury.pubkey());
    assert_eq!(c.usdc_mint, env.usdc_mint);
    assert_eq!(c.min_margin_bps, MIN_MARGIN_BPS);

    let admin = env.admin.insecure_clone();
    let ix = env.initialize_config_ix(&admin.pubkey());
    assert!(
        env.send(&[ix], &admin, &[]).is_err(),
        "config is a singleton"
    );

    let mallory = env.new_player(0);
    assert_err(
        env.update_config(&mallory, Some(mallory.pubkey()), None, None, None),
        MarxyError::Unauthorized,
    );
    assert_err(
        env.update_config(&mallory, None, None, None, Some(0)),
        MarxyError::Unauthorized,
    );

    // Raising the margin to 30% only affects auctions created afterwards.
    env.create_default(13);
    assert_ok(env.update_config(&admin, None, None, None, Some(3_000)));
    assert_eq!(env.config().min_margin_bps, 3_000);
    assert_eq!(env.auction(13).sales_minimum, SALES_MINIMUM);
    let mut p = env.default_params(14);
    assert_err(
        env.create_auction(p.clone()),
        MarxyError::ThresholdBelowMargin,
    );
    p.sales_minimum = 130 * USDC;
    assert_ok(env.create_auction(p));
    // A zero margin allows a sales minimum equal to the lot value.
    assert_ok(env.update_config(&admin, None, None, None, Some(0)));
    let mut p = env.default_params(15);
    p.sales_minimum = LOT_VALUE;
    assert_ok(env.create_auction(p));

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
        None,
    ));
    assert_eq!(env.config().admin, new_admin.pubkey());
    assert_eq!(env.config().treasury, new_treasury.pubkey());
    assert_eq!(env.config().min_margin_bps, 0, "unchanged when None");

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
    let close = env.create_default(id);
    let players = env.fill(id, 13);
    let auction = Env::auction_pda(id);
    let (mint, program) = (env.lot_mint, env.lot_program);
    env.create_ata(&auction, &mint, &program);

    env.set_time(close);
    assert_ok(env.buy_lot_and_fund(id));
    assert_eq!(env.balance(&env.lot_vault(id)), LOT_AMOUNT);

    env.set_time(env.battle_start(id) + 1);
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
    let close = env.create_default(id);
    env.fill(id, 13);
    env.set_time(close);
    assert_err(env.buy_lot_and_fund(id), MarxyError::LotNotDeposited);
    assert!(!env.auction(id).funded);
}

/// Settlement accounts must belong to this auction (e.g. a foreign treasury is rejected).
#[test]
fn settle_rejects_wrong_treasury() {
    let mut env = Env::new(SPL_TOKEN);
    let id = 50;
    let close = env.create_default(id);
    let players = env.fill(id, 13);
    env.set_time(close);
    assert_ok(env.buy_lot_and_fund(id));
    env.set_time(env.battle_start(id));
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
