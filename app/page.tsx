'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { autoConnect } from '@unicitylabs/sphere-sdk/connect/browser';
import { ERROR_CODES, SPHERE_NETWORKS } from '@unicitylabs/sphere-sdk/connect';

const WALLET_URL =
  process.env.NEXT_PUBLIC_SPHERE_WALLET_URL ||
  'https://sphere.unicity.network';

const SESSION_KEY = 'nexus-sphere-session';

const PERMISSIONS = [
  'identity:read',
  'balance:read',
  'history:read',
  'transfer:request',
  'sign:request',
] as const;

type Client = Awaited<ReturnType<typeof autoConnect>>['client'];

type Identity = {
  chainPubkey?: string;
  directAddress?: string;
  nametag?: string;
} | null;

type Asset = {
  symbol?: string;
  coinId?: string;
  decimals?: number;
  totalAmount?: string | number | bigint;
  amount?: string | number | bigint;
};

type HistoryItem = {
  symbol?: string;
  amount?: string | number;
  timestamp?: number | string;
  status?: string;
  type?: string;
  recipient?: string;
  sender?: string;
};

type InventoryItem = {
  sku: string;
  name: string;
  stock: number;
  daily: number;
  supplier: string;
  unitCost: number;
};

const INVENTORY: InventoryItem[] = [
  {
    sku: 'SKU-042',
    name: 'Creator Kit',
    stock: 14,
    daily: 4.1,
    supplier: 'Northstar Supply',
    unitCost: 18.5,
  },
  {
    sku: 'SKU-017',
    name: 'AI Sticker Pack',
    stock: 38,
    daily: 2.2,
    supplier: 'Pixel Forge',
    unitCost: 6.2,
  },
  {
    sku: 'SKU-103',
    name: 'Agent Badge',
    stock: 71,
    daily: 1.4,
    supplier: 'Northstar Supply',
    unitCost: 11.9,
  },
  {
    sku: 'SKU-088',
    name: 'Signal Cable',
    stock: 9,
    daily: 1.8,
    supplier: 'Relay Works',
    unitCost: 23.4,
  },
];

function short(value?: string | null, chars = 7) {
  if (!value) return '—';
  if (value.length <= chars * 2 + 1) return value;
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

function amountToNumber(value: unknown) {
  if (typeof value === 'bigint') return Number(value);

  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function humanAmount(asset?: Asset) {
  const value = amountToNumber(asset?.totalAmount ?? asset?.amount);
  const decimals =
    typeof asset?.decimals === 'number' ? asset.decimals : 0;

  const human = value / Math.pow(10, decimals);

  return human.toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

/**
 * Convert a human-readable token amount into base units.
 * This replaces the root SDK parseTokenAmount import so the
 * browser bundle does not pull the Node-only `ws` dependency.
 */
function parseTokenAmount(value: string, decimals: number): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error('Amount is required.');
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Enter a valid positive token amount.');
  }

  const [whole, fraction = ''] = normalized.split('.');

  if (fraction.length > decimals) {
    throw new Error(
      `Amount has more than ${decimals} decimal places.`
    );
  }

  const paddedFraction = fraction.padEnd(decimals, '0');

  const combined = `${whole}${paddedFraction}`
    .replace(/^0+(?=\d)/, '');

  return combined || '0';
}

function errorText(error: unknown) {
  const code = (error as { code?: number })?.code;

  if (code === ERROR_CODES.USER_REJECTED) {
    return 'You rejected the wallet approval.';
  }

  if (code === ERROR_CODES.WALLET_LOCKED) {
    return 'Sphere wallet is locked. Unlock it and try again.';
  }

  if (code === ERROR_CODES.INCOMPATIBLE_NETWORK) {
    return 'Network mismatch. Connect a Sphere wallet on testnet2.';
  }

  if (code === ERROR_CODES.PERMISSION_DENIED) {
    return 'The wallet did not grant the permission this action needs.';
  }

  if (code === ERROR_CODES.INTENT_OUTCOME_UNKNOWN) {
    return 'The wallet accepted the intent but the outcome is unknown. Do not retry the payment.';
  }

  if (code === ERROR_CODES.INSUFFICIENT_BALANCE) {
    return 'Insufficient spendable balance in the connected wallet.';
  }

  if (code === ERROR_CODES.INVALID_RECIPIENT) {
    return 'Recipient could not be resolved to a Unicity identity.';
  }

  return error instanceof Error
    ? error.message
    : 'Something went wrong.';
}

export default function Home() {
  const [client, setClient] = useState<Client | null>(null);
  const [identity, setIdentity] = useState<Identity>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [transport, setTransport] = useState<string>('—');
  const [locked, setLocked] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [busy, setBusy] = useState(false);

  const [toast, setToast] = useState<{
    kind: 'ok' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [recipient, setRecipient] = useState('@supplier');
  const [amount, setAmount] = useState('18.5');

  const [activity, setActivity] = useState<string[]>([
    'Agent initialized',
    'Inventory signal loaded',
    'Awaiting wallet connection',
  ]);

  const addActivity = useCallback((line: string) => {
    setActivity((items) => [line, ...items].slice(0, 6));
  }, []);

  const refresh = useCallback(
    async (c: Client) => {
      try {
        const [nextAssets, nextHistory] = await Promise.all([
          c.query('sphere_getAssets') as Promise<Asset[]>,
          c.query('sphere_getHistory') as Promise<HistoryItem[]>,
        ]);

        setAssets(Array.isArray(nextAssets) ? nextAssets : []);
        setHistory(Array.isArray(nextHistory) ? nextHistory : []);

        addActivity('Wallet state synchronized');
      } catch (error) {
        setToast({
          kind: 'error',
          text: errorText(error),
        });
      }
    },
    [addActivity]
  );

  const connect = useCallback(
    async (silent: boolean) => {
      setConnecting(true);

      try {
        const result = await autoConnect({
          dapp: {
            name: 'NEXUS — Autonomous Restock Agent',
            url: window.location.origin,
            icon: `${window.location.origin}/icon.svg`,
          },

          network: SPHERE_NETWORKS.testnet2,

          permissions: [...PERMISSIONS],

          walletUrl: WALLET_URL,

          silent,

          resumeSessionId:
            sessionStorage.getItem(SESSION_KEY) ?? undefined,
        });

        sessionStorage.setItem(
          SESSION_KEY,
          result.connection.sessionId
        );

        setClient(result.client);
        setIdentity(result.connection.identity);
        setTransport(result.transport);
        setLocked(Boolean(result.connection.locked));

        addActivity(`Sphere connected via ${result.transport}`);

        await refresh(result.client);

        return result;
      } catch (error) {
        if (!silent) {
          setToast({
            kind: 'error',
            text: errorText(error),
          });
        }

        return null;
      } finally {
        setConnecting(false);
      }
    },
    [addActivity, refresh]
  );

  useEffect(() => {
    void connect(true);
  }, [connect]);

  useEffect(() => {
    if (!client) return;

    const unsubs = [
      client.on('wallet:locked', () => {
        setLocked(true);
        addActivity('Wallet locked — agent paused');
      }),

      /*
       * IMPORTANT:
       * SDK 0.14.3 exposes the unlocked event payload
       * as unknown in the TypeScript event interface.
       * Accept unknown here and narrow it ourselves.
       */
      client.on('wallet:unlocked', (data: unknown) => {
        const payload = data as {
          identity?: Identity;
        };

        setLocked(false);
        setIdentity(payload.identity ?? identity);

        addActivity('Wallet unlocked — agent resumed');

        void refresh(client);
      }),

      client.on('wallet:disconnected', () => {
        setClient(null);
        setIdentity(null);

        sessionStorage.removeItem(SESSION_KEY);

        addActivity('Wallet disconnected');
      }),

      client.on('identity:changed', (data: unknown) => {
        const nextIdentity = data as Identity;

        setIdentity(nextIdentity);

        addActivity('Active wallet identity changed');

        void refresh(client);
      }),

      client.on('transfer:confirmed', () => {
        addActivity('Transfer confirmed on-chain');

        void refresh(client);
      }),

      client.on('transfer:incoming', () => {
        addActivity('Incoming transfer detected');

        void refresh(client);
      }),
    ];

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [client, identity, refresh, addActivity]);

  const uctAsset = useMemo(
    () =>
      assets.find(
        (asset) =>
          (asset.symbol || '').toUpperCase() === 'UCT'
      ) ?? assets[0],
    [assets]
  );

  const walletBalance = humanAmount(uctAsset);

  const recommendation = useMemo(() => {
    const scored = INVENTORY.map((item) => ({
      ...item,
      daysLeft: item.stock / item.daily,
      reorder: Math.max(
        0,
        Math.ceil(item.daily * 14 - item.stock)
      ),
    })).sort((a, b) => a.daysLeft - b.daysLeft)[0];

    return scored;
  }, []);

  const estimatedCost =
    recommendation.reorder * recommendation.unitCost;

  async function approvePayment() {
    if (!client) {
      setToast({
        kind: 'info',
        text: 'Connect your Sphere wallet first.',
      });

      return;
    }

    if (locked) {
      setToast({
        kind: 'info',
        text: 'Unlock Sphere before approving a payment.',
      });

      return;
    }

    if (!recipient.trim()) {
      setToast({
        kind: 'error',
        text: 'Enter a recipient identity.',
      });

      return;
    }

    setBusy(true);

    setToast({
      kind: 'info',
      text: 'Waiting for Sphere approval…',
    });

    addActivity(
      `Payment intent prepared: ${amount} UCT → ${recipient}`
    );

    try {
      const coinId = uctAsset?.coinId;

      if (!coinId) {
        throw new Error(
          'No UCT asset was returned by the wallet. Refresh your wallet and try again.'
        );
      }

      const decimals = uctAsset?.decimals;

      if (typeof decimals !== 'number') {
        throw new Error(
          'The wallet did not expose UCT decimals. Refresh and try again.'
        );
      }

      const rawAmount = parseTokenAmount(
        amount,
        decimals
      ).toString();

      const result = await client.intent('send', {
        to: recipient.trim(),
        amount: rawAmount,
        coinId: coinId.toLowerCase(),
        memo: `NEXUS restock • ${recommendation.sku}`,
      });

      addActivity(
        `Payment submitted: ${result?.status ?? 'completed'}`
      );

      setToast({
        kind: 'ok',
        text: result?.deliveryPending
          ? 'Payment committed; delivery is pending.'
          : 'Payment approved and submitted.',
      });

      await refresh(client);
    } catch (error) {
      const code = (error as { code?: number })?.code;

      if (code === ERROR_CODES.INTENT_OUTCOME_UNKNOWN) {
        addActivity(
          'Payment outcome unknown — reconciliation required'
        );
      } else {
        addActivity(
          'Payment intent declined or failed'
        );
      }

      setToast({
        kind: 'error',
        text: errorText(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function signAgent() {
    if (!client) {
      setToast({
        kind: 'info',
        text: 'Connect your Sphere wallet first.',
      });

      return;
    }

    setBusy(true);

    try {
      const message =
        `Authorize NEXUS Agent\n\n` +
        `Domain: ${window.location.origin}\n` +
        `Purpose: inventory optimization\n` +
        `Issued At: ${new Date().toISOString()}`;

      await client.intent('sign_message', {
        message,
      });

      addActivity(
        'Agent authorization signed by wallet'
      );

      setToast({
        kind: 'ok',
        text: 'Agent authorization signed successfully.',
      });
    } catch (error) {
      setToast({
        kind: 'error',
        text: errorText(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!client) return;

    await client.disconnect();

    setClient(null);
    setIdentity(null);

    sessionStorage.removeItem(SESSION_KEY);

    addActivity('Disconnected from Sphere');
  }

  return (
    <main className="shell">
      <div className="grid-bg" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">N</span>
          <span>NEXUS</span>
          <span className="brand-sub">AGENT OS</span>
        </div>

        <div className="top-actions">
          <span className="network-pill">
            <i /> TESTNET2
          </span>

          {client ? (
            <button
              className="wallet-chip"
              onClick={disconnect}
              title="Disconnect Sphere wallet"
            >
              <span className="status-dot" />

              {short(
                identity?.nametag
                  ? `@${identity.nametag}`
                  : identity?.directAddress,
                6
              )}
            </button>
          ) : (
            <button
              className="connect-btn"
              onClick={() => void connect(false)}
              disabled={connecting}
            >
              {connecting
                ? 'CONNECTING…'
                : 'CONNECT SPHERE'}
            </button>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span>01</span> AUTONOMOUS AGENTS / OPERATIONS
          </div>

          <h1>
            LET THE
            <br />
            <em>AGENT</em> WORK.
          </h1>

          <p>
            NEXUS turns inventory signals into decisions,
            then lets your Sphere wallet approve the money
            movement.
          </p>

          <div className="hero-actions">
            <button
              className="primary"
              onClick={signAgent}
              disabled={!client || busy}
            >
              AUTHORIZE AGENT <span>↗</span>
            </button>

            <a
              className="secondary"
              href="https://sphere.unicity.network"
              target="_blank"
              rel="noreferrer"
            >
              OPEN SPHERE ↗
            </a>
          </div>
        </div>

        <div className="hero-metric">
          <div className="metric-label">
            AGENT STATUS
          </div>

          <div className="metric-value">
            <span
              className={
                locked
                  ? 'warning-dot'
                  : 'live-dot'
              }
            />

            {locked
              ? 'PAUSED — WALLET LOCKED'
              : client
                ? 'LIVE / MONITORING'
                : 'OFFLINE'}
          </div>

          <div className="metric-foot">
            transport / {transport} · permissions /{' '}
            {PERMISSIONS.length}
          </div>
        </div>
      </section>

      {locked && (
        <div className="lock-banner">
          WALLET LOCKED — session is preserved. Unlock
          Sphere to resume agent queries and approvals.
        </div>
      )}

      {toast && (
        <button
          className={`toast ${toast.kind}`}
          onClick={() => setToast(null)}
        >
          {toast.text}
          <span>×</span>
        </button>
      )}

      <section className="dashboard">
        <div className="panel balance-panel">
          <div className="panel-head">
            <span>WALLET / LIQUIDITY</span>
            <b>01</b>
          </div>

          <div className="balance">
            {walletBalance}
            <small> UCT</small>
          </div>

          <div className="identity-row">
            <span>IDENTITY</span>

            <strong>
              {short(
                identity?.nametag
                  ? `@${identity.nametag}`
                  : identity?.directAddress,
                12
              )}
            </strong>
          </div>

          <div className="identity-row">
            <span>CHAIN PUBKEY</span>

            <strong>
              {short(identity?.chainPubkey, 10)}
            </strong>
          </div>

          <button
            className="refresh"
            onClick={() =>
              client && void refresh(client)
            }
            disabled={!client || busy}
          >
            ↻ SYNC WALLET
          </button>
        </div>

        <div className="panel agent-panel">
          <div className="panel-head">
            <span>AGENT / DECISION ENGINE</span>
            <b>02</b>
          </div>

          <div className="decision-tag">
            HIGH CONFIDENCE
          </div>

          <h2>
            REORDER {recommendation.name}
          </h2>

          <p className="decision-copy">
            Stock cover is{' '}
            <strong>
              {recommendation.daysLeft.toFixed(1)} days
            </strong>
            . At the current burn rate, the agent
            recommends{' '}
            <strong>
              {recommendation.reorder} units
            </strong>{' '}
            for a 14-day buffer.
          </p>

          <div className="decision-grid">
            <div>
              <span>SUPPLIER</span>
              <b>{recommendation.supplier}</b>
            </div>

            <div>
              <span>EST. COST</span>
              <b>
                {estimatedCost.toFixed(2)} UCT
              </b>
            </div>

            <div>
              <span>SKU</span>
              <b>{recommendation.sku}</b>
            </div>

            <div>
              <span>DAILY BURN</span>
              <b>
                {recommendation.daily} / day
              </b>
            </div>
          </div>

          <div className="agent-line">
            <span className="pulse" />

            Agent is waiting for a human-approved
            financial action.
          </div>
        </div>

        <div className="panel action-panel">
          <div className="panel-head">
            <span>APPROVAL / MONEY MOVE</span>
            <b>03</b>
          </div>

          <label>RECIPIENT IDENTITY</label>

          <input
            value={recipient}
            onChange={(e) =>
              setRecipient(e.target.value)
            }
            placeholder="@supplier"
          />

          <label>
            AMOUNT / UCT HUMAN UNITS
          </label>

          <div className="amount-input">
            <input
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value)
              }
            />

            <span>UCT</span>
          </div>

          <button
            className="approve"
            onClick={approvePayment}
            disabled={
              !client ||
              locked ||
              busy
            }
          >
            {busy
              ? 'WAITING FOR WALLET…'
              : 'APPROVE & SEND ↗'}
          </button>

          <p className="safety-note">
            Sphere shows the confirmation UI. NEXUS
            never sees your private keys and never
            silently spends funds.
          </p>
        </div>
      </section>

      <section className="lower-grid">
        <div className="panel inventory-panel">
          <div className="panel-head">
            <span>INVENTORY SIGNALS</span>
            <b>04</b>
          </div>

          <div className="table">
            <div className="table-row table-header">
              <span>ITEM</span>
              <span>STOCK</span>
              <span>BURN</span>
              <span>COVER</span>
            </div>

            {INVENTORY.map((item) => {
              const days =
                item.stock / item.daily;

              return (
                <div
                  className="table-row"
                  key={item.sku}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.sku}</small>
                  </span>

                  <span>{item.stock}</span>

                  <span>{item.daily}/d</span>

                  <span
                    className={
                      days < 7 ? 'risk' : ''
                    }
                  >
                    {days.toFixed(1)}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel activity-panel">
          <div className="panel-head">
            <span>AGENT ACTIVITY</span>
            <b>05</b>
          </div>

          <div className="activity-list">
            {activity.map((item, index) => (
              <div
                className="activity"
                key={`${item}-${index}`}
              >
                <span>
                  {String(index + 1).padStart(
                    2,
                    '0'
                  )}
                </span>

                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel history-panel">
          <div className="panel-head">
            <span>RECENT WALLET HISTORY</span>
            <b>06</b>
          </div>

          {history.length === 0 ? (
            <div className="empty">
              Connect Sphere to load transaction
              history.
            </div>
          ) : (
            history
              .slice(0, 4)
              .map((item, index) => (
                <div
                  className="history-row"
                  key={index}
                >
                  <span>
                    {item.type || 'TRANSFER'}
                  </span>

                  <strong>
                    {item.amount ?? '—'}{' '}
                    {item.symbol || 'UCT'}
                  </strong>

                  <small>
                    {item.status || 'recorded'}
                  </small>
                </div>
              ))
          )}
        </div>
      </section>

      <footer>
        <span>
          THE INTERNET IS BEING REBUILT FOR AI.
        </span>

        <span>
          BUILT WITH SPHERE CONNECT / UNICITY
        </span>
      </footer>
    </main>
  );
}
