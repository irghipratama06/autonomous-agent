# NEXUS — Autonomous Restock Agent

A mobile-friendly, English-language hackathon MVP for the **Autonomous Agents** track.

NEXUS monitors inventory signals, produces a reorder recommendation, and lets the user approve the resulting payment through **Sphere Connect**. The app never receives the user's private keys and never silently spends funds.

> **Don't ask AI what to do. Let AI do it — with human-controlled money.**

## Built with

- Next.js 15 + React 19 + TypeScript
- `@unicitylabs/sphere-sdk` 0.14.3
- Sphere Connect browser `autoConnect`
- Sphere `testnet2`
- Vercel-ready static/browser dApp architecture
- Responsive mobile-first UI

## What the demo shows

1. Connect a Sphere wallet.
2. Load wallet identity, balance, and transaction history.
3. Authorize the NEXUS agent with a wallet signature.
4. Analyze the demo inventory automatically.
5. Generate a high-confidence restock recommendation.
6. Prepare a payment to the supplier.
7. Let Sphere display the final wallet confirmation.
8. Handle locked wallets and unknown payment outcomes safely.

## No-terminal deployment

You do **not** need to run a terminal to publish this project.

### GitHub

1. Create a new empty GitHub repository, for example `nexus-autonomous-agent`.
2. On GitHub, open the repository and choose **Add file → Upload files**.
3. Upload the project files from this package, keeping the folder structure intact.
4. Commit the files to the `main` branch.

### Vercel

1. Open Vercel and choose **Add New → Project**.
2. Select the GitHub repository.
3. Keep the detected framework as **Next.js**.
4. Click **Deploy**.
5. No private key or server secret is required for the browser Connect demo.

Optional environment variable:

`NEXT_PUBLIC_SPHERE_WALLET_URL=https://sphere.unicity.network`

The app already uses this URL by default, so the variable can normally be skipped.

## Sphere wallet

The demo targets `SPHERE_NETWORKS.testnet2` and requests these minimum Connect permissions:

- `identity:read`
- `balance:read`
- `history:read`
- `transfer:request`
- `sign:request`

Install or open a Sphere wallet and use a compatible testnet2 identity before testing the payment flow.

## Payment safety

The UI converts the human-readable UCT amount into token base units using the decimals returned by the connected wallet before creating the payment intent.

If the wallet reports an **unknown intent outcome**, NEXUS does not automatically submit another payment. This avoids accidental duplicate transfers. Production versions should reconcile the original transfer by transfer ID before allowing any retry.

## Production roadmap

- Replace the demo inventory model with a real inventory API.
- Add an LLM planner with structured tool calls.
- Add supplier discovery and identity resolution.
- Add durable order/payment reconciliation.
- Add policy controls such as maximum spend per day and approved suppliers.
- Add a backend worker for scheduled monitoring.

## Official resources

- Sphere SDK: https://github.com/unicity-sphere/sphere-sdk
- Sphere Connect reference: https://github.com/unicity-sphere/sphere-sdk/blob/main/docs/CONNECT.md
- Connect examples: https://github.com/unicity-sphere/sphere-sdk-connect-example
- Sphere wallet: https://sphere.unicity.network/
- Unicity: https://www.unicity.ai/
